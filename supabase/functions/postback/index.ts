// ============================================================
// MasterGame — postback receiver (Supabase Edge Function / Deno)
//
// 広告主・ネットワークからの S2S postback を受け、署名検証のうえ
// confirm_postback RPC（冪等・attribution・付与）を呼ぶ。
//
// 受信例:
//   POST /functions/v1/postback
//   body: { partner, transaction_id, click_id, reward?, timestamp, signature }
//   または GET /functions/v1/postback?partner=..&transaction_id=..&click_id=..&ts=..&sig=..
//
// 署名: HMAC-SHA256( `${partner}:${transaction_id}:${click_id}:${reward}:${timestamp}`, secret ) の hex
//   - reward / timestamp を署名対象に含める（額の改竄・リプレイを防ぐ）
//   - timestamp は unix 秒。±300s を超えるものは拒否（リプレイ対策）
// secret: `POSTBACK_SECRET_<PARTNER>`（パートナー毎に必須。共通鍵フォールバックは無し）
//   → `supabase secrets set POSTBACK_SECRET_APPLOVIN=...`
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は実行環境に自動注入される。
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { hmacHex, timingSafeEqual } from "../_shared/verify.ts";
import { cors, json } from "../_shared/cors.ts";

const TIMESTAMP_SKEW_SEC = 300;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = new URL(req.url);
    const q = url.searchParams;
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { /* GET互換 / 空ボディ許容 */ }
    }
    const get = (k: string): string =>
      (typeof body[k] === "string" || typeof body[k] === "number" ? String(body[k]) : "") || q.get(k) || "";

    const partner = get("partner");
    const txn = get("transaction_id") || get("txn");
    const clickId = get("click_id") || get("cid");
    const rewardRaw = get("reward");
    const ts = get("timestamp") || get("ts") || req.headers.get("x-timestamp") || "";
    const sig = get("signature") || get("sig") || req.headers.get("x-signature") || "";

    if (!partner || !txn) return json({ status: "rejected", reason: "missing_params" }, 400);

    // ---- リプレイ対策: timestamp 必須・±300s ----
    const tsNum = Number(ts);
    if (!ts || !Number.isFinite(tsNum)) {
      return json({ status: "rejected", reason: "missing_timestamp" }, 400);
    }
    if (Math.abs(Date.now() / 1000 - tsNum) > TIMESTAMP_SKEW_SEC) {
      return json({ status: "rejected", reason: "stale_timestamp" }, 401);
    }

    // ---- reward は署名対象に含めたうえで数値検証 ----
    let reward: number | null = null;
    if (rewardRaw !== "") {
      reward = Number(rewardRaw);
      if (!Number.isFinite(reward) || !Number.isInteger(reward) || reward <= 0) {
        return json({ status: "rejected", reason: "invalid_reward" }, 400);
      }
    }

    // ---- 署名検証（パートナー毎の secret。共通鍵フォールバックは廃止） ----
    const envKey = `POSTBACK_SECRET_${partner.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    const secret = Deno.env.get(envKey) ?? "";
    if (!secret) return json({ status: "error", reason: "no_secret_configured" }, 500);

    const expected = await hmacHex(secret, `${partner}:${txn}:${clickId}:${rewardRaw}:${ts}`);
    if (!timingSafeEqual(expected, sig.toLowerCase())) {
      return json({ status: "rejected", reason: "bad_signature" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // ---- パートナー状態 / IP 許可リスト ----
    const sourceIp = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    const { data: partnerRow, error: pErr } = await supabase
      .from("ad_partners")
      .select("status, allowed_ips")
      .eq("slug", partner)
      .maybeSingle();
    if (pErr) return json({ status: "error", reason: pErr.message }, 500);
    if (!partnerRow) return json({ status: "rejected", reason: "unknown_partner" }, 401);
    if (partnerRow.status !== "active") {
      return json({ status: "rejected", reason: "partner_suspended" }, 403);
    }
    const allowedIps: string[] | null = partnerRow.allowed_ips;
    if (allowedIps && allowedIps.length > 0 && !allowedIps.includes(sourceIp)) {
      return json({ status: "rejected", reason: "ip_not_allowed" }, 403);
    }

    // ---- 冪等な付与（DB側 RPC。partner status / reward 上限は DB 側でも再検証） ----
    const { data, error } = await supabase.rpc("confirm_postback", {
      p_partner_slug: partner,
      p_transaction_id: txn,
      p_click_id: clickId || null,
      p_reward_override: reward,
      p_raw: {
        source: "edge",
        ip: sourceIp || null,
        ua: req.headers.get("user-agent"),
        ts: tsNum,
      },
    });

    if (error) return json({ status: "error", reason: error.message }, 500);
    // accepted / duplicate / rejected はいずれも 200（ネットワークの再送制御のため）
    return json(data, 200);
  } catch (e) {
    return json({ status: "error", reason: String(e) }, 500);
  }
});

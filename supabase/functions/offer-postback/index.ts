// ============================================================
// MasterGame — offerwall postback receiver (Supabase Edge Function / Deno)
//
// オファーウォール/動画リワードのネットワークからの S2S postback を受け、
// 署名検証のうえ confirm_offer RPC（冪等・日次上限・付与）を呼ぶ。
//
// 受信例:
//   POST /functions/v1/offer-postback
//   body: { network, network_txn_id, user_id, offer_id?, reward?, timestamp, signature }
//
// 署名: HMAC-SHA256(`${network}:${network_txn_id}:${user_id}:${reward}:${timestamp}`, secret) の hex
//   - reward / timestamp を署名対象に含める（額の改竄・リプレイを防ぐ）
//   - timestamp は unix 秒。±300s を超えるものは拒否。
// secret: `OFFER_SECRET_<NETWORK>`（ネットワーク毎に必須。共通鍵フォールバック無し）
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は実行環境に自動注入される。
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { hmacHex, timingSafeEqual } from "../_shared/verify.ts";
import { cors, json } from "../_shared/cors.ts";

const TIMESTAMP_SKEW_SEC = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    const network = get("network");
    const txn = get("network_txn_id") || get("txn");
    const userId = get("user_id") || get("uid");
    const offerId = get("offer_id") || get("oid");
    const rewardRaw = get("reward");
    const ts = get("timestamp") || get("ts") || req.headers.get("x-timestamp") || "";
    const sig = get("signature") || get("sig") || req.headers.get("x-signature") || "";

    if (!network || !txn || !userId) return json({ status: "rejected", reason: "missing_params" }, 400);
    if (!UUID_RE.test(userId)) return json({ status: "rejected", reason: "invalid_user" }, 400);

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

    // ---- 署名検証（ネットワーク毎の secret） ----
    const envKey = `OFFER_SECRET_${network.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    const secret = Deno.env.get(envKey) ?? "";
    if (!secret) return json({ status: "error", reason: "no_secret_configured" }, 500);

    const expected = await hmacHex(secret, `${network}:${txn}:${userId}:${rewardRaw}:${ts}`);
    if (!timingSafeEqual(expected, sig.toLowerCase())) {
      return json({ status: "rejected", reason: "bad_signature" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await supabase.rpc("confirm_offer", {
      p_network_code: network,
      p_network_txn_id: txn,
      p_user: userId,
      p_offer_external_id: offerId || null,
      p_reward_override: reward,
    });

    if (error) {
      console.error("[offer-postback] confirm_offer failed:", error.message);
      return json({ status: "error", reason: "internal_error" }, 500);
    }
    // accepted / duplicate / rejected はいずれも 200（ネットワークの再送制御のため）
    return json(data, 200);
  } catch (e) {
    console.error("[offer-postback] unhandled error:", e);
    return json({ status: "error", reason: "internal_error" }, 500);
  }
});

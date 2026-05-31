// ============================================================
// MasterGame — postback receiver (Supabase Edge Function / Deno)
//
// 広告主・ネットワークからの S2S postback を受け、署名検証のうえ
// confirm_postback RPC（冪等・attribution・付与）を呼ぶ。
//
// 受信例:
//   POST /functions/v1/postback
//   body: { partner, transaction_id, click_id, reward?, signature }
//   または GET /functions/v1/postback?partner=..&transaction_id=..&click_id=..&sig=..
//
// 署名: HMAC-SHA256( `${partner}:${transaction_id}:${click_id}`, secret ) の hex
// secret: `POSTBACK_SECRET_<PARTNER>`（無ければ `POSTBACK_SECRET`）
//   → `supabase secrets set POSTBACK_SECRET_APPLOVIN=...`
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は実行環境に自動注入される。
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { hmacHex, timingSafeEqual } from "../_shared/verify.ts";
import { cors, json } from "../_shared/cors.ts";

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
      (body[k] as string) ?? q.get(k) ?? "";

    const partner = get("partner");
    const txn = get("transaction_id") || get("txn");
    const clickId = get("click_id") || get("cid");
    const reward = get("reward");
    const sig = get("signature") || get("sig") || req.headers.get("x-signature") || "";

    if (!partner || !txn) return json({ status: "rejected", reason: "missing_params" }, 400);

    // ---- 署名検証 ----
    const envKey = `POSTBACK_SECRET_${partner.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    const secret = Deno.env.get(envKey) ?? Deno.env.get("POSTBACK_SECRET") ?? "";
    if (!secret) return json({ status: "error", reason: "no_secret_configured" }, 500);

    const expected = await hmacHex(secret, `${partner}:${txn}:${clickId}`);
    if (!timingSafeEqual(expected, sig)) {
      return json({ status: "rejected", reason: "bad_signature" }, 401);
    }

    // ---- 冪等な付与（DB側 RPC） ----
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await supabase.rpc("confirm_postback", {
      p_partner_slug: partner,
      p_transaction_id: txn,
      p_click_id: clickId || null,
      p_reward_override: reward ? Number(reward) : null,
      p_raw: {
        source: "edge",
        ip: req.headers.get("x-forwarded-for"),
        ua: req.headers.get("user-agent"),
      },
    });

    if (error) return json({ status: "error", reason: error.message }, 500);
    // accepted / duplicate / rejected はいずれも 200（ネットワークの再送制御のため）
    return json(data, 200);
  } catch (e) {
    return json({ status: "error", reason: String(e) }, 500);
  }
});

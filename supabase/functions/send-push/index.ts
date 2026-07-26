// ============================================================
// MasterGame — send-push (Supabase Edge Function / Deno)
//
// 指定ユーザーの push_tokens を引き、Expo Push API へ通知を送る。
// service_role からのみ呼ぶ想定（運営バッチ / 他の Edge Function / DB Webhook）。
//
//   POST /functions/v1/send-push
//   body: { user_id: uuid, title: string, body: string, data?: object }
//   認可: Authorization: Bearer <SERVICE_ROLE_KEY>（未一致は 401）
//
// Expo Push API: https://docs.expo.dev/push-notifications/sending-notifications/
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { cors, json } from "../_shared/cors.ts";

const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // service_role 認可（漏洩防止のため詳細は返さない）
  const auth = req.headers.get("authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (auth !== `Bearer ${serviceKey}`) return json({ error: "unauthorized" }, 401);

  try {
    const { user_id, title, body, data } = await req.json().catch(() => ({}));
    if (!user_id || !title || !body) return json({ error: "missing_params" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: tokens, error } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", user_id);
    if (error) {
      console.error("[send-push] token lookup failed:", error.message);
      return json({ error: "internal_error" }, 500);
    }
    if (!tokens || tokens.length === 0) return json({ sent: 0, reason: "no_tokens" }, 200);

    // Expo は複数メッセージを配列で受け付ける
    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      title,
      body,
      data: data ?? {},
      sound: "default",
    }));

    const res = await fetch(EXPO_PUSH, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(messages),
    });
    const receipt = await res.json().catch(() => null);
    if (!res.ok) {
      console.error("[send-push] expo push failed:", res.status);
      return json({ error: "push_provider_error" }, 502);
    }
    return json({ sent: messages.length, receipt }, 200);
  } catch (e) {
    console.error("[send-push] unhandled error:", e);
    return json({ error: "internal_error" }, 500);
  }
});

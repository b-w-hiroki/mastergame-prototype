// Closed-test helper for the MVP offer loop.
// This function is disabled unless ENABLE_TEST_OFFERS=true and still requires
// a valid user JWT. It never accepts a user ID or reward amount from the client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { cors, json } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ status: "rejected", reason: "method_not_allowed" }, 405);
  if (Deno.env.get("ENABLE_TEST_OFFERS") !== "true") {
    return json({ status: "disabled", reason: "test_offers_disabled" }, 404);
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ status: "rejected", reason: "authentication_required" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ status: "rejected", reason: "invalid_session" }, 401);
    }

    const body = await req.json().catch(() => ({})) as { click_id?: string };
    const clickId = body.click_id?.trim() ?? "";
    if (!clickId) return json({ status: "rejected", reason: "missing_click_id" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: click, error: clickError } = await admin
      .from("mission_clicks")
      .select("click_id,user_id,partner_id")
      .eq("click_id", clickId)
      .eq("user_id", userData.user.id)
      .single();

    if (clickError || !click) {
      return json({ status: "rejected", reason: "click_not_owned" }, 404);
    }

    const { data: partner, error: partnerError } = await admin
      .from("ad_partners")
      .select("slug,postback_mode,status")
      .eq("id", click.partner_id)
      .single();

    if (
      partnerError ||
      !partner ||
      partner.slug !== "test-partner" ||
      partner.postback_mode !== "sandbox" ||
      partner.status !== "active"
    ) {
      return json({ status: "rejected", reason: "not_a_test_partner" }, 403);
    }

    // Stable transaction ID makes repeated button presses exercise idempotency.
    const transactionId = `test-${clickId}`;
    const { data, error } = await admin.rpc("confirm_postback", {
      p_partner_slug: partner.slug,
      p_transaction_id: transactionId,
      p_click_id: clickId,
      p_reward_override: null,
      p_raw: { source: "test-offer-complete", requested_by: userData.user.id },
    });

    if (error) return json({ status: "error", reason: error.message }, 500);
    return json(data, 200);
  } catch (error) {
    return json({ status: "error", reason: String(error) }, 500);
  }
});

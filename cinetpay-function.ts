// COLLYWOOD — Fonction CinetPay v2 (Supabase Edge Function)
// /init   : crée l'abonnement en attente + renvoie l'URL de paiement CinetPay (toutes formules)
// /notify : CinetPay confirme -> vérification + activation automatique avec la bonne durée
import { createClient } from "npm:@supabase/supabase-js@2";

const SB = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const APIKEY  = Deno.env.get("CINETPAY_APIKEY")!;
const SITE_ID = Deno.env.get("CINETPAY_SITE_ID")!;

// ── Formules : prix (USD) et durée (jours) ──
const PLANS: Record<string, { label: string; amount: number; days: number }> = {
  mois:   { label: "Mensuel",      amount: 3,   days: 30 },
  jour:   { label: "Pass journée", amount: 0.5, days: 1  },
  sem:    { label: "Pass semaine", amount: 1,   days: 7  },
  etu:    { label: "Étudiant",     amount: 2,   days: 30 },
  fam:    { label: "Famille",      amount: 5,   days: 30 },
  cadeau: { label: "Carte cadeau", amount: 3,   days: 30 },
};
const CURRENCY = "USD";                                   // passer à "CDF" si CinetPay refuse l'USD
const APP_URL  = "https://collywood-plus.com/";           // adresse de retour après paiement

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const path = new URL(req.url).pathname.split("/").pop();

  // ═══ 1) INIT ═══
  if (path === "init") {
    const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
    const { data: { user } } = await SB.auth.getUser(jwt);
    if (!user) return json({ error: "Connexion requise" }, 401);

    const body = await req.json().catch(() => ({}));
    const planId = PLANS[body.plan] ? body.plan : "mois";
    const plan = PLANS[planId];

    const { data: sub, error: e1 } = await SB.from("subscriptions")
      .insert({ user_id: user.id, plan_id: planId, status: "pending" })
      .select().single();
    if (e1) return json({ error: e1.message }, 400);

    const { data: pay, error: e2 } = await SB.from("payments")
      .insert({ user_id: user.id, subscription_id: sub.id, amount_usd: plan.amount, method: "mobile_money", status: "pending" })
      .select().single();
    if (e2) return json({ error: e2.message }, 400);

    const tid = "CW-" + pay.id;
    const r = await fetch("https://api-checkout.cinetpay.com/v2/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: APIKEY,
        site_id: SITE_ID,
        transaction_id: tid,
        amount: plan.amount,
        currency: CURRENCY,
        description: "COLLYWOOD — " + plan.label,
        notify_url: new URL(req.url).origin + "/functions/v1/cinetpay/notify",
        return_url: APP_URL + "?pay=done",
        channels: "MOBILE_MONEY",
        customer_name: user.email || "Client",
        customer_surname: "COLLYWOOD",
      }),
    });
    const j = await r.json();
    if (j?.data?.payment_url) return json({ payment_url: j.data.payment_url });
    return json({ error: j?.message || "Échec CinetPay", detail: j }, 400);
  }

  // ═══ 2) NOTIFY ═══
  if (path === "notify") {
    let tid: string | null = null;
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("json")) {
      const b = await req.json().catch(() => ({}));
      tid = b.cpm_trans_id || b.transaction_id || null;
    } else {
      const fd = await req.formData().catch(() => null);
      tid = (fd?.get("cpm_trans_id") || fd?.get("transaction_id") || null) as string | null;
    }
    if (!tid) return new Response("no transaction id", { status: 400 });

    const chk = await fetch("https://api-checkout.cinetpay.com/v2/payment/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: APIKEY, site_id: SITE_ID, transaction_id: String(tid) }),
    });
    const cj = await chk.json();
    const status = cj?.data?.status;
    const payId = String(tid).replace("CW-", "");

    if (status === "ACCEPTED") {
      const { data: pay } = await SB.from("payments")
        .update({ status: "success" }).eq("id", payId).select().single();
      if (pay?.subscription_id) {
        const { data: sub } = await SB.from("subscriptions")
          .select("plan_id").eq("id", pay.subscription_id).single();
        const days = PLANS[sub?.plan_id || "mois"]?.days ?? 30;
        await SB.from("subscriptions").update({
          status: "active",
          started_at: new Date().toISOString(),
          current_period_end: new Date(Date.now() + days * 864e5).toISOString(),
        }).eq("id", pay.subscription_id);
      }
    } else if (status === "REFUSED") {
      await SB.from("payments").update({ status: "failed" }).eq("id", payId);
    }
    return new Response("ok");
  }

  return new Response("not found", { status: 404 });
});

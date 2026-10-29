// Store emails through Resend (https://resend.com):
//   order_created  order confirmation to the customer + new-order alert to the owner (public; content comes from the DB)
//   order_status   "paid / dispatched / completed / cancelled" update to the customer (admin only)
//   newsletter     new products and offers to every subscriber (admin only)
//   test           a test message to the owner (admin only)
// Deploy:  supabase secrets set RESEND_API_KEY=re_... EMAIL_FROM="TechChampionStore <orders@yourdomain.com>" SITE_URL=https://yourdomain.com
//          (optional) supabase secrets set OWNER_EMAIL=you@example.com   (defaults to the email in Site settings)
//          supabase functions deploy send-email --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const FROM = Deno.env.get("EMAIL_FROM") ?? "TechChampionStore <onboarding@resend.dev>";
const SITE = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");

type Mail = { to: string; subject: string; html: string; reply_to?: string; headers?: Record<string, string> };

// Resend's batch endpoint takes up to 100 messages per call.
async function send(mails: Mail[]) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY is not set");
  let sent = 0;
  for (let i = 0; i < mails.length; i += 100) {
    const chunk = mails.slice(i, i + 100).map((m) => ({ from: FROM, ...m }));
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
    sent += chunk.length;
  }
  return sent;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const cedi = (n: unknown) => "GHS " + Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function layout(title: string, body: string, footer = "") {
  return `<!doctype html><html><body style="margin:0;background:#f4f7fc;font-family:Arial,Helvetica,sans-serif;color:#0a1633">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0a1633;padding:20px 28px;color:#fff;font-size:20px;font-weight:bold">TechChampion<span style="color:#4d93ff">Store</span></td></tr>
<tr><td style="padding:28px"><h1 style="margin:0 0 16px;font-size:22px">${esc(title)}</h1>${body}</td></tr>
<tr><td style="padding:16px 28px;background:#f2f7ff;font-size:12px;color:#475569">${footer || "TechChampionStore · IoT components, robot kits and 3D printing, delivered across Ghana."}</td></tr>
</table></td></tr></table></body></html>`;
}

function itemsTable(o: Record<string, any>) {
  const rows = (o.items ?? []).map((i: any) => `<tr><td style="padding:6px 0">${esc(i.qty)} × ${esc(i.name)}</td><td align="right">${cedi(i.qty * i.price)}</td></tr>`).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin:12px 0">${rows}
<tr><td style="padding:6px 0;color:#64748b">Subtotal</td><td align="right">${cedi(o.subtotal)}</td></tr>
<tr><td style="padding:6px 0;color:#64748b">Delivery: ${esc(o.delivery_option)}</td><td align="right">${Number(o.delivery_fee) ? cedi(o.delivery_fee) : "Free"}</td></tr>
<tr><td style="padding:8px 0;font-weight:bold;font-size:16px">Total</td><td align="right" style="font-weight:bold;font-size:16px">${cedi(o.total)}</td></tr></table>`;
}

async function settings() {
  const { data } = await db.from("site_settings").select("data").eq("id", 1).maybeSingle();
  return (data?.data ?? {}) as Record<string, any>;
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const userDb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data } = await userDb.rpc("is_admin");
  if (!data) throw Object.assign(new Error("Admin only"), { status: 403 });
}

const STATUS_TEXT: Record<string, [string, string]> = {
  paid: ["Payment received", "We have received your payment and are preparing your order."],
  dispatched: ["Your order is on its way", "Your order has been dispatched. We will call you when it reaches the delivery point."],
  completed: ["Order completed", "Your order is complete. Thank you for shopping with us! Reply to this email if anything is not right."],
  cancelled: ["Order cancelled", "Your order has been cancelled. If you already paid, we will contact you about a refund."],
};

async function orderCreated(code: string) {
  // Only fresh orders, and only once: notified_at is claimed before anything is sent.
  const since = new Date(Date.now() - 30 * 60e3).toISOString();
  const { data: o } = await db.from("orders").update({ notified_at: new Date().toISOString() })
    .eq("order_code", code).is("notified_at", null).gte("created_at", since).select().maybeSingle();
  if (!o) return 0;
  const s = await settings();
  const owner = Deno.env.get("OWNER_EMAIL") || s.email;
  const pay = (s.payment?.accounts ?? []).map((a: any) => `<li>${esc(a.provider)}: <b>${esc(a.account_number)}</b> (${esc(a.account_name)})</li>`).join("");
  const mails: Mail[] = [];
  if (owner) {
    mails.push({
      to: owner,
      subject: `New order ${o.order_code}: ${cedi(o.total)} from ${o.customer_name}`,
      reply_to: o.customer_email || undefined,
      html: layout(`New order ${o.order_code}`, `<p style="font-size:14px"><b>${esc(o.customer_name)}</b> · ${esc(o.customer_phone)}${o.customer_email ? ` · ${esc(o.customer_email)}` : ""}</p>
${itemsTable(o)}${o.customer_note ? `<p style="font-size:14px"><i>“${esc(o.customer_note)}”</i></p>` : ""}
${SITE ? `<p><a href="${SITE}/admin" style="color:#0a58e0;font-weight:bold">Open the admin dashboard</a></p>` : ""}`),
    });
  }
  if (o.customer_email) {
    mails.push({
      to: o.customer_email,
      subject: `Your TechChampionStore order ${o.order_code}`,
      reply_to: owner || undefined,
      html: layout(`Thanks for your order, ${o.customer_name.split(" ")[0]}!`, `<p style="font-size:14px">We have your order <b>${esc(o.order_code)}</b>. Please make sure you also pressed send on WhatsApp so we can confirm stock and delivery.</p>
${itemsTable(o)}${pay ? `<p style="font-size:14px">${esc(s.payment?.instructions ?? "Pay with Mobile Money:")}</p><ul style="font-size:14px">${pay}</ul><p style="font-size:13px;color:#64748b">Use ${esc(o.order_code)} as the payment reference.</p>` : ""}
<p style="font-size:14px">Questions? Reply to this email or WhatsApp ${esc(s.whatsapp_number ?? "")}.</p>`),
    });
  }
  return mails.length ? send(mails) : 0;
}

async function orderStatus(id: string, status: string) {
  const text = STATUS_TEXT[status];
  if (!text) return 0;
  const { data: o } = await db.from("orders").select("*").eq("id", id).maybeSingle();
  if (!o?.customer_email) return 0;
  const s = await settings();
  return send([{
    to: o.customer_email,
    subject: `${text[0]}: order ${o.order_code}`,
    reply_to: Deno.env.get("OWNER_EMAIL") || s.email || undefined,
    html: layout(text[0], `<p style="font-size:14px">Hi ${esc(o.customer_name.split(" ")[0])}, ${esc(text[1])}</p>${itemsTable(o)}`),
  }]);
}

async function newsletter(subject: string, message: string, productIds: string[]) {
  if (!subject?.trim() || !message?.trim()) throw Object.assign(new Error("Subject and message are required"), { status: 400 });
  const [{ data: subs }, { data: products }] = await Promise.all([
    db.from("subscribers").select("email,name,token").is("unsubscribed_at", null),
    productIds?.length ? db.from("products").select("name,slug,price,image_url,short_description").in("id", productIds.slice(0, 6)) : Promise.resolve({ data: [] }),
  ]);
  if (!subs?.length) return 0;
  const cards = (products ?? []).map((p: any) => `<tr><td style="padding:10px 0;border-top:1px solid #e2e8f0">
${p.image_url?.startsWith("http") ? `<img src="${esc(p.image_url)}" width="80" height="80" alt="" style="float:left;margin-right:12px;border-radius:10px;object-fit:cover">` : ""}
<a href="${SITE}/product/${esc(p.slug)}" style="color:#0a1633;font-weight:bold;font-size:15px;text-decoration:none">${esc(p.name)}</a>
<div style="color:#0a58e0;font-weight:bold;margin:4px 0">${cedi(p.price)}</div><div style="font-size:13px;color:#475569">${esc(p.short_description)}</div></td></tr>`).join("");
  const body = message.split(/\n{2,}/).map((para) => `<p style="font-size:14px;line-height:1.6">${esc(para).replace(/\n/g, "<br>")}</p>`).join("")
    + (cards ? `<table width="100%" cellpadding="0" cellspacing="0">${cards}</table>` : "")
    + (SITE ? `<p style="margin-top:20px"><a href="${SITE}/products" style="background:#0a58e0;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:bold">Shop now</a></p>` : "");
  return send(subs.map((sub: any) => {
    const unsub = `${SITE}/unsubscribe?token=${sub.token}`;
    return {
      to: sub.email,
      subject,
      headers: { "List-Unsubscribe": `<${unsub}>` },
      html: layout(subject, body, `You get these emails because you subscribed at TechChampionStore. <a href="${unsub}" style="color:#475569">Unsubscribe</a>.`),
    };
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    let sent = 0;
    if (body.type === "order_created") sent = await orderCreated(String(body.order_code ?? ""));
    else {
      await requireAdmin(req);
      if (body.type === "order_status") sent = await orderStatus(String(body.order_id), String(body.status));
      else if (body.type === "newsletter") sent = await newsletter(body.subject, body.message, body.product_ids ?? []);
      else if (body.type === "test") {
        const s = await settings();
        const to = Deno.env.get("OWNER_EMAIL") || s.email;
        sent = await send([{ to, subject: "TechChampionStore test email", html: layout("Email is working", `<p style="font-size:14px">Order confirmations, owner alerts and product updates will be sent from ${esc(FROM)}.</p>`) }]);
      } else return Response.json({ error: "Unknown email type" }, { status: 400, headers: cors });
    }
    return Response.json({ sent }, { headers: cors });
  } catch (err) {
    console.error(err);
    const status = (err as { status?: number }).status ?? 500;
    return Response.json({ error: (err as Error).message }, { status, headers: cors });
  }
});

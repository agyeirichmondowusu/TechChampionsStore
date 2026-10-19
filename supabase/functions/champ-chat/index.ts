// Meet Champ backend: a Supabase Edge Function that answers shoppers using Claude.
// Deploy:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (optional: CHAMP_MODEL)
//          supabase functions deploy champ-chat --no-verify-jwt
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const MODEL = Deno.env.get("CHAMP_MODEL") ?? "claude-opus-5-5";

async function storeContext(): Promise<string> {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const [{ data: products }, { data: settings }] = await Promise.all([
    db.from("products").select("name,slug,category,type,price,stock,short_description").eq("is_active", true).limit(400),
    db.from("site_settings").select("data").eq("id", 1).maybeSingle(),
  ]);
  const s = (settings?.data ?? {}) as Record<string, unknown>;
  const catalog = (products ?? [])
    .map((p) => `- ${p.name} | ${p.category}/${p.type} | GHS ${p.price} | ${p.stock > 0 ? `${p.stock} in stock` : "out of stock"} | /product/${p.slug} | ${p.short_description ?? ""}`)
    .join("\n");
  return [
    "Store settings (JSON):", JSON.stringify({
      phones: s.phones, email: s.email, whatsapp: s.whatsapp_number, delivery_options: s.delivery_options,
      return_policy_days: s.return_policy_days, payment: s.payment, address: s.address,
    }),
    "Catalog:", catalog,
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { messages } = await req.json();
    const history = (Array.isArray(messages) ? messages : [])
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-20);
    // The API needs the conversation to start with a user turn.
    while (history.length && history[0].role !== "user") history.shift();
    if (!history.length) return Response.json({ error: "No message" }, { status: 400, headers: cors });

    const system = `You are Champ, the friendly AI assistant of TechChampionStore, an electronics and robotics shop in Kumasi, Ghana (KNUST, College of Science).
You help customers pick IoT components (microcontrollers, sensors, actuators, power, 3D printers) and robot kits, explain wiring and code, and answer questions about prices, stock, delivery and payment.
Prices are in Ghana cedis (GHS, written ₵). Only quote prices and stock from the catalog below; if something is not listed, say so and suggest the closest item or WhatsApp contact.
Customers order by adding items to the cart and sending the order to the store on WhatsApp; no account is needed.
Your replies are often read aloud, so keep them conversational and short (2-5 sentences) unless the user asks for detail or code. Avoid markdown tables.

${await storeContext()}`;

    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system,
      messages: history,
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ reply: "Sorry, I can't help with that one. Ask me anything about our components, robots or orders!" }, { headers: cors });
    }
    const reply = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    return Response.json({ reply }, { headers: cors });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Champ is busy, please try again shortly." }, { status: 429, headers: cors });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      return Response.json({ error: "AI service error" }, { status: 502, headers: cors });
    }
    console.error(err);
    return Response.json({ error: "Server error" }, { status: 500, headers: cors });
  }
});

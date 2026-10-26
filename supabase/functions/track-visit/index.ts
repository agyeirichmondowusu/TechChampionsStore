// Visitor analytics: records one page view with an approximate location (country/region/city).
// The visitor's IP is used for the lookup and then dropped; it is never stored.
// Deploy:  supabase functions deploy track-visit --no-verify-jwt
// Optional: supabase secrets set IPAPI_KEY=...   (paid ipapi.co key; the free tier allows ~1,000 lookups a day,
//           and lookups happen once per visit, not per page view)
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|whatsapp|curl|wget|python|axios/i;

function parseAgent(ua: string) {
  const device = /ipad|tablet|kindle|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua)) ? "tablet" : /mobi|iphone|android/i.test(ua) ? "mobile" : "desktop";
  const browser = /edg\//i.test(ua) ? "Edge" : /opr\/|opera/i.test(ua) ? "Opera" : /samsungbrowser/i.test(ua) ? "Samsung Internet" : /firefox|fxios/i.test(ua) ? "Firefox" : /chrome|crios/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : "Other";
  const os = /android/i.test(ua) ? "Android" : /iphone|ipad|ipod/i.test(ua) ? "iOS" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "macOS" : /cros/i.test(ua) ? "ChromeOS" : /linux/i.test(ua) ? "Linux" : "Other";
  return { device, browser, os };
}

type Geo = { country?: string | null; country_code?: string | null; region?: string | null; city?: string | null; timezone?: string | null };

async function lookup(ip: string | null): Promise<Geo> {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return {};
  try {
    const key = Deno.env.get("IPAPI_KEY");
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/${key ? `?key=${key}` : ""}`, { signal: AbortSignal.timeout(2500) });
    const g = await res.json();
    if (g.error) return {};
    return { country: g.country_name ?? null, country_code: g.country_code ?? null, region: g.region ?? null, city: g.city ?? null, timezone: g.timezone ?? null };
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const ua = req.headers.get("user-agent") ?? "";
    if (BOT.test(ua)) return Response.json({ ok: true, skipped: "bot" }, { headers: cors });
    const body = await req.json();
    if (!UUID.test(body.visitor_id ?? "") || !UUID.test(body.session_id ?? "") || typeof body.path !== "string") {
      return Response.json({ error: "Bad request" }, { status: 400, headers: cors });
    }

    // Location is looked up once per session and reused for its later page views.
    const { data: prev } = await db.from("visits").select("country,country_code,region,city,timezone").eq("session_id", body.session_id).limit(1).maybeSingle();
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip");
    const geo: Geo = prev ?? (await lookup(ip));

    const { error } = await db.rpc("record_visit", {
      p: {
        visitor_id: body.visitor_id,
        session_id: body.session_id,
        path: body.path.slice(0, 300),
        referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 300) : null,
        language: typeof body.language === "string" ? body.language.slice(0, 20) : null,
        ...geo,
        timezone: geo.timezone ?? (typeof body.timezone === "string" ? body.timezone.slice(0, 60) : null),
        ...parseAgent(ua),
      },
    });
    if (error) throw error;
    return Response.json({ ok: true }, { headers: cors });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Server error" }, { status: 500, headers: cors });
  }
});

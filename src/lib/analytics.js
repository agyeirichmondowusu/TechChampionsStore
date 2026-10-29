import { supabase, isDemo } from './supabase'

// Privacy-friendly visit counting. Nothing is recorded until the visitor accepts the notice
// (or, in "notice" mode, until they have seen it and not opted out). Browsers that send
// Global Privacy Control are never tracked. The visitor id is random and holds no personal data.
const CONSENT = 'tcs_analytics_consent' // 'granted' | 'denied'
const VID = 'tcs_vid'
const SESSION = 'tcs_session_v'
const SESSION_GAP = 30 * 60e3

const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k, v) => { try { localStorage.setItem(k, v) } catch { /* storage blocked */ } }

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)))

export const getConsent = () => read(CONSENT)
export function setConsent(value) {
  write(CONSENT, value)
  if (value === 'denied') {
    try { localStorage.removeItem(VID); localStorage.removeItem(SESSION) } catch { /* ignore */ }
  }
  window.dispatchEvent(new Event('tcs-consent'))
}
export const gpcEnabled = () => typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true

export function trackingAllowed(mode) {
  if (gpcEnabled() || navigator.webdriver) return false
  const c = getConsent()
  return c === 'granted' || (mode === 'notice' && c !== 'denied')
}

function visitorId() {
  let id = read(VID)
  if (!id) { id = uuid(); write(VID, id) }
  return id
}

// A session continues while page views are less than 30 minutes apart, across tabs.
function sessionId() {
  let s = null
  try { s = JSON.parse(read(SESSION)) } catch { /* new session */ }
  const now = Date.now()
  if (!s || now - s.last > SESSION_GAP) s = { id: uuid(), last: now }
  s.last = now
  write(SESSION, JSON.stringify(s))
  return s.id
}

const externalReferrer = () => {
  try {
    if (!document.referrer) return null
    const u = new URL(document.referrer)
    return u.host === location.host ? null : u.host
  } catch {
    return null
  }
}

let lastPath = null
export function trackPageview(path) {
  if (path === lastPath) return
  lastPath = path
  const payload = {
    visitor_id: visitorId(),
    session_id: sessionId(),
    path,
    referrer: externalReferrer(),
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
  if (isDemo) return recordDemoVisit(payload)
  supabase.functions.invoke('track-visit', { body: payload }).catch(() => {})
}

// ---------- Demo mode: visits stay in this browser ----------
const DEMO_KEY = 'tcs_visits'
const demoVisits = () => { try { return JSON.parse(read(DEMO_KEY)) || [] } catch { return [] } }

function agent() {
  const ua = navigator.userAgent
  return {
    device: /ipad|tablet/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua)) ? 'tablet' : /mobi|iphone|android/i.test(ua) ? 'mobile' : 'desktop',
    browser: /edg\//i.test(ua) ? 'Edge' : /opr\//i.test(ua) ? 'Opera' : /firefox/i.test(ua) ? 'Firefox' : /chrome/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'Other',
    os: /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iOS' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : 'Other',
  }
}

// Without the edge function there is no IP lookup, so demo location comes from the browser's
// language region and time zone (e.g. en-GH + Africa/Accra gives Ghana / Accra).
function demoLocation(tz) {
  const region = (navigator.language.split('-')[1] || '').toUpperCase()
  let country = null
  try { country = region ? new Intl.DisplayNames(['en'], { type: 'region' }).of(region) : null } catch { /* unknown */ }
  return { country, country_code: region || null, region: null, city: tz?.includes('/') ? tz.split('/').pop().replace(/_/g, ' ') : null }
}

function recordDemoVisit(p) {
  const list = demoVisits()
  list.unshift({ id: Date.now(), ...p, ...demoLocation(p.timezone), ...agent(), created_at: new Date().toISOString() })
  write(DEMO_KEY, JSON.stringify(list.slice(0, 5000)))
}

// ---------- Admin: load raw rows for the dashboard ----------
// Supabase returns at most 1,000 rows per request, so page through them.
async function pageAll(build, max = 50000) {
  const out = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

export async function loadAnalytics(days) {
  const since = new Date(Date.now() - days * 86400e3)
  if (isDemo) {
    const all = demoVisits()
    const first = {}
    for (const v of all) first[v.visitor_id] = v.created_at // list is newest first, so the last write is the earliest
    const visits = all.filter((v) => new Date(v.created_at) >= since)
    const ids = new Set(visits.map((v) => v.visitor_id))
    return { since, visits, visitors: [...ids].map((id) => ({ id, first_seen: first[id] })) }
  }
  const iso = since.toISOString()
  const [visits, visitors] = await Promise.all([
    pageAll(() => supabase.from('visits').select('visitor_id,session_id,path,referrer,country,country_code,region,city,device,browser,os,created_at').gte('created_at', iso).order('created_at', { ascending: false })),
    pageAll(() => supabase.from('visitors').select('id,first_seen,last_seen,sessions,pageviews').gte('last_seen', iso)),
  ])
  return { since, visits, visitors }
}

import { useEffect, useMemo, useState } from 'react'
import { Download, Globe2, MonitorSmartphone, RefreshCw } from 'lucide-react'
import { loadAnalytics } from '../lib/analytics'
import { isDemo } from '../lib/supabase'

const RANGES = [7, 30, 90, 365]
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const place = (v) => [v.city, v.country].filter(Boolean).join(', ') || 'Unknown'

const countBy = (rows, key, weight = () => 1) => {
  const m = new Map()
  for (const r of rows) {
    const k = key(r)
    m.set(k, (m.get(k) || 0) + weight(r))
  }
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
}

// Turns raw page views into sessions, visitors and the dashboard's tallies.
function summarize({ since, visits, visitors }, days) {
  const firstSeen = new Map(visitors.map((v) => [v.id, new Date(v.first_seen)]))
  const sessions = new Map()
  for (let i = visits.length - 1; i >= 0; i--) {
    const v = visits[i]
    let s = sessions.get(v.session_id)
    if (!s) {
      s = { id: v.session_id, visitor_id: v.visitor_id, start: new Date(v.created_at), pages: [], place: place(v), country: v.country || 'Unknown', device: v.device || 'Unknown', browser: v.browser || 'Unknown', os: v.os || 'Unknown', source: v.referrer || 'Direct' }
      sessions.set(v.session_id, s)
    }
    s.pages.push(v.path)
    s.end = new Date(v.created_at)
  }
  const list = [...sessions.values()]

  const people = new Map()
  for (const s of list) {
    const p = people.get(s.visitor_id) || { id: s.visitor_id, sessions: 0, pageviews: 0, last: s.start, place: s.place, country: s.country }
    p.sessions += 1
    p.pageviews += s.pages.length
    if (s.start > p.last) { p.last = s.start; p.place = s.place; p.country = s.country }
    people.set(s.visitor_id, p)
  }
  const unique = people.size
  const isNew = (id) => !firstSeen.has(id) || firstSeen.get(id) >= since
  const newCount = [...people.keys()].filter(isNew).length

  // Daily visitors, oldest to newest.
  const daily = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i)
    daily.push({ key: dayKey(d), date: d, visitors: new Set(), sessions: 0, pageviews: 0 })
  }
  const byDay = new Map(daily.map((d) => [d.key, d]))
  for (const s of list) {
    const d = byDay.get(dayKey(s.start))
    if (!d) continue
    d.visitors.add(s.visitor_id); d.sessions += 1; d.pageviews += s.pages.length
  }

  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, sessions: 0 }))
  for (const s of list) hours[s.start.getHours()].sessions += 1

  const freq = [['Once', 1, 1], ['2 to 3 times', 2, 3], ['4 to 9 times', 4, 9], ['10+ times', 10, Infinity]]
    .map(([label, lo, hi]) => ({ label, value: [...people.values()].filter((p) => p.sessions >= lo && p.sessions <= hi).length }))

  const visitorCountry = countBy([...people.values()], (p) => p.country)
  return {
    unique, newCount, returning: unique - newCount, sessions: list.length, pageviews: visits.length,
    perVisitor: unique ? list.length / unique : 0,
    pagesPerVisit: list.length ? visits.length / list.length : 0,
    today: daily[daily.length - 1]?.visitors.size || 0,
    daily: daily.map((d) => ({ ...d, visitors: d.visitors.size })),
    hours, freq,
    countries: visitorCountry,
    cities: countBy([...people.values()], (p) => p.place),
    pages: countBy(visits, (v) => v.path),
    sources: countBy(list, (s) => s.source),
    devices: countBy(list, (s) => s.device),
    browsers: countBy(list, (s) => `${s.browser} on ${s.os}`),
    recent: list.sort((a, b) => b.start - a.start).slice(0, 60).map((s) => ({ ...s, visits: people.get(s.visitor_id).sessions, isNew: isNew(s.visitor_id) })),
  }
}

export default function AdminAnalytics() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setBusy(true)
    setError('')
    try {
      setData(await loadAnalytics(days))
    } catch (e) {
      setError(/does not exist|schema cache|PGRST205|42P01/.test(`${e.message} ${e.code}`) ? 'The analytics tables are missing. Run supabase/migrations/0003_analytics_and_email.sql in the Supabase SQL editor.' : e.message)
    }
    setBusy(false)
  }
  useEffect(() => { load() }, [days]) // eslint-disable-line react-hooks/exhaustive-deps

  const s = useMemo(() => (data ? summarize(data, days) : null), [data, days])
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const downloadCsv = () => {
    const cols = ['created_at', 'visitor_id', 'session_id', 'path', 'referrer', 'country', 'region', 'city', 'device', 'browser', 'os']
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [cols.join(','), ...data.visits.map((v) => cols.map((c) => esc(v[c])).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `visits-last-${days}-days.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full bg-white p-1 shadow-card">
          {RANGES.map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${days === d ? 'bg-navy-900 text-white' : 'text-navy-800 hover:bg-brand-50'}`}>
              {d === 365 ? '12 months' : `${d} days`}
            </button>
          ))}
        </div>
        <button onClick={load} disabled={busy} className="btn-ghost py-1.5"><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Refresh</button>
        {data?.visits.length > 0 && <button onClick={downloadCsv} className="btn-ghost py-1.5"><Download size={14} /> Download CSV</button>}
        <p className="ml-auto text-xs text-slate-500">Times in {tz}. Admin visits are not counted.</p>
      </div>

      {isDemo && <p className="rounded-xl bg-brand-50 p-3 text-sm text-navy-800">Demo mode: only visits from this browser are counted, and location is guessed from the browser's language and time zone. With Supabase and the <code>track-visit</code> function deployed, every visitor is counted and located by IP (country and city).</p>}
      {error && <p className="rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-800">{error}</p>}
      {!s && !error && <p className="py-10 text-center text-slate-500">Loading visitor data…</p>}

      {s && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Visitors" value={s.unique} note={`${s.today} today`} />
            <Tile label="New visitors" value={s.newCount} note={`${pct(s.newCount, s.unique)}% of visitors`} />
            <Tile label="Returning visitors" value={s.returning} note={`${pct(s.returning, s.unique)}% came back`} />
            <Tile label="Visits" value={s.sessions} note={`${s.perVisitor.toFixed(1)} per visitor · ${s.pagesPerVisit.toFixed(1)} pages each`} />
          </div>

          <Card title="Visitors per day" subtitle={`${s.pageviews.toLocaleString()} page views in this period`}>
            <Bars
              data={s.daily.map((d) => ({ value: d.visitors, label: d.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), tip: `${d.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}: ${d.visitors} visitors, ${d.sessions} visits, ${d.pageviews} page views` }))}
              unit="visitors"
            />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Time of visit" subtitle="Visits by hour they started">
              <Bars data={s.hours.map((h) => ({ value: h.sessions, label: hourLabel(h.hour), tip: `${hourLabel(h.hour)} to ${hourLabel((h.hour + 1) % 24)}: ${h.sessions} visits` }))} unit="visits" />
            </Card>
            <Card title="How often people visit" subtitle="Visitors by number of visits in this period">
              <Ranked rows={s.freq} total={s.unique} unit="visitors" keepOrder />
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Countries" Icon={Globe2}><Ranked rows={s.countries} total={s.unique} unit="visitors" /></Card>
            <Card title="Cities" Icon={Globe2}><Ranked rows={s.cities} total={s.unique} unit="visitors" /></Card>
            <Card title="Top pages"><Ranked rows={s.pages} total={s.pageviews} unit="views" mono /></Card>
            <Card title="Where they came from"><Ranked rows={s.sources} total={s.sessions} unit="visits" /></Card>
            <Card title="Devices" Icon={MonitorSmartphone}><Ranked rows={s.devices} total={s.sessions} unit="visits" /></Card>
            <Card title="Browsers"><Ranked rows={s.browsers} total={s.sessions} unit="visits" /></Card>
          </div>

          <Card title="Recent visits" subtitle="Latest 60 visits, newest first">
            {s.recent.length ? (
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="p-3">When</th><th className="p-3">Visitor</th><th className="p-3">Location</th><th className="p-3">Pages</th><th className="p-3">Device</th><th className="p-3">From</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.recent.map((r) => (
                      <tr key={r.id} className="align-top">
                        <td className="whitespace-nowrap p-3">{r.start.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                        <td className="whitespace-nowrap p-3">
                          <span className="font-mono text-xs">#{r.visitor_id.slice(0, 6)}</span>{' '}
                          <span className="chip">{r.isNew && r.visits === 1 ? 'New' : `${r.visits} visits`}</span>
                        </td>
                        <td className="p-3">{r.place}</td>
                        <td className="max-w-xs p-3"><span className="font-semibold">{r.pages.length}</span> <span className="text-xs text-slate-500">{[...new Set(r.pages)].slice(0, 4).join(', ')}{new Set(r.pages).size > 4 ? '…' : ''}</span></td>
                        <td className="whitespace-nowrap p-3 capitalize">{r.device} · {r.browser}</td>
                        <td className="p-3">{r.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-slate-500">No visits in this period yet.</p>}
          </Card>
        </>
      )}
    </div>
  )
}

const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`

const Tile = ({ label, value, note }) => (
  <div className="card p-5">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 font-display text-3xl font-black text-navy-900">{value.toLocaleString()}</p>
    <p className="mt-1 text-xs text-slate-500">{note}</p>
  </div>
)

const Card = ({ title, subtitle, Icon, children }) => (
  <section className="card p-5">
    <h3 className="flex items-center gap-2 font-bold">{Icon && <Icon size={16} className="text-brand-600" />} {title}</h3>
    {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
    <div className="mt-4">{children}</div>
  </section>
)

// Single-series column chart. The whole column is the hover target; the readout sits above the plot.
function Bars({ data, unit }) {
  const [hover, setHover] = useState(null)
  const peak = Math.max(0, ...data.map((d) => d.value))
  const max = Math.max(1, peak)
  const ticks = data.length <= 24 ? [0, Math.floor(data.length / 2), data.length - 1] : [0, Math.floor(data.length / 3), Math.floor((2 * data.length) / 3), data.length - 1]
  return (
    <div>
      <p className="h-5 text-xs text-slate-600">{hover != null ? data[hover].tip : peak ? `Peak ${peak.toLocaleString()} ${unit}. Hover a bar for details.` : `No ${unit} in this period yet.`}</p>
      <div className="relative mt-2 h-40 border-b border-slate-200">
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-slate-100" />
        <span className="pointer-events-none absolute -top-2 right-0 bg-white pl-1 text-[10px] text-slate-400">{max.toLocaleString()}</span>
        <div className="flex h-full items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
          {data.map((d, i) => (
            <div key={i} className="flex h-full flex-1 cursor-default items-end" onMouseEnter={() => setHover(i)} title={d.tip}>
              <div
                className={`w-full rounded-t-[4px] transition-colors ${hover === i ? 'bg-navy-800' : 'bg-brand-600'}`}
                style={{ height: d.value ? `${Math.max(2, (d.value / max) * 100)}%` : 0 }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-slate-400">
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full" style={{ left: `${((t + 0.5) / data.length) * 100}%` }}>{data[t]?.label}</span>
        ))}
      </div>
    </div>
  )
}

function Ranked({ rows, total, unit, mono, keepOrder }) {
  const [all, setAll] = useState(false)
  if (!rows.length || !total) return <p className="text-sm text-slate-500">No data yet.</p>
  const shown = all || keepOrder ? rows : rows.slice(0, 8)
  const max = Math.max(...rows.map((r) => r.value))
  return (
    <div className="space-y-1.5">
      {shown.map((r) => (
        <div key={r.label} className="relative overflow-hidden rounded-lg px-3 py-1.5 text-sm" title={`${r.value} ${unit} (${pct(r.value, total)}%)`}>
          <div className="absolute inset-y-0 left-0 rounded-lg bg-brand-100" style={{ width: `${(r.value / max) * 100}%` }} />
          <div className="relative flex justify-between gap-3">
            <span className={`truncate ${mono ? 'font-mono text-xs leading-5' : ''}`}>{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">{r.value.toLocaleString()} <span className="text-xs font-normal text-slate-500">{pct(r.value, total)}%</span></span>
          </div>
        </div>
      ))}
      {!keepOrder && rows.length > 8 && <button onClick={() => setAll(!all)} className="text-xs font-semibold text-brand-700">{all ? 'Show less' : `Show all ${rows.length}`}</button>}
    </div>
  )
}

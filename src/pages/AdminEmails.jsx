import { useEffect, useMemo, useState } from 'react'
import { Download, Mail, Megaphone, Search, Send, Trash2, Users } from 'lucide-react'
import { useStore } from '../context/StoreContext'
import * as api from '../lib/api'
import { cedi } from '../lib/format'
import { isDemo } from '../lib/supabase'

export default function AdminEmails() {
  const { products, notify, settings } = useStore()
  const [subs, setSubs] = useState(null)
  const [form, setForm] = useState({ subject: '', message: '', product_ids: [] })
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  const [outbox, setOutbox] = useState(api.listOutbox)

  const load = () => api.listSubscribers().then(setSubs).catch(() => setSubs([]))
  useEffect(() => { load() }, [])
  const active = (subs || []).filter((s) => !s.unsubscribed_at)
  const matches = useMemo(() => products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 30), [products, q])

  const run = async (label, fn) => {
    setBusy(label)
    try {
      const r = await fn()
      if (r?.demo) notify('Demo mode: logged to the outbox below, nothing was sent')
      else notify(`Sent ${r?.sent ?? 0} email(s)`)
      setOutbox(api.listOutbox())
      return true
    } catch (e) {
      alert(`Email failed: ${e.message}`)
      return false
    } finally {
      setBusy('')
    }
  }

  const sendNewsletter = async (e) => {
    e.preventDefault()
    if (!confirm(`Send “${form.subject}” to ${active.length} subscriber(s)? This cannot be undone.`)) return
    if (await run('newsletter', () => api.sendEmail({ type: 'newsletter', ...form, to: `${active.length} subscribers` }))) setForm({ subject: '', message: '', product_ids: [] })
  }

  const toggle = (id) => setForm((f) => ({ ...f, product_ids: f.product_ids.includes(id) ? f.product_ids.filter((x) => x !== id) : [...f.product_ids, id].slice(0, 6) }))

  const remove = async (s) => {
    if (!confirm(`Remove ${s.email} from the list?`)) return
    await api.deleteSubscriber(s.id)
    load()
  }

  const downloadCsv = () => {
    const csv = ['email,name,source,subscribed,unsubscribed', ...(subs || []).map((s) => [s.email, s.name || '', s.source || '', s.created_at, s.unsubscribed_at || ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'subscribers.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h3 className="flex items-center gap-2 font-bold"><Mail size={18} className="text-brand-600" /> Automatic emails</h3>
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          <li>• <b>New order:</b> an alert to {settings.email || 'the store email'} and a confirmation to the customer when they give an email at checkout.</li>
          <li>• <b>Order status:</b> when you change an order to paid, dispatched, completed or cancelled, the customer gets an update.</li>
        </ul>
        {isDemo ? (
          <p className="mt-4 rounded-xl bg-brand-50 p-3 text-sm text-navy-800">Demo mode: emails are not sent. Each one is logged in the outbox at the bottom so you can see what would go out. To send for real, connect Supabase and deploy the <code>send-email</code> function with a Resend key (see README).</p>
        ) : (
          <button disabled={!!busy} onClick={() => run('test', () => api.sendEmail({ type: 'test' }))} className="btn-ghost mt-4"><Send size={15} /> {busy === 'test' ? 'Sending…' : `Send a test email to ${settings.email}`}</button>
        )}
      </section>

      <form onSubmit={sendNewsletter} className="card p-6">
        <h3 className="flex items-center gap-2 font-bold"><Megaphone size={18} className="text-brand-600" /> Send a product update</h3>
        <p className="mt-1 text-sm text-slate-500">Goes to {active.length} subscriber(s). Every email includes an unsubscribe link.</p>
        <div className="mt-4 grid gap-4">
          <div><label className="label">Subject</label><input required className="input" placeholder="New ESP32 boards just arrived" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
          <div><label className="label">Message</label><textarea required rows={5} className="input" placeholder="Leave a blank line between paragraphs." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
          <div>
            <label className="label">Feature products (up to 6, optional)</label>
            <div className="relative mb-2">
              <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-10" placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-slate-100 p-2 sm:grid-cols-2">
              {matches.map((p) => (
                <label key={p.id} className={`flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm ${form.product_ids.includes(p.id) ? 'bg-brand-50' : 'hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={form.product_ids.includes(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-brand-600" />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-slate-500">{cedi(p.price)}</span>
                </label>
              ))}
            </div>
            {form.product_ids.length > 0 && <p className="mt-1 text-xs text-slate-500">{form.product_ids.length} selected</p>}
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button disabled={!!busy || !active.length} className="btn-primary"><Send size={15} /> {busy === 'newsletter' ? 'Sending…' : `Send to ${active.length}`}</button>
        </div>
      </form>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <h3 className="flex items-center gap-2 font-bold"><Users size={18} className="text-brand-600" /> Subscribers</h3>
          <span className="text-sm text-slate-500">{active.length} active{subs && subs.length > active.length ? `, ${subs.length - active.length} unsubscribed` : ''}</span>
          {subs?.length > 0 && <button onClick={downloadCsv} className="btn-ghost ml-auto py-1.5"><Download size={14} /> CSV</button>}
        </div>
        {!subs ? <p className="p-6 text-sm text-slate-500">Loading…</p> : !subs.length ? (
          <p className="p-6 text-sm text-slate-500">No subscribers yet. People join from the footer form or the checkbox at checkout.</p>
        ) : (
          <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {subs.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className={`min-w-0 flex-1 truncate ${s.unsubscribed_at ? 'text-slate-400 line-through' : 'font-medium'}`}>{s.email}</span>
                <span className="hidden text-xs text-slate-500 sm:inline">{s.source} · {new Date(s.created_at).toLocaleDateString()}</span>
                <button onClick={() => remove(s)} className="rounded-full p-1.5 hover:bg-brand-50" aria-label="Remove"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      {isDemo && (
        <section className="card p-6">
          <h3 className="font-bold">Demo outbox</h3>
          {!outbox.length ? <p className="mt-2 text-sm text-slate-500">Nothing yet. Place a test order or change an order's status.</p> : (
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {outbox.map((m, i) => (
                <li key={i} className="flex flex-wrap gap-x-3 py-2">
                  <span className="text-slate-500">{new Date(m.at).toLocaleString()}</span>
                  <b>{{ order_created: 'Order confirmation + owner alert', order_status: `Status update: ${m.status}`, newsletter: `Update: ${m.subject}`, test: 'Test' }[m.type] || m.type}</b>
                  <span className="text-slate-600">{m.order_code || ''} {m.to ? `→ ${m.to}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Edit3, ImagePlus, LayoutGrid, Package, Plus, Save, Search, Settings, Trash2, Upload, Video, X } from 'lucide-react'
import { useStore } from '../context/StoreContext'
import * as api from '../lib/api'
import { CATEGORIES } from '../data/defaultSettings'
import { cedi, slugify, youtubeId } from '../lib/format'
import { isDemo } from '../lib/supabase'
import { SOCIALS } from '../components/SocialLinks'

const TABS = [
  { id: 'products', label: 'Products', Icon: Package },
  { id: 'videos', label: 'Videos', Icon: Video },
  { id: 'settings', label: 'Site settings', Icon: Settings },
  { id: 'orders', label: 'Orders', Icon: ClipboardList },
]

export default function Admin() {
  const { user, loading } = useStore()
  const [tab, setTab] = useState('products')

  if (loading) return <div className="container-x py-20 text-center text-slate-500">Loading…</div>
  if (!user?.isAdmin) {
    return (
      <div className="container-x grid place-items-center py-24 text-center">
        <h1 className="section-title">Admin access only</h1>
        <p className="mt-2 max-w-md text-slate-500">
          {user ? 'Your account is not an admin. Add its user id to the admins table in Supabase to grant access.' : 'Log in with an admin account to manage products and settings.'}
        </p>
        {!user && <Link to="/login" className="btn-primary mt-6">Login</Link>}
      </div>
    )
  }

  return (
    <div className="container-x py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="section-title">Admin dashboard</h1>
          <p className="text-sm text-slate-500">{isDemo ? 'Demo mode: changes are saved in this browser. Add Supabase keys to go live.' : 'Connected to Supabase.'}</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-card">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setTab(id)} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === id ? 'bg-brand-600 text-white' : 'text-navy-800 hover:bg-brand-50'}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'products' && <ProductsAdmin />}
      {tab === 'videos' && <VideosAdmin />}
      {tab === 'settings' && <SettingsAdmin />}
      {tab === 'orders' && <OrdersAdmin />}
    </div>
  )
}

// ---------------- Products ----------------
const EMPTY = { name: '', slug: '', category: 'microcontrollers', type: '', price: '', old_price: '', stock: '', short_description: '', description: '', specs: {}, image_url: '', gallery: [], video_url: '', is_active: true, featured: false, rating: 4.8, sold: 0 }

function ProductsAdmin() {
  const { refreshProducts, notify } = useStore()
  const [all, setAll] = useState([])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [editing, setEditing] = useState(null)

  const load = () => api.listProducts({ includeInactive: true }).then(setAll)
  useEffect(() => { load() }, [])

  const list = useMemo(() => all.filter((p) => (!cat || p.category === cat) && p.name.toLowerCase().includes(q.toLowerCase())), [all, q, cat])

  const remove = async (p) => {
    if (!confirm(`Delete “${p.name}”? This cannot be undone.`)) return
    await api.deleteProduct(p.id)
    await Promise.all([load(), refreshProducts()])
    notify('Product deleted')
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-11" placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={() => setEditing(EMPTY)} className="btn-primary"><Plus size={16} /> New product</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="p-3">Product</th><th className="p-3">Category / type</th><th className="p-3">Price</th><th className="p-3">Remaining</th><th className="p-3">Video</th><th className="p-3">Status</th><th className="p-3" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((p) => (
              <tr key={p.id} className="hover:bg-brand-50/40">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <img src={p.image_url} alt="" className="h-12 w-12 rounded-lg bg-brand-50 object-cover" />
                    <span className="max-w-xs font-semibold">{p.name}</span>
                  </div>
                </td>
                <td className="p-3 text-slate-600">{CATEGORIES.find((c) => c.id === p.category)?.name}<br /><span className="text-xs">{p.type}</span></td>
                <td className="p-3 font-semibold">{cedi(p.price)}</td>
                <td className="p-3"><span className={`chip ${p.stock < 10 ? 'bg-navy-900 text-white' : ''}`}>{p.stock}</span></td>
                <td className="p-3">{youtubeId(p.video_url) ? <span className="chip">Linked</span> : <span className="text-xs text-slate-400">None</span>}</td>
                <td className="p-3">{p.is_active ? <span className="chip">Live</span> : <span className="text-xs text-slate-400">Hidden</span>}</td>
                <td className="whitespace-nowrap p-3 text-right">
                  <button onClick={() => setEditing(p)} className="rounded-full p-2 hover:bg-brand-100" aria-label="Edit"><Edit3 size={16} /></button>
                  <button onClick={() => remove(p)} className="rounded-full p-2 hover:bg-brand-100" aria-label="Delete"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <ProductForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await Promise.all([load(), refreshProducts()])
            notify('Product saved')
          }}
        />
      )}
    </div>
  )
}

function ImageUpload({ folder, onUploaded, multiple, children }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const onChange = async (e) => {
    const files = [...e.target.files]
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    setErr('')
    try {
      for (const f of files) {
        if (isDemo && f.size > 1.5e6) throw new Error('Demo mode stores images in the browser; please use images under 1.5 MB.')
        onUploaded(await api.uploadImage(f, folder))
      }
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <label className="btn-ghost cursor-pointer">
        <Upload size={15} /> {busy ? 'Uploading…' : children}
        <input type="file" accept="image/*" multiple={multiple} className="hidden" onChange={onChange} disabled={busy} />
      </label>
      {err && <p className="mt-1 text-xs font-semibold text-brand-700">{err}</p>}
    </div>
  )
}

function ProductForm({ initial, onClose, onSaved }) {
  const [p, setP] = useState({ ...EMPTY, ...initial })
  const [specText, setSpecText] = useState(Object.entries(initial.specs || {}).map(([k, v]) => `${k}: ${v}`).join('\n'))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setP({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const specs = Object.fromEntries(specText.split('\n').map((l) => l.split(':')).filter((x) => x.length >= 2 && x[0].trim()).map(([k, ...v]) => [k.trim(), v.join(':').trim()]))
      await api.saveProduct({ ...p, slug: p.slug || slugify(p.name), specs })
      onSaved()
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  const vid = youtubeId(p.video_url)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy-950/50 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl animate-fadeIn">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <h2 className="text-lg font-bold">{initial.id ? 'Edit product' : 'New product'}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-brand-50" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label">Name</label><input required className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value, slug: initial.id ? p.slug : slugify(e.target.value) })} /></div>
            <div><label className="label">Category</label>
              <select className="input" value={p.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </div>
            <div><label className="label">Type</label><input className="input" placeholder="e.g. Development Board" value={p.type} onChange={set('type')} /></div>
            <div><label className="label">Price (₵)</label><input required type="number" min="0" step="0.01" className="input" value={p.price} onChange={set('price')} /></div>
            <div><label className="label">Old price (₵, optional)</label><input type="number" min="0" step="0.01" className="input" value={p.old_price ?? ''} onChange={set('old_price')} /></div>
            <div><label className="label">Remaining in stock</label><input required type="number" min="0" className="input" value={p.stock} onChange={set('stock')} /></div>
            <div><label className="label">URL slug</label><input className="input" value={p.slug} onChange={set('slug')} /></div>
          </div>

          <div>
            <label className="label">Main image</label>
            <div className="flex items-start gap-4">
              <div className="grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-2xl bg-brand-50">
                {p.image_url ? <img src={p.image_url} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="text-brand-300" />}
              </div>
              <div className="flex-1 space-y-2">
                <ImageUpload folder={p.category} onUploaded={(url) => setP((x) => ({ ...x, image_url: url }))}>Upload image</ImageUpload>
                <input className="input" placeholder="…or paste an image URL" value={p.image_url?.startsWith('data:') ? '' : p.image_url} onChange={set('image_url')} />
                <p className="text-xs text-slate-400">Saved to the “{p.category}” image folder.</p>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Extra gallery images</label>
            <div className="flex flex-wrap gap-2">
              {p.gallery.map((g, i) => (
                <div key={i} className="relative h-20 w-20 overflow-hidden rounded-xl bg-brand-50">
                  <img src={g} alt="" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setP({ ...p, gallery: p.gallery.filter((_, j) => j !== i) })} className="absolute right-1 top-1 rounded-full bg-white p-0.5 shadow" aria-label="Remove"><X size={12} /></button>
                </div>
              ))}
              <ImageUpload folder={p.category} multiple onUploaded={(url) => setP((x) => ({ ...x, gallery: [...x.gallery, url] }))}>Add images</ImageUpload>
            </div>
          </div>

          <div><label className="label">Short description (cards and quick view)</label><textarea rows={2} className="input" value={p.short_description} onChange={set('short_description')} /></div>
          <div><label className="label">Full description</label><textarea rows={5} className="input" value={p.description} onChange={set('description')} /></div>
          <div><label className="label">Specifications (one “Key: Value” per line)</label><textarea rows={4} className="input font-mono text-xs" value={specText} onChange={(e) => setSpecText(e.target.value)} /></div>

          <div>
            <label className="label">YouTube tutorial link</label>
            <input className="input" placeholder="https://www.youtube.com/watch?v=..." value={p.video_url} onChange={set('video_url')} />
            {p.video_url && (vid ? <img src={`https://i.ytimg.com/vi/${vid}/mqdefault.jpg`} alt="" className="mt-2 w-48 rounded-xl" /> : <p className="mt-1 text-xs font-semibold text-brand-700">That doesn't look like a YouTube link.</p>)}
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={p.is_active} onChange={set('is_active')} className="h-4 w-4 accent-brand-600" /> Visible in shop</label>
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={p.featured} onChange={set('featured')} className="h-4 w-4 accent-brand-600" /> Featured</label>
          </div>
          {err && <p className="rounded-xl bg-brand-50 p-3 text-sm font-medium text-brand-800">{err}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 p-5">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button disabled={busy} className="btn-primary"><Save size={16} /> {busy ? 'Saving…' : 'Save product'}</button>
        </div>
      </form>
    </div>
  )
}

// ---------------- Videos (quick edit of every product's tutorial link) ----------------
function VideosAdmin() {
  const { products, refreshProducts, notify, settings } = useStore()
  const [links, setLinks] = useState({})
  const [busy, setBusy] = useState(false)
  const changed = Object.keys(links).filter((id) => links[id] !== (products.find((p) => p.id === id)?.video_url || ''))

  const save = async () => {
    setBusy(true)
    for (const id of changed) await api.saveProduct({ ...products.find((p) => p.id === id), video_url: links[id] })
    await refreshProducts()
    setLinks({})
    setBusy(false)
    notify(`Saved ${changed.length} video link(s)`)
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <p className="text-sm text-slate-500">Paste a video from <a href={settings.youtube_channel} target="_blank" rel="noreferrer" className="font-semibold text-brand-700">your YouTube channel</a> for each component. It plays under the product.</p>
        <button disabled={!changed.length || busy} onClick={save} className="btn-primary"><Save size={16} /> Save {changed.length || ''} changes</button>
      </div>
      <div className="divide-y divide-slate-100">
        {products.map((p) => {
          const v = links[p.id] ?? p.video_url ?? ''
          const id = youtubeId(v)
          return (
            <div key={p.id} className="flex flex-wrap items-center gap-3 p-3">
              <img src={p.image_url} alt="" className="h-10 w-10 rounded-lg bg-brand-50 object-cover" />
              <span className="w-64 truncate text-sm font-semibold">{p.name}</span>
              <input className="input min-w-[240px] flex-1" placeholder="YouTube link" value={v} onChange={(e) => setLinks({ ...links, [p.id]: e.target.value })} />
              {id ? <img src={`https://i.ytimg.com/vi/${id}/default.jpg`} alt="" className="h-10 rounded" /> : <span className="w-[53px]" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------- Settings ----------------
const Section = ({ title, Icon, children }) => (
  <section className="card p-6">
    <h3 className="mb-4 flex items-center gap-2 font-bold">{Icon && <Icon size={18} className="text-brand-600" />} {title}</h3>
    {children}
  </section>
)

function SettingsAdmin() {
  const { settings, setSettings, notify } = useStore()
  const [s, setS] = useState(settings)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value })

  const save = async () => {
    setBusy(true)
    const clean = { ...s, grid_columns: Math.min(8, Math.max(1, Number(s.grid_columns) || 4)), grid_rows: Math.max(1, Number(s.grid_rows) || 4), return_policy_days: Number(s.return_policy_days) || 20, delivery_options: s.delivery_options.map((o) => ({ ...o, fee: Number(o.fee) || 0, id: o.id || slugify(o.label) })) }
    try {
      await api.saveSettings(clean)
      setSettings(clean)
      notify('Settings saved')
    } catch (e) {
      alert(e.message)
    }
    setBusy(false)
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Product grid" Icon={LayoutGrid}>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Columns</label><input type="number" min="1" max="8" className="input" value={s.grid_columns} onChange={set('grid_columns')} /></div>
            <div><label className="label">Rows per page</label><input type="number" min="1" className="input" value={s.grid_rows} onChange={set('grid_rows')} /></div>
          </div>
          <p className="mt-3 text-sm text-slate-500">Shows <b className="text-navy-900">{(Number(s.grid_columns) || 0) * (Number(s.grid_rows) || 0)}</b> items per page with Next / Previous buttons.</p>
        </Section>

        <Section title="Contact details">
          <div className="grid gap-4">
            <div><label className="label">Email</label><input className="input" value={s.email} onChange={set('email')} /></div>
            <div><label className="label">Phone numbers (comma separated)</label><input className="input" value={s.phones.join(', ')} onChange={(e) => setS({ ...s, phones: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></div>
            <div><label className="label">WhatsApp number for orders</label><input className="input" value={s.whatsapp_number} onChange={set('whatsapp_number')} /></div>
            <div><label className="label">Address</label><input className="input" value={s.address} onChange={set('address')} /></div>
          </div>
        </Section>

        <Section title="Social media links (footer)">
          <div className="grid gap-3">
            {SOCIALS.map(({ key, label, Icon }) => (
              <div key={key} className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy-900 text-white"><Icon /></span>
                <input className="input" placeholder={`${label} URL`} value={s.socials[key] || ''} onChange={(e) => setS({ ...s, socials: { ...s.socials, [key]: e.target.value } })} />
              </div>
            ))}
            <div><label className="label mt-2">YouTube channel (tutorial videos)</label><input className="input" value={s.youtube_channel} onChange={set('youtube_channel')} /></div>
          </div>
        </Section>

        <Section title="Store text and policy">
          <div className="grid gap-4">
            <div><label className="label">Tagline (hero and footer)</label><textarea rows={2} className="input" value={s.tagline} onChange={set('tagline')} /></div>
            <div><label className="label">Return policy (days)</label><input type="number" className="input" value={s.return_policy_days} onChange={set('return_policy_days')} /></div>
          </div>
        </Section>
      </div>

      <Section title="Payment accounts (shown at checkout)">
        <label className="label">Instructions</label>
        <textarea rows={2} className="input mb-4" value={s.payment.instructions} onChange={(e) => setS({ ...s, payment: { ...s.payment, instructions: e.target.value } })} />
        <ListEditor
          rows={s.payment.accounts}
          onChange={(accounts) => setS({ ...s, payment: { ...s.payment, accounts } })}
          blank={{ provider: '', account_name: '', account_number: '' }}
          fields={[['provider', 'Provider (e.g. MTN MoMo)'], ['account_name', 'Account name'], ['account_number', 'Account number']]}
        />
      </Section>

      <Section title="Delivery options">
        <ListEditor
          rows={s.delivery_options}
          onChange={(delivery_options) => setS({ ...s, delivery_options })}
          blank={{ id: '', label: '', fee: 0 }}
          fields={[['label', 'Option name', 'flex-[3]'], ['fee', 'Fee (₵)', 'flex-1', 'number']]}
        />
      </Section>

      <Section title="Hero background and Champ avatar" Icon={ImagePlus}>
        <p className="mb-3 text-sm text-slate-500">Hero images rotate behind “TechChampionStore” on the home page together with random product images.</p>
        <div className="mb-6 flex flex-wrap gap-2">
          {s.hero_images.map((g, i) => (
            <div key={i} className="relative h-20 w-32 overflow-hidden rounded-xl bg-brand-50">
              <img src={g} alt="" className="h-full w-full object-cover" />
              <button onClick={() => setS({ ...s, hero_images: s.hero_images.filter((_, j) => j !== i) })} className="absolute right-1 top-1 rounded-full bg-white p-0.5 shadow" aria-label="Remove"><X size={12} /></button>
            </div>
          ))}
          <ImageUpload folder="site" multiple onUploaded={(url) => setS((x) => ({ ...x, hero_images: [...x.hero_images, url] }))}>Add hero images</ImageUpload>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Champ avatar image (optional, replaces the built-in robot face)</label>
            <div className="flex items-center gap-3">
              {s.champ_avatar_url && <img src={s.champ_avatar_url} alt="" className="h-14 w-14 rounded-full object-cover" />}
              <ImageUpload folder="site" onUploaded={(url) => setS((x) => ({ ...x, champ_avatar_url: url }))}>Upload avatar</ImageUpload>
              {s.champ_avatar_url && <button onClick={() => setS({ ...s, champ_avatar_url: '' })} className="text-xs font-semibold text-slate-500">Use built-in</button>}
            </div>
          </div>
          <div><label className="label">Champ AI endpoint (optional override)</label><input className="input" placeholder="https://…/functions/v1/champ-chat" value={s.champ_api_url} onChange={set('champ_api_url')} /></div>
        </div>
      </Section>

      <div className="sticky bottom-4 flex justify-end">
        <button disabled={busy} onClick={save} className="btn-primary px-8 py-3"><Save size={16} /> {busy ? 'Saving…' : 'Save all settings'}</button>
      </div>
    </div>
  )
}

function ListEditor({ rows, onChange, blank, fields }) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          {fields.map(([k, ph, cls = 'flex-1', type = 'text']) => (
            <input key={k} type={type} placeholder={ph} className={`input min-w-[140px] ${cls}`} value={r[k]} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
          ))}
          <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="rounded-full p-2 hover:bg-brand-50" aria-label="Remove row"><Trash2 size={16} /></button>
        </div>
      ))}
      <button onClick={() => onChange([...rows, { ...blank }])} className="btn-ghost"><Plus size={15} /> Add</button>
    </div>
  )
}

// ---------------- Orders ----------------
const STATUSES = ['new', 'paid', 'dispatched', 'completed', 'cancelled']

function OrdersAdmin() {
  const [orders, setOrders] = useState(null)
  useEffect(() => { api.listOrders().then(setOrders).catch(() => setOrders([])) }, [])

  if (!orders) return <p className="text-slate-500">Loading orders…</p>
  if (!orders.length) return <div className="card p-10 text-center text-slate-500">No orders yet. Orders appear here when customers send them on WhatsApp.</div>

  const setStatus = async (o, status) => {
    await api.updateOrderStatus(o.id, status)
    setOrders(orders.map((x) => (x.id === o.id ? { ...x, status } : x)))
  }

  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <div key={o.id} className="card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <b className="font-mono">{o.order_code}</b>
            <span className="text-sm text-slate-500">{new Date(o.created_at).toLocaleString()}</span>
            <select value={o.status} onChange={(e) => setStatus(o, e.target.value)} className="input ml-auto w-auto py-1.5 text-xs font-semibold">
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <p className="mt-2 text-sm"><b>{o.customer_name}</b> · {o.customer_phone} · {o.delivery_option}</p>
          <ul className="mt-2 text-sm text-slate-600">
            {o.items.map((i) => <li key={i.id}>{i.qty} × {i.name} ({cedi(i.price)})</li>)}
          </ul>
          {o.customer_note && <p className="mt-1 text-sm italic text-slate-500">“{o.customer_note}”</p>}
          <p className="mt-2 text-right font-bold">Total {cedi(o.total)}</p>
        </div>
      ))}
    </div>
  )
}

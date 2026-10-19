import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, Minus, Plus, RotateCcw, ShieldCheck, ShoppingCart, Star, Truck, Zap } from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import { useStore } from '../context/StoreContext'
import { CATEGORIES } from '../data/defaultSettings'
import { cedi, waNumber } from '../lib/format'
import YouTubeEmbed from '../components/YouTubeEmbed'
import ProductCard from '../components/ProductCard'
import QuickView from '../components/QuickView'

export default function ProductDetail() {
  const { slug } = useParams()
  const { products, loading, addToCart, settings } = useStore()
  const navigate = useNavigate()
  const p = products.find((x) => x.slug === slug)
  const [qty, setQty] = useState(1)
  const [img, setImg] = useState(0)
  const [quick, setQuick] = useState(null)

  if (loading) return <div className="container-x py-20 text-center text-slate-500">Loading…</div>
  if (!p) {
    return (
      <div className="container-x py-20 text-center">
        <h1 className="section-title">Product not found</h1>
        <Link to="/products" className="btn-primary mt-6">Browse products</Link>
      </div>
    )
  }

  const images = [p.image_url, ...(p.gallery || [])].filter(Boolean)
  const cat = CATEGORIES.find((c) => c.id === p.category)
  const off = p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0
  const related = products.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 4)
  const out = p.stock <= 0
  const ask = `Hello TechChampionStore, I'm interested in ${p.name} (${cedi(p.price)}). Is it available?`

  return (
    <div className="container-x py-6">
      <nav className="mb-5 flex items-center gap-1 text-xs text-slate-500">
        <Link to="/" className="hover:text-brand-700">Home</Link><ChevronRight size={12} />
        <Link to={`/products?category=${p.category}`} className="hover:text-brand-700">{cat?.name}</Link><ChevronRight size={12} />
        <span className="truncate text-navy-800">{p.name}</span>
      </nav>

      <div className="grid gap-8 rounded-3xl bg-white p-4 shadow-card md:p-8 lg:grid-cols-2">
        <div>
          <div className="aspect-square overflow-hidden rounded-2xl bg-brand-50">
            <img src={images[img]} alt={p.name} className="h-full w-full object-cover" />
          </div>
          {images.length > 1 && (
            <div className="mt-3 flex gap-2">
              {images.map((src, i) => (
                <button key={src + i} onClick={() => setImg(i)} className={`h-20 w-20 overflow-hidden rounded-xl ring-2 ${i === img ? 'ring-brand-600' : 'ring-transparent'}`}>
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <div className="flex flex-wrap gap-2">
            <span className="chip">{cat?.name}</span>
            <span className="chip bg-navy-900 text-white">{p.type}</span>
          </div>
          <h1 className="mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">{p.name}</h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1 font-semibold text-brand-700">
              {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={14} className={i < Math.round(p.rating || 5) ? 'fill-brand-500 text-brand-500' : 'text-slate-300'} />)}
              {p.rating}
            </span>
            <span>{p.sold}+ sold</span>
          </div>

          <div className="mt-5 rounded-2xl bg-gradient-to-r from-brand-50 to-white p-5">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-black text-navy-900">{cedi(p.price)}</span>
              {off > 0 && (
                <>
                  <span className="text-slate-400 line-through">{cedi(p.old_price)}</span>
                  <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">-{off}%</span>
                </>
              )}
            </div>
            <p className={`mt-2 text-sm font-semibold ${out ? 'text-slate-500' : 'text-brand-700'}`}>
              {out ? 'Out of stock' : `${p.stock} units remaining`}
            </p>
          </div>

          <p className="mt-5 leading-relaxed text-slate-600">{p.short_description}</p>

          <div className="mt-6">
            <span className="label">Quantity</span>
            <div className="flex items-center gap-4">
              <div className="flex items-center rounded-full bg-slate-50 ring-1 ring-slate-200">
                <button onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1} className="grid h-12 w-12 place-items-center rounded-full text-navy-900 hover:bg-brand-100 disabled:opacity-40" aria-label="Decrease quantity">
                  <Minus size={18} />
                </button>
                <input
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Math.min(p.stock || 1, Number(e.target.value.replace(/\D/g, '')) || 1)))}
                  className="w-14 bg-transparent text-center text-lg font-bold outline-none"
                  aria-label="Quantity"
                />
                <button onClick={() => setQty(Math.min(p.stock, qty + 1))} disabled={qty >= p.stock} className="grid h-12 w-12 place-items-center rounded-full text-navy-900 hover:bg-brand-100 disabled:opacity-40" aria-label="Increase quantity">
                  <Plus size={18} />
                </button>
              </div>
              <span className="text-sm text-slate-500">Total: <b className="text-navy-900">{cedi(qty * p.price)}</b></span>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button disabled={out} onClick={() => addToCart(p, qty)} className="btn-ghost py-3.5 text-base">
              <ShoppingCart size={18} /> Add to cart
            </button>
            <button disabled={out} onClick={() => { addToCart(p, qty); navigate('/checkout') }} className="btn-primary py-3.5 text-base">
              <Zap size={18} /> Buy now
            </button>
          </div>
          <a href={`https://wa.me/${waNumber(settings.whatsapp_number)}?text=${encodeURIComponent(ask)}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center justify-center gap-2 text-sm font-semibold text-brand-700 hover:underline">
            <FaWhatsapp /> Ask about this item on WhatsApp
          </a>

          <ul className="mt-6 grid gap-3 border-t border-slate-100 pt-5 text-sm text-slate-600 sm:grid-cols-3">
            <li className="flex items-center gap-2"><Truck size={18} className="text-brand-600" /> Delivery nationwide</li>
            <li className="flex items-center gap-2"><RotateCcw size={18} className="text-brand-600" /> {settings.return_policy_days}-day returns</li>
            <li className="flex items-center gap-2"><ShieldCheck size={18} className="text-brand-600" /> Tested before dispatch</li>
          </ul>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <section className="card p-6 md:p-8">
          <h2 className="text-xl font-bold">How to use the {p.name}</h2>
          <p className="mb-4 text-sm text-slate-500">Video guide from our YouTube channel</p>
          <YouTubeEmbed url={p.video_url} title={`${p.name} tutorial`} channel={settings.youtube_channel} />
          <h2 className="mt-8 text-xl font-bold">Description</h2>
          <div className="prose-tcs mt-3">
            {(p.description || '').split(/\n+/).map((para, i) => <p key={i}>{para}</p>)}
          </div>
        </section>
        <aside className="card h-fit p-6">
          <h2 className="mb-4 text-lg font-bold">Specifications</h2>
          <dl className="divide-y divide-slate-100 text-sm">
            {Object.entries({ Category: cat?.name, Type: p.type, Stock: `${p.stock} units`, ...(p.specs || {}) }).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2.5">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium text-navy-900">{v}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="section-title mb-5">You may also like</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((r) => <ProductCard key={r.id} product={r} onQuickView={setQuick} />)}
          </div>
        </section>
      )}
      {quick && <QuickView product={quick} onClose={() => setQuick(null)} />}
    </div>
  )
}

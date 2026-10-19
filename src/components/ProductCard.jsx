import { Link } from 'react-router-dom'
import { Eye, ShoppingCart, Star } from 'lucide-react'
import { useStore } from '../context/StoreContext'
import { cedi } from '../lib/format'

export default function ProductCard({ product: p, onQuickView }) {
  const { addToCart } = useStore()
  const off = p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0
  const out = p.stock <= 0

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-glow">
      <Link to={`/product/${p.slug}`} className="relative block aspect-square overflow-hidden bg-brand-50">
        <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
        {off > 0 && <span className="absolute left-3 top-3 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-bold text-white">-{off}%</span>}
        {out && <span className="absolute inset-0 grid place-items-center bg-white/70 text-sm font-bold text-navy-800">Out of stock</span>}
      </Link>

      <button
        onClick={() => onQuickView?.(p)}
        className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-navy-900 shadow-md transition hover:bg-brand-600 hover:text-white md:translate-y-[-6px] md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100"
        aria-label={`Quick view ${p.name}`}
        title="Quick view"
      >
        <Eye size={17} />
      </button>

      <div className="flex flex-1 flex-col p-3.5">
        <span className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-600">{p.type}</span>
        <Link to={`/product/${p.slug}`} className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-navy-900 hover:text-brand-700">
          {p.name}
        </Link>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-extrabold text-navy-900">{cedi(p.price)}</span>
          {off > 0 && <span className="text-xs text-slate-400 line-through">{cedi(p.old_price)}</span>}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-0.5 font-semibold text-brand-700">
            <Star size={12} className="fill-brand-500 text-brand-500" /> {p.rating ?? '4.8'}
          </span>
          <span>·</span>
          <span>{p.sold ?? 0}+ sold</span>
          <span className={`ml-auto font-medium ${p.stock < 10 ? 'text-brand-700' : ''}`}>{out ? '' : `${p.stock} left`}</span>
        </div>
        <button onClick={() => addToCart(p)} disabled={out} className="btn-primary mt-3 w-full py-2">
          <ShoppingCart size={16} /> Add to cart
        </button>
      </div>
    </article>
  )
}

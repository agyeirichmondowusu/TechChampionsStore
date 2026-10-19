import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Minus, Plus, ShoppingCart, X } from 'lucide-react'
import { useStore } from '../context/StoreContext'
import { cedi } from '../lib/format'

export default function QuickView({ product: p, onClose }) {
  const { addToCart } = useStore()
  const [qty, setQty] = useState(1)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/60 p-4 backdrop-blur-sm animate-fadeIn" onClick={onClose} role="dialog" aria-modal="true" aria-label={p.name}>
      <div className="relative grid w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl md:grid-cols-2" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white shadow hover:bg-brand-50" aria-label="Close">
          <X size={18} />
        </button>
        <div className="aspect-square bg-brand-50">
          <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
        </div>
        <div className="flex flex-col p-6">
          <span className="chip w-fit">{p.type}</span>
          <h3 className="mt-2 text-xl font-bold">{p.name}</h3>
          <p className="mt-2 text-2xl font-extrabold text-brand-700">{cedi(p.price)}</p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{p.short_description}</p>
          <p className="mt-3 text-sm font-medium text-slate-500">{p.stock > 0 ? `${p.stock} units remaining` : 'Out of stock'}</p>
          <div className="mt-auto pt-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex items-center rounded-full ring-1 ring-slate-200">
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="grid h-10 w-10 place-items-center rounded-full hover:bg-brand-50" aria-label="Decrease"><Minus size={16} /></button>
                <span className="w-10 text-center font-semibold">{qty}</span>
                <button onClick={() => setQty(Math.min(p.stock, qty + 1))} className="grid h-10 w-10 place-items-center rounded-full hover:bg-brand-50" aria-label="Increase"><Plus size={16} /></button>
              </div>
              <button disabled={p.stock <= 0} onClick={() => { addToCart(p, qty); onClose() }} className="btn-primary flex-1">
                <ShoppingCart size={16} /> Add to cart
              </button>
            </div>
            <Link to={`/product/${p.slug}`} onClick={onClose} className="btn-ghost w-full">View full details</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

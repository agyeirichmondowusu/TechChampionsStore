import { Link } from 'react-router-dom'
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { useStore } from '../context/StoreContext'
import { cedi } from '../lib/format'

export default function Cart() {
  const { cart, cartTotal, cartCount, setQty, removeFromCart, clearCart } = useStore()

  if (!cart.length) {
    return (
      <div className="container-x grid place-items-center py-24 text-center">
        <span className="grid h-24 w-24 place-items-center rounded-full bg-brand-50 text-brand-600"><ShoppingBag size={44} /></span>
        <h1 className="section-title mt-6">Your cart is empty</h1>
        <p className="mt-2 text-slate-500">Find the components for your next project.</p>
        <Link to="/products" className="btn-primary mt-6">Start shopping</Link>
      </div>
    )
  }

  return (
    <div className="container-x py-8">
      <h1 className="section-title mb-6">Shopping cart <span className="text-lg font-semibold text-slate-400">({cartCount} items)</span></h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="card divide-y divide-slate-100">
          {cart.map((l) => (
            <div key={l.id} className="flex items-center gap-4 p-4">
              <Link to={`/product/${l.slug}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-brand-50">
                <img src={l.image_url} alt="" className="h-full w-full object-cover" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/product/${l.slug}`} className="line-clamp-2 font-semibold hover:text-brand-700">{l.name}</Link>
                <p className="text-sm text-slate-500">{cedi(l.price)} each</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex items-center rounded-full ring-1 ring-slate-200">
                    <button onClick={() => setQty(l.id, l.qty - 1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-brand-50" aria-label="Decrease"><Minus size={14} /></button>
                    <span className="w-8 text-center text-sm font-bold">{l.qty}</span>
                    <button onClick={() => setQty(l.id, l.qty + 1)} disabled={l.qty >= l.stock} className="grid h-8 w-8 place-items-center rounded-full hover:bg-brand-50 disabled:opacity-40" aria-label="Increase"><Plus size={14} /></button>
                  </div>
                  <button onClick={() => removeFromCart(l.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-navy-900"><Trash2 size={14} /> Remove</button>
                </div>
              </div>
              <p className="text-right font-extrabold">{cedi(l.qty * l.price)}</p>
            </div>
          ))}
          <div className="flex justify-between p-4">
            <Link to="/products" className="text-sm font-semibold text-brand-700 hover:underline">← Continue shopping</Link>
            <button onClick={clearCart} className="text-sm font-semibold text-slate-500 hover:text-navy-900">Clear cart</button>
          </div>
        </div>

        <aside className="card h-fit p-6">
          <h2 className="text-lg font-bold">Order summary</h2>
          <div className="mt-4 flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><b>{cedi(cartTotal)}</b></div>
          <div className="mt-2 flex justify-between text-sm"><span className="text-slate-500">Delivery</span><span className="text-slate-500">Chosen at checkout</span></div>
          <div className="mt-4 flex justify-between border-t border-slate-100 pt-4 text-lg font-extrabold"><span>Total</span><span>{cedi(cartTotal)}</span></div>
          <Link to="/checkout" className="btn-primary mt-6 w-full py-3.5 text-base">Proceed to checkout <ArrowRight size={18} /></Link>
          <p className="mt-3 text-center text-xs text-slate-500">No account needed. Your order is sent to us on WhatsApp.</p>
        </aside>
      </div>
    </div>
  )
}

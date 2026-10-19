import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, CreditCard, MapPin, ShoppingBag } from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import { useStore } from '../context/StoreContext'
import { createOrder } from '../lib/api'
import { cedi, waNumber } from '../lib/format'

const orderCode = () => 'TCS-' + Date.now().toString(36).toUpperCase().slice(-6)

export function buildWhatsAppMessage({ code, name, phone, note, delivery, cart, subtotal, total, payment }) {
  const lines = [
    `*NEW ORDER: ${code}*`,
    `TechChampionStore`,
    '',
    `*Customer:* ${name}`,
    `*Phone:* ${phone}`,
    '',
    '*Items*',
    ...cart.map((l, i) => `${i + 1}. ${l.name}\n    Qty: ${l.qty} × ${cedi(l.price)} = ${cedi(l.qty * l.price)}`),
    '',
    `*Subtotal:* ${cedi(subtotal)}`,
    `*Delivery:* ${delivery.label} (${delivery.fee ? cedi(delivery.fee) : 'Free'})`,
    `*TOTAL: ${cedi(total)}*`,
  ]
  if (note) lines.push('', `*Note:* ${note}`)
  if (payment?.provider) lines.push('', `Payment: ${payment.provider} (${payment.account_number})`)
  lines.push('', 'Please confirm my order. Thank you!')
  return lines.join('\n')
}

export default function Checkout() {
  const { cart, cartTotal, settings, clearCart, user } = useStore()
  const options = settings.delivery_options
  const accounts = settings.payment?.accounts || []
  const [deliveryId, setDeliveryId] = useState(options[0]?.id)
  const [payIdx, setPayIdx] = useState(0)
  const [form, setForm] = useState({ name: user?.name || '', phone: '', note: '' })
  const [done, setDone] = useState(null)
  const [errors, setErrors] = useState({})

  const delivery = options.find((o) => o.id === deliveryId) || options[0]
  const total = cartTotal + Number(delivery?.fee || 0)
  const waBase = `https://wa.me/${waNumber(settings.whatsapp_number)}`

  const summary = useMemo(() => cart.map((l) => ({ id: l.id, name: l.name, qty: l.qty, price: l.price })), [cart])

  if (done) {
    return (
      <div className="container-x grid place-items-center py-20 text-center">
        <CheckCircle2 size={64} className="text-brand-600" />
        <h1 className="section-title mt-4">Order {done.code} is ready</h1>
        <p className="mt-2 max-w-md text-slate-500">WhatsApp should have opened with your order. Press send there, and we will confirm availability and delivery.</p>
        <a href={done.url} target="_blank" rel="noreferrer" className="btn mt-6 bg-[#25d366] px-6 py-3 text-white hover:brightness-95">
          <FaWhatsapp size={20} /> Open WhatsApp again
        </a>
        <Link to="/products" className="mt-4 text-sm font-semibold text-brand-700 hover:underline">Continue shopping</Link>
      </div>
    )
  }

  if (!cart.length) {
    return (
      <div className="container-x grid place-items-center py-24 text-center">
        <ShoppingBag size={48} className="text-brand-500" />
        <h1 className="section-title mt-4">Nothing to check out yet</h1>
        <Link to="/products" className="btn-primary mt-6">Browse products</Link>
      </div>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (!form.name.trim()) errs.name = 'Please enter your name'
    if (form.phone.replace(/\D/g, '').length < 9) errs.phone = 'Please enter a valid phone number'
    setErrors(errs)
    if (Object.keys(errs).length) return

    const code = orderCode()
    const text = buildWhatsAppMessage({ code, ...form, delivery, cart, subtotal: cartTotal, total, payment: accounts[payIdx] })
    const url = `${waBase}?text=${encodeURIComponent(text)}`
    // Open WhatsApp first (inside the click) so popup blockers allow it.
    window.open(url, '_blank', 'noopener')
    createOrder({
      order_code: code, customer_name: form.name, customer_phone: form.phone, customer_note: form.note,
      delivery_option: delivery.label, delivery_fee: delivery.fee, items: summary, subtotal: cartTotal, total,
    }).catch((err) => console.warn('Order log failed', err))
    clearCart()
    setDone({ code, url })
  }

  const field = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) })

  return (
    <form onSubmit={submit} className="container-x py-8" noValidate>
      <h1 className="section-title mb-6">Checkout</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="mb-4 text-lg font-bold">1. Your details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="name">Full name</label>
                <input id="name" className="input" placeholder="Kwame Mensah" {...field('name')} />
                {errors.name && <p className="mt-1 text-xs font-semibold text-brand-700">{errors.name}</p>}
              </div>
              <div>
                <label className="label" htmlFor="phone">Phone / WhatsApp</label>
                <input id="phone" className="input" placeholder="024 000 0000" inputMode="tel" {...field('phone')} />
                {errors.phone && <p className="mt-1 text-xs font-semibold text-brand-700">{errors.phone}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="note">Notes (hostel, landmark, preferred time)</label>
                <textarea id="note" rows={2} className="input" {...field('note')} />
              </div>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><MapPin size={18} className="text-brand-600" /> 2. Delivery option</h2>
            <div className="grid gap-2">
              {options.map((o) => (
                <label key={o.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3.5 transition ${deliveryId === o.id ? 'border-brand-600 bg-brand-50' : 'border-slate-100 hover:border-brand-200'}`}>
                  <input type="radio" name="delivery" checked={deliveryId === o.id} onChange={() => setDeliveryId(o.id)} className="h-4 w-4 accent-brand-600" />
                  <span className="flex-1 text-sm font-medium">{o.label}</span>
                  <span className="text-sm font-bold text-navy-900">{o.fee ? cedi(o.fee) : 'Free'}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="card p-6">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><CreditCard size={18} className="text-brand-600" /> 3. Payment account</h2>
            <p className="mb-4 text-sm text-slate-500">{settings.payment?.instructions}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {accounts.map((a, i) => (
                <label key={i} className={`cursor-pointer rounded-2xl p-4 text-white transition ${payIdx === i ? 'bg-gradient-to-br from-brand-600 to-navy-900 ring-4 ring-brand-200' : 'bg-gradient-to-br from-navy-700 to-navy-900 opacity-80 hover:opacity-100'}`}>
                  <input type="radio" name="pay" className="sr-only" checked={payIdx === i} onChange={() => setPayIdx(i)} />
                  <span className="text-xs uppercase tracking-widest text-brand-200">{a.provider}</span>
                  <span className="mt-2 block font-mono text-xl font-bold tracking-wider">{a.account_number}</span>
                  <span className="mt-1 block text-sm text-brand-100">Name: {a.account_name}</span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">Use your order number as the payment reference.</p>
          </section>
        </div>

        <aside className="card h-fit p-6 lg:sticky lg:top-44">
          <h2 className="text-lg font-bold">Order summary</h2>
          <ul className="mt-4 max-h-72 space-y-3 overflow-auto pr-1">
            {cart.map((l) => (
              <li key={l.id} className="flex items-center gap-3 text-sm">
                <img src={l.image_url} alt="" className="h-12 w-12 rounded-lg bg-brand-50 object-cover" />
                <span className="min-w-0 flex-1"><span className="line-clamp-1 font-medium">{l.name}</span><span className="text-xs text-slate-500">Qty {l.qty}</span></span>
                <b>{cedi(l.qty * l.price)}</b>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><b>{cedi(cartTotal)}</b></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Delivery</span><b className="text-right">{delivery?.fee ? cedi(delivery.fee) : 'Free'}</b></div>
          </div>
          <div className="mt-4 flex justify-between border-t border-slate-100 pt-4 text-xl font-black"><span>Total</span><span>{cedi(total)}</span></div>
          <button className="btn mt-6 w-full bg-[#25d366] py-4 text-base text-white hover:brightness-95">
            <FaWhatsapp size={22} /> Send order on WhatsApp
          </button>
          <p className="mt-3 text-center text-xs text-slate-500">Sends your items, quantities and total to {settings.whatsapp_number}. No account needed.</p>
        </aside>
      </div>
    </form>
  )
}

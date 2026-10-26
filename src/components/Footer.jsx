import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Mail, MapPin, Phone, RotateCcw } from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import { useStore } from '../context/StoreContext'
import { CATEGORIES } from '../data/defaultSettings'
import { waNumber } from '../lib/format'
import SocialLinks from './SocialLinks'
import { subscribe } from '../lib/api'

const Col = ({ title, children }) => (
  <div>
    <h4 className="mb-4 text-sm font-bold uppercase tracking-widest text-white">{title}</h4>
    <ul className="space-y-2.5 text-sm">{children}</ul>
  </div>
)
const L = ({ to, children }) => (
  <li>
    <Link to={to} className="text-brand-100/80 transition hover:text-white">{children}</Link>
  </li>
)

export default function Footer() {
  const { settings } = useStore()
  return (
    <footer className="mt-16 bg-navy-950 text-brand-100/80">
      <div className="container-x grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo-512.png" alt="" className="h-14 w-14 rounded-xl bg-white object-contain p-1" />
            <span className="font-display text-2xl font-black text-white">
              TechChampion<span className="text-brand-400">Store</span>
            </span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-relaxed">{settings.tagline}</p>
          <ul className="mt-5 space-y-2 text-sm">
            <li className="flex items-start gap-2"><MapPin size={16} className="mt-0.5 shrink-0 text-brand-400" /> {settings.address}</li>
            {settings.phones.map((p) => (
              <li key={p}><a href={`tel:${p}`} className="flex items-center gap-2 hover:text-white"><Phone size={16} className="text-brand-400" /> {p}</a></li>
            ))}
            <li><a href={`mailto:${settings.email}`} className="flex items-center gap-2 break-all hover:text-white"><Mail size={16} className="shrink-0 text-brand-400" /> {settings.email}</a></li>
            <li>
              <a href={`https://wa.me/${waNumber(settings.whatsapp_number)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white">
                <FaWhatsapp size={16} className="text-brand-400" /> Chat on WhatsApp
              </a>
            </li>
          </ul>
          <div className="mt-6"><SocialLinks socials={settings.socials} /></div>
        </div>

        <Col title="Shop">
          <L to="/products">All products</L>
          {CATEGORIES.map((c) => <L key={c.id} to={`/products?category=${c.id}`}>{c.name}</L>)}
          <L to="/robots">Robot kits</L>
          <L to="/slicer">3D slicer (STL to G-code)</L>
        </Col>
        <Col title="Help">
          <L to="/returns">Return policy ({settings.return_policy_days} days)</L>
          <L to="/delivery">Delivery options</L>
          <L to="/faq">FAQ</L>
          <L to="/contact">Contact us</L>
          <L to="/privacy">Privacy and cookies</L>
          <L to="/meet-champ">Ask Champ (AI)</L>
        </Col>
        <Col title="Company">
          <L to="/about">About us</L>
          <L to="/cart">Your cart</L>
          <L to="/login">Login</L>
          <L to="/signup">Create account</L>
          <li>
            <a href={settings.youtube_channel} target="_blank" rel="noreferrer" className="text-brand-100/80 hover:text-white">Video tutorials</a>
          </li>
        </Col>
      </div>
      <Newsletter />
      <div className="border-t border-white/10">
        <div className="container-x flex flex-col items-center justify-between gap-3 py-5 text-xs sm:flex-row">
          <p>© {new Date().getFullYear()} TechChampionStore. All rights reserved.</p>
          <p className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5"><RotateCcw size={13} /> {settings.return_policy_days}-day returns</span>
            <span className="inline-flex items-center gap-1.5"><Clock size={13} /> Mon to Sat, 8am to 6pm</span>
          </p>
        </div>
      </div>
    </footer>
  )
}

// Product news and offers by email; the list is managed in Admin > Emails.
function Newsletter() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState({ busy: false, msg: '' })
  const submit = async (e) => {
    e.preventDefault()
    setState({ busy: true, msg: '' })
    try {
      await subscribe({ email, source: 'footer' })
      setEmail('')
      setState({ busy: false, msg: 'Thanks! You will hear about new products and offers.' })
    } catch (err) {
      setState({ busy: false, msg: err.message || 'Could not subscribe, please try again.' })
    }
  }
  return (
    <div className="border-t border-white/10">
      <form onSubmit={submit} className="container-x flex flex-col gap-3 py-8 md:flex-row md:flex-wrap md:items-center">
        <div className="flex-1">
          <h4 className="font-bold text-white">New components and offers by email</h4>
          <p className="text-sm">A few emails a month at most. Unsubscribe any time.</p>
        </div>
        <div className="flex w-full gap-2 md:w-auto">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email address" className="input min-w-0 flex-1 border-white/10 bg-white/10 text-white placeholder:text-brand-100/50 md:w-72" />
          <button disabled={state.busy} className="btn-primary shrink-0">{state.busy ? 'Saving…' : 'Subscribe'}</button>
        </div>
        {state.msg && <p className="text-sm text-brand-200 md:basis-full md:text-right">{state.msg}</p>}
      </form>
    </div>
  )
}

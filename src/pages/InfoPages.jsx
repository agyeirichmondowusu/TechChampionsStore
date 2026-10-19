import { Link } from 'react-router-dom'
import { Mail, MapPin, Phone } from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import { useStore } from '../context/StoreContext'
import { cedi, waNumber } from '../lib/format'
import SocialLinks from '../components/SocialLinks'

function Page({ title, kicker, children }) {
  return (
    <div>
      <div className="bg-gradient-to-br from-navy-900 to-brand-800 py-14 text-center text-white">
        <p className="text-xs font-semibold uppercase tracking-[.25em] text-brand-200">{kicker}</p>
        <h1 className="mt-2 font-display text-4xl font-black">{title}</h1>
      </div>
      <div className="container-x -mt-8 max-w-4xl">
        <div className="card prose-tcs p-6 md:p-10">{children}</div>
      </div>
    </div>
  )
}

export function About() {
  const { settings } = useStore()
  return (
    <Page title="About TechChampionStore" kicker="Who we are">
      <p>TechChampionStore supplies students, makers, engineers and schools across Ghana with the parts they need to build: microcontrollers, sensors, actuators, power modules, 3D printers and complete robot kits.</p>
      <p>We are based at {settings.address}. Every component is checked before it leaves our office, and our team is happy to help you choose parts for your project, final-year build or classroom.</p>
      <h2>Why shop with us</h2>
      <ul>
        <li>Genuine, tested components at student-friendly prices</li>
        <li>Fast ordering on WhatsApp with no account required</li>
        <li>Delivery to Kumasi, Accra, Koforidua, Ho, Tamale, Takoradi and more</li>
        <li>{settings.return_policy_days}-day return policy</li>
        <li>Free video tutorials and Champ, our AI assistant, for wiring help</li>
      </ul>
    </Page>
  )
}

export function Contact() {
  const { settings } = useStore()
  return (
    <Page title="Contact us" kicker="We reply fast">
      <div className="not-prose grid gap-4 sm:grid-cols-2">
        {settings.phones.map((p) => (
          <a key={p} href={`tel:${p}`} className="flex items-center gap-3 rounded-2xl bg-brand-50 p-5 font-semibold text-navy-900 hover:bg-brand-100"><Phone className="text-brand-600" /> {p}</a>
        ))}
        <a href={`https://wa.me/${waNumber(settings.whatsapp_number)}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-brand-50 p-5 font-semibold text-navy-900 hover:bg-brand-100"><FaWhatsapp className="text-xl text-brand-600" /> WhatsApp {settings.whatsapp_number}</a>
        <a href={`mailto:${settings.email}`} className="flex items-center gap-3 break-all rounded-2xl bg-brand-50 p-5 font-semibold text-navy-900 hover:bg-brand-100"><Mail className="shrink-0 text-brand-600" /> {settings.email}</a>
        <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-5 font-semibold text-navy-900 sm:col-span-2"><MapPin className="shrink-0 text-brand-600" /> {settings.address}</div>
      </div>
      <h2>Follow us</h2>
      <div className="w-fit rounded-2xl bg-navy-900 p-3"><SocialLinks socials={settings.socials} /></div>
    </Page>
  )
}

export function Returns() {
  const { settings } = useStore()
  const d = settings.return_policy_days
  return (
    <Page title={`${d}-Day Return Policy`} kicker="Shop with confidence">
      <p>If something is not right with your order, you can return it within <b>{d} days</b> of receiving it.</p>
      <h2>What can be returned</h2>
      <ul>
        <li>Items that arrived faulty, damaged or different from what you ordered</li>
        <li>Unused items in their original packaging, with all accessories</li>
      </ul>
      <h2>What cannot be returned</h2>
      <ul>
        <li>Components damaged by wrong wiring, over-voltage, soldering or physical misuse</li>
        <li>Opened filament and consumables, unless they are defective</li>
        <li>Items returned after {d} days</li>
      </ul>
      <h2>How to return</h2>
      <ul>
        <li>Message us on WhatsApp ({settings.whatsapp_number}) with your order number and photos of the item</li>
        <li>We will confirm the return and tell you where to drop it or how to send it</li>
        <li>After inspection we replace the item or refund you by Mobile Money within 3 working days</li>
      </ul>
      <p>Return delivery costs are covered by us when the item was faulty or wrong, and by the customer otherwise.</p>
    </Page>
  )
}

export function Delivery() {
  const { settings } = useStore()
  return (
    <Page title="Delivery options" kicker="Across Ghana">
      <p>Choose your delivery option at checkout. Fees are added to your order total in the WhatsApp message.</p>
      <div className="not-prose mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl ring-1 ring-slate-100">
        {settings.delivery_options.map((o) => (
          <div key={o.id} className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm">
            <span className="font-medium">{o.label}</span>
            <b className="whitespace-nowrap text-brand-700">{o.fee ? cedi(o.fee) : 'Free'}</b>
          </div>
        ))}
      </div>
      <p className="mt-6">Orders confirmed before 2pm are usually dispatched the same day. Bus and STC parcels are collected at the destination station with your name and phone number.</p>
    </Page>
  )
}

export function Faq() {
  const { settings } = useStore()
  const qa = [
    ['Do I need an account to order?', 'No. Add items to your cart, choose delivery, and send the order to us on WhatsApp.'],
    ['How do I pay?', `Pay by Mobile Money to the account shown at checkout (${settings.payment?.accounts?.[0]?.provider || 'MoMo'}) and use your order number as reference.`],
    ['Where is your office?', settings.address],
    ['Can you help me choose parts for my project?', 'Yes. Ask Champ, our AI assistant, or chat with us on WhatsApp.'],
    ['What is your return policy?', `You can return eligible items within ${settings.return_policy_days} days.`],
  ]
  return (
    <Page title="Frequently asked questions" kicker="Help centre">
      {qa.map(([q, a]) => (
        <details key={q} className="group mb-3 rounded-2xl bg-slate-50 p-5 open:bg-brand-50">
          <summary className="cursor-pointer list-none font-semibold text-navy-900">{q}</summary>
          <p className="mb-0 mt-2">{a}</p>
        </details>
      ))}
      <p className="mt-6">Still stuck? <Link to="/contact" className="font-semibold text-brand-700">Contact us</Link>.</p>
    </Page>
  )
}

export function NotFound() {
  return (
    <div className="container-x py-24 text-center">
      <h1 className="font-display text-7xl font-black text-brand-600">404</h1>
      <p className="mt-3 text-slate-500">This page could not be found.</p>
      <Link to="/" className="btn-primary mt-6">Go home</Link>
    </div>
  )
}

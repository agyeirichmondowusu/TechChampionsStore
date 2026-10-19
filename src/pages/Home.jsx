import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bot, Cpu, Gauge, MessageCircle, Printer, RotateCcw, ShieldCheck, Truck, Zap, Cog } from 'lucide-react'
import { useStore } from '../context/StoreContext'
import { CATEGORIES } from '../data/defaultSettings'
import { ROBOTS } from '../data/robots'
import ProductGrid from '../components/ProductGrid'

const CAT_ICONS = { microcontrollers: Cpu, sensors: Gauge, actuators: Cog, power: Zap, '3d-printers': Printer }

const shuffle = (a) => {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

function Hero() {
  const { products, settings } = useStore()
  // Random component images (plus admin-chosen hero images) rotate behind the title.
  const images = useMemo(() => {
    const custom = settings.hero_images?.filter(Boolean) || []
    const pool = [...products.map((p) => p.image_url), ...ROBOTS.map((r) => r.image)]
    return shuffle(custom.length ? [...custom, ...pool.slice(0, 6)] : pool).slice(0, 12)
  }, [products, settings.hero_images])
  const [i, setI] = useState(0)

  useEffect(() => {
    if (images.length < 2) return
    const t = setInterval(() => setI((n) => (n + 1) % images.length), 4000)
    return () => clearInterval(t)
  }, [images.length])

  return (
    <section className="relative isolate overflow-hidden bg-navy-950">
      {images.map((src, n) => (
        <div
          key={src + n}
          className="absolute inset-0 -z-10 transition-opacity duration-[1400ms]"
          style={{ opacity: n === i ? 1 : 0 }}
          aria-hidden
        >
          <img src={src} alt="" className={`h-full w-full object-cover ${n === i ? 'scale-110' : 'scale-100'} transition-transform duration-[6000ms] ease-out`} />
        </div>
      ))}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(10,22,51,.55),rgba(5,12,31,.92))]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(30,116,255,.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(30,116,255,.08)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="container-x flex min-h-[540px] flex-col items-center justify-center py-20 text-center md:min-h-[600px]">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[.2em] text-brand-200 ring-1 ring-white/20 backdrop-blur">
          <Cpu size={14} /> IoT · Robotics · 3D Printing
        </span>
        <h1 className="font-display text-[8.2vw] font-black leading-[1.05] tracking-tight text-white drop-shadow-2xl sm:text-6xl md:text-7xl lg:text-8xl">
          TechChampion<span className="bg-gradient-to-r from-brand-400 to-accent-400 bg-clip-text text-transparent">Store</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base text-brand-100 sm:text-lg">{settings.tagline}</p>
        <Link to="/products" className="btn mt-9 bg-brand-500 px-10 py-4 text-base text-white shadow-glow hover:-translate-y-0.5 hover:bg-brand-400">
          Shop Now <ArrowRight size={20} />
        </Link>
        <div className="mt-10 flex gap-1.5">
          {images.map((_, n) => (
            <button key={n} onClick={() => setI(n)} aria-label={`Background ${n + 1}`} className={`h-1.5 rounded-full transition-all ${n === i ? 'w-8 bg-brand-400' : 'w-3 bg-white/30'}`} />
          ))}
        </div>
      </div>
    </section>
  )
}

const PERKS = [
  { Icon: Truck, title: 'Nationwide delivery', text: 'Bus, STC and VIP parcel options' },
  { Icon: RotateCcw, title: '20-day returns', text: 'Hassle-free return policy' },
  { Icon: MessageCircle, title: 'WhatsApp ordering', text: 'No account needed to order' },
  { Icon: ShieldCheck, title: 'Tested components', text: 'Checked before dispatch' },
]

export default function Home() {
  const { products, loading, settings } = useStore()

  return (
    <>
      <Hero />

      <section className="container-x relative z-10 -mt-10">
        <div className="grid grid-cols-2 gap-3 rounded-3xl bg-white p-4 shadow-card md:grid-cols-4 md:p-6">
          {PERKS.map(({ Icon, title, text }) => (
            <div key={title} className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Icon size={22} /></span>
              <span>
                <span className="block text-sm font-bold">{title}</span>
                <span className="block text-xs text-slate-500">{text}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x mt-14">
        <h2 className="section-title">Shop by category</h2>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {CATEGORIES.map((c) => {
            const Icon = CAT_ICONS[c.id]
            const count = products.filter((p) => p.category === c.id).length
            return (
              <Link key={c.id} to={`/products?category=${c.id}`} className="group rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-100 transition hover:-translate-y-1 hover:bg-navy-900 hover:shadow-glow">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow"><Icon size={24} /></span>
                <h3 className="mt-4 font-bold group-hover:text-white">{c.name}</h3>
                <p className="text-xs text-slate-500 group-hover:text-brand-200">{c.blurb}</p>
                <p className="mt-2 text-xs font-semibold text-brand-600 group-hover:text-brand-300">{count} items →</p>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="container-x mt-14" id="products">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="section-title">Just for you</h2>
            <p className="text-sm text-slate-500">Fresh components for your next build, {settings.grid_columns} × {settings.grid_rows} per page.</p>
          </div>
          <Link to="/products" className="hidden text-sm font-semibold text-brand-700 hover:underline sm:block">View all products →</Link>
        </div>
        {loading ? <GridSkeleton /> : <ProductGrid products={products} />}
      </section>

      <section className="container-x mt-16">
        <div className="grid overflow-hidden rounded-3xl bg-navy-900 text-white md:grid-cols-2">
          <div className="p-8 md:p-12">
            <span className="chip bg-white/10 text-brand-200"><Bot size={14} className="mr-1" /> Robot kits</span>
            <h2 className="mt-3 font-display text-3xl font-black">Watch our robots build themselves</h2>
            <p className="mt-3 text-brand-100/80">Open a robot and scroll: its parts snap together one by one, then it walks, drives or grabs as you keep scrolling.</p>
            <Link to="/robots" className="btn mt-6 bg-white text-navy-900 hover:bg-brand-100">Explore robots <ArrowRight size={16} /></Link>
          </div>
          <div className="grid grid-cols-3 gap-2 bg-gradient-to-br from-brand-700 to-navy-800 p-6">
            {ROBOTS.slice(0, 6).map((r) => (
              <Link key={r.id} to={`/robots/${r.id}`} className="grid aspect-square place-items-center rounded-2xl bg-white/10 p-2 transition hover:bg-white/20">
                <img src={r.image} alt={r.name} className="max-h-full object-contain" loading="lazy" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="container-x mt-10">
        <Link to="/meet-champ" className="flex flex-col items-center gap-6 rounded-3xl bg-gradient-to-r from-brand-600 to-brand-800 p-8 text-white shadow-glow md:flex-row md:p-10">
          <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-white/15 ring-4 ring-white/20"><MessageCircle size={36} /></span>
          <span className="flex-1 text-center md:text-left">
            <span className="block font-display text-2xl font-black">Meet Champ, your AI electronics assistant</span>
            <span className="block text-brand-100">Type or talk. Ask which sensor to buy, how to wire it, or what delivery costs.</span>
          </span>
          <span className="btn bg-white text-brand-700">Start chatting <ArrowRight size={16} /></span>
        </Link>
      </section>
    </>
  )
}

export function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="card animate-pulse overflow-hidden">
          <div className="aspect-square bg-slate-100" />
          <div className="space-y-2 p-4"><div className="h-3 w-2/3 rounded bg-slate-100" /><div className="h-3 w-1/3 rounded bg-slate-100" /></div>
        </div>
      ))}
    </div>
  )
}

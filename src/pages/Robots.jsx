import { Link } from 'react-router-dom'
import { ArrowRight, Bot, Footprints, Car, Hand } from 'lucide-react'
import { ROBOTS } from '../data/robots'

const ACTION = { walk: [Footprints, 'Walks'], drive: [Car, 'Drives'], grab: [Hand, 'Grabs'] }

export default function Robots() {
  return (
    <div>
      <section className="relative overflow-hidden bg-navy-950 py-16 text-center text-white">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(77,147,255,.10)_1px,transparent_1px),linear-gradient(to_bottom,rgba(77,147,255,.10)_1px,transparent_1px)] bg-[size:40px_40px]" />
        <div className="container-x relative">
          <span className="chip bg-white/10 text-brand-200"><Bot size={14} className="mr-1" /> Robot gallery</span>
          <h1 className="mt-3 font-display text-4xl font-black sm:text-5xl">Robots that build themselves</h1>
          <p className="mx-auto mt-3 max-w-2xl text-brand-100">Pick a robot and scroll. It starts as an exploded view, the parts join one after another, and then it comes alive.</p>
        </div>
      </section>
      <div className="container-x mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {ROBOTS.map((r) => {
          const [Icon, verb] = ACTION[r.action]
          return (
            <Link key={r.id} to={`/robots/${r.id}`} className="group overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-glow">
              <div className="relative grid aspect-square place-items-center bg-[radial-gradient(ellipse_at_center,#16295c,#0a1633)] p-6">
                <img src={r.image} alt={r.name} loading="lazy" className={`max-h-full object-contain transition duration-500 group-hover:scale-110 ${r.framed ? 'rounded-xl' : ''}`} />
                <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur"><Icon size={13} /> {verb}</span>
              </div>
              <div className="p-5">
                <h2 className="font-bold">{r.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{r.tagline}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">Open and assemble <ArrowRight size={15} className="transition group-hover:translate-x-1" /></span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

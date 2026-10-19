import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronsDown, MessageCircle } from 'lucide-react'
import { FaWhatsapp } from 'react-icons/fa'
import { getRobot, ROBOTS } from '../data/robots'
import { useStore } from '../context/StoreContext'
import { waNumber } from '../lib/format'
import RobotAssembly from '../components/RobotAssembly'

export default function RobotDetail() {
  const { id } = useParams()
  const robot = getRobot(id)
  const { settings } = useStore()
  const track = useRef(null)
  const [progress, setProgress] = useState(0)
  const [zoom, setZoom] = useState(null)

  useEffect(() => {
    const onScroll = () => {
      const el = track.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const span = rect.height - window.innerHeight * 0.75
      setProgress(Math.min(1, Math.max(0, (window.innerHeight * 0.25 - rect.top) / Math.max(1, span))))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [id])

  if (!robot) {
    return (
      <div className="container-x py-24 text-center">
        <h1 className="section-title">Robot not found</h1>
        <Link to="/robots" className="btn-primary mt-6">Back to robots</Link>
      </div>
    )
  }

  const idx = ROBOTS.indexOf(robot)
  const next = ROBOTS[(idx + 1) % ROBOTS.length]
  const ask = `Hello TechChampionStore, I'm interested in the ${robot.name}. Please send me the price and availability.`

  return (
    <div className="pb-10">
      <div className="container-x pt-6">
        <Link to="/robots" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"><ArrowLeft size={15} /> All robots</Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-black sm:text-4xl">{robot.name}</h1>
            <p className="text-slate-500">{robot.tagline}</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700">
            <ChevronsDown size={16} className="animate-bounce" /> Scroll to assemble
          </span>
        </div>
      </div>

      <div ref={track} className="container-x mt-6 grid gap-8 lg:grid-cols-[1.15fr_1fr]">
        <div className="sticky top-[calc(var(--header-h,156px)+8px)] z-10 h-[46vh] lg:h-[calc(100vh-var(--header-h,156px)-24px)]">
          <RobotAssembly robot={robot} progress={progress} />
        </div>

        <div className="relative z-0 space-y-6">
          <div className="flex min-h-[40vh] flex-col justify-center rounded-3xl bg-gradient-to-br from-brand-600 to-navy-900 p-8 text-white">
            <p className="text-xs font-semibold uppercase tracking-[.25em] text-brand-200">Exploded view</p>
            <h2 className="mt-2 text-2xl font-black">Every part, laid out</h2>
            <p className="mt-2 text-brand-100">Keep scrolling. Each part flies into place one after another until the {robot.name} is complete, then it starts {robot.actionLabel}.</p>
          </div>

          {robot.sections.map((s, i) => (
            <section key={s.title} className="card flex min-h-[55vh] flex-col justify-center p-8">
              <span className="font-display text-5xl font-black text-brand-100">{String(i + 1).padStart(2, '0')}</span>
              <h2 className="mt-2 text-2xl font-black">{s.title}</h2>
              <p className="mt-3 leading-relaxed text-slate-600">{s.body}</p>
            </section>
          ))}

          <section className="card min-h-[60vh] p-8">
            <h2 className="text-2xl font-black">Specifications</h2>
            <dl className="mt-4 divide-y divide-slate-100 text-sm">
              {Object.entries(robot.specs).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-3"><dt className="text-slate-500">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>
              ))}
            </dl>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <a href={`https://wa.me/${waNumber(settings.whatsapp_number)}?text=${encodeURIComponent(ask)}`} target="_blank" rel="noreferrer" className="btn bg-[#25d366] py-3 text-white hover:brightness-95"><FaWhatsapp size={18} /> Ask for price</a>
              <Link to="/meet-champ" className="btn-ghost py-3"><MessageCircle size={16} /> Ask Champ</Link>
            </div>
          </section>

          <section className="card min-h-[50vh] p-8">
            <h2 className="text-2xl font-black">Real product structure</h2>
            <p className="mt-1 text-sm text-slate-500">Photos of the actual kit and its parts.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {robot.gallery.map((g) => (
                <button key={g} onClick={() => setZoom(g)} className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
                  <img src={g} alt={`${robot.name} structure`} loading="lazy" className="aspect-square w-full object-contain transition hover:scale-105" />
                </button>
              ))}
            </div>
          </section>

          <Link to={`/robots/${next.id}`} className="flex items-center gap-4 rounded-3xl bg-navy-900 p-6 text-white hover:bg-navy-800">
            <img src={next.image} alt="" className="h-20 w-20 object-contain" />
            <span><span className="block text-xs uppercase tracking-widest text-brand-300">Next robot</span><span className="text-lg font-bold">{next.name}</span></span>
          </Link>
        </div>
      </div>

      {zoom && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/80 p-4" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" className="max-h-[90vh] max-w-full rounded-2xl bg-white" />
        </div>
      )}
    </div>
  )
}

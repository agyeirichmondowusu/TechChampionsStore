import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, Cpu, Play, Square, MessageCircle, CircuitBoard } from 'lucide-react'
import { createChampScene, FINAL_STAGE } from '../components/kit/champScene'
import { VARIANTS } from '../lib/kit/champModels'

const EDITIONS = ['uno', 'esp32', 'pico']
const DOT = { uno: '#0c47b0', esp32: '#16181c', pico: '#13693a' }

// One section per assembly stage; the 3D scene rebuilds stage i while section i scrolls into view.
const SECTIONS = [
  {
    eyebrow: 'New from TechChampions',
    title: 'Champ Core Robotics Kit',
    body: [
      'A trainer board with every sensor already on it, that clips onto a drive base and becomes a robot. Built for classrooms, from first-time coders in primary school to university labs.',
      'Above is the kit taken apart. Scroll down and watch it build itself, one part at a time.',
    ],
  },
  {
    eyebrow: 'Step 1 · Drive train',
    title: 'Two motors that know how far they went',
    body: [
      'Two N20 metal-gear motors turn at about 150 rpm. Each one has a magnetic encoder, so students can drive exactly 50 cm or turn exactly 90°, not just “go forward a bit”.',
      'The 65 mm rubber tyres press onto snap-fit hubs and grip classroom floors and tables.',
    ],
  },
  {
    eyebrow: 'Step 2 · Underneath',
    title: 'Power and senses below the deck',
    list: [
      ['2 × 18650 battery pack', 'Removable, fused cells with USB-C charging. Schools can store batteries separately.'],
      ['3-channel line sensor', 'Infrared pairs under the nose see black tape for line-following lessons.'],
      ['Bumper', 'Two micro-switches tell the robot it hit something, and on which side.'],
      ['Ball caster and LEGO plate', 'The robot pivots on the spot, and students build on top with bricks they already own.'],
    ],
  },
  {
    eyebrow: 'Step 3 · Champ Core board',
    title: 'Every sensor is already on the board',
    body: ['Lesson one needs no wiring. Each part has its own printed pin, and a DIP switch can unplug it when older students want to wire their own circuits.'],
    chips: ['0.96" OLED screen', '4 RGB pixels', 'Traffic-light LEDs', 'Buzzer', 'Potentiometer', 'Light sensor', 'Microphone', 'Temperature + humidity', '6-axis motion sensor', 'IR remote receiver', '2 buttons', 'Motor driver', '6 colour-coded ports'],
  },
  {
    eyebrow: 'Step 4 · The brain',
    title: 'Pick the brain your school teaches',
    body: ['The same board takes an Arduino Uno-compatible brain, an ESP32 or a Raspberry Pi Pico W. Try each one on the model.'],
    editions: true,
  },
  {
    eyebrow: 'Step 5 · Snap together',
    title: 'From desk board to robot in under a minute',
    body: [
      'The Core drops onto four brass standoffs and one keyed connector that carries power, encoders and data. No tools, and it only fits one way.',
      'The ultrasonic sensor rides on a servo, so the robot can look left and right before it turns. A student who wrote a distance alarm on the desk adds one line, drive.forward(), and has an obstacle-avoiding robot.',
    ],
  },
  {
    eyebrow: 'Fully assembled',
    title: 'Watch it follow the line',
    body: ['This is the finished robot on the Champ Track mat. Press the button to run the line follower in real time, then drag to look around it.'],
    final: true,
  },
]

export default function ChampCore() {
  const stageRef = useRef(null)
  const tipRef = useRef(null)
  const sceneRef = useRef(null)
  const sectionRefs = useRef([])
  const [variant, setVariant] = useState('uno')
  const [driving, setDriving] = useState(false)
  const [stage, setStage] = useState(0)
  const [failed, setFailed] = useState(false)
  const [headerH, setHeaderH] = useState(64)

  useLayoutEffect(() => {
    const h = document.querySelector('header')
    if (!h) return
    const update = () => setHeaderH(h.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(h)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let s
    try {
      s = createChampScene(stageRef.current, { tip: tipRef.current, onDrivingChange: setDriving })
    } catch (e) {
      console.error(e)
      setFailed(true)
      return
    }
    sceneRef.current = s
    return () => { s.dispose(); sceneRef.current = null }
  }, [])

  useEffect(() => { sceneRef.current?.setVariant(variant) }, [variant])

  // Map the scroll position to a stage number: s = i when section i's top reaches the middle of the screen.
  useEffect(() => {
    let raf = 0
    const measure = () => {
      raf = 0
      const mid = window.innerHeight * (window.innerWidth < 1024 ? 0.8 : 0.55)
      const els = sectionRefs.current
      let s = 0
      for (let i = 0; i < els.length; i++) {
        const r = els[i]?.getBoundingClientRect()
        if (!r) continue
        if (r.top <= mid) s = i + Math.min(1, (mid - r.top) / Math.max(1, r.height)) * (i < els.length - 1 ? 1 : 0)
      }
      // The last section counts as reached once its top passes the middle.
      s = Math.min(FINAL_STAGE, s)
      const last = els[els.length - 1]?.getBoundingClientRect()
      if (last && last.top <= mid) s = FINAL_STAGE
      sceneRef.current?.setProgress(s)
      setStage(Math.round(s))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure) }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  const toggleDrive = () => sceneRef.current?.setDriving(!driving)
  const V = VARIANTS[variant]

  return (
    <div className="bg-gradient-to-b from-brand-50 via-white to-brand-50">
      <div className="container-x">
        <nav className="pt-5 text-xs text-slate-500">
          <Link to="/products" className="hover:text-brand-700">Our Products</Link> <span className="mx-1">/</span> Champ Core Robotics Kit
        </nav>
      </div>

      <div className="container-x lg:grid lg:grid-cols-12 lg:gap-10">
        {/* 3D stage: pinned while the story scrolls past */}
        <div className="sticky z-10 -mx-4 h-[52vh] sm:-mx-6 lg:col-span-7 lg:mx-0 lg:h-[calc(100vh-var(--hh))] lg:self-start" style={{ top: headerH, '--hh': `${headerH}px` }}>
          <div className="relative h-full overflow-hidden bg-[radial-gradient(120%_90%_at_50%_30%,#f9fbff,#d9e2f1)] lg:mt-4 lg:h-[calc(100%-2rem)] lg:rounded-3xl lg:border lg:border-brand-100 lg:shadow-card">
            <div ref={stageRef} className="absolute inset-0" />
            {failed && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-slate-500">
                Your browser could not start the 3D view. Try a recent Chrome, Edge or Safari.
              </div>
            )}
            <div ref={tipRef} style={{ display: 'none' }} className="pointer-events-none absolute z-20 max-w-[260px] flex-col gap-0.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-snug text-slate-600 shadow-card [&_b]:font-display [&_b]:text-[13px] [&_b]:text-navy-900 [&_code]:font-mono [&_code]:text-brand-700" />
            <StageProgress stage={stage} />
            <div data-badge className="pointer-events-none absolute bottom-3 right-4 hidden text-right sm:block">
              <div className="font-display text-base font-extrabold text-navy-900 sm:text-lg">Champ Core {V.tag}</div>
              <div className="text-[11px] text-slate-500">{V.label} edition on Champ Drive</div>
            </div>
            {stage >= FINAL_STAGE && (
              <button
                onClick={toggleDrive}
                className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-brand-700 lg:hidden"
              >
                {driving ? <Square size={16} /> : <Play size={16} />} {driving ? 'Stop the robot' : 'Run the follower'}
              </button>
            )}
          </div>
        </div>

        {/* Story */}
        <div className="relative z-0 lg:col-span-5">
          {SECTIONS.map((sec, i) => (
            <section
              key={sec.title}
              ref={(el) => { sectionRefs.current[i] = el }}
              className={`flex flex-col py-10 lg:justify-center ${i === 0 ? 'justify-start pt-6' : 'justify-center'} ${i === SECTIONS.length - 1 ? 'min-h-[70vh] pb-24 lg:min-h-[80vh]' : 'min-h-[70vh] lg:min-h-[85vh]'}`}
            >
              <div className="rounded-3xl bg-white/90 p-6 shadow-card backdrop-blur lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">{sec.eyebrow}</div>
                {i === 0 ? (
                  <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight text-navy-900 sm:text-5xl">{sec.title}</h1>
                ) : (
                  <h2 className="mt-2 font-display text-2xl font-extrabold leading-tight tracking-tight text-navy-900 sm:text-3xl">{sec.title}</h2>
                )}
                {sec.body?.map((p) => <p key={p} className="mt-3 text-slate-600">{p}</p>)}
                {sec.list && (
                  <dl className="mt-4 space-y-3">
                    {sec.list.map(([k, v]) => (
                      <div key={k}>
                        <dt className="font-semibold text-navy-900">{k}</dt>
                        <dd className="text-sm text-slate-600">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {sec.chips && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {sec.chips.map((c) => <span key={c} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800">{c}</span>)}
                  </div>
                )}
                {sec.editions && <EditionPicker variant={variant} onChange={setVariant} />}
                {i === 0 && (
                  <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-brand-700">
                    <ArrowDown size={16} className="animate-bounce" /> Scroll to build the robot
                  </div>
                )}
                {sec.final && (
                  <div className="mt-6 space-y-4">
                    <div className="relative inline-flex">
                      {!driving && <span className="absolute inset-0 animate-pulseRing rounded-full bg-brand-500/40" />}
                      <button onClick={toggleDrive} className="btn-primary relative px-6 py-3.5 text-base">
                        {driving ? <Square size={18} /> : <Play size={18} />} {driving ? 'Stop the robot' : 'Run the follower'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm">
                      <Link to="/simulator" className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline"><CircuitBoard size={16} /> Try the code in our simulator</Link>
                      <Link to="/contact" className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline"><MessageCircle size={16} /> Ask about school pricing</Link>
                    </div>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function StageProgress({ stage }) {
  const labels = ['Parts', 'Drive', 'Underside', 'Board', 'Brain', 'Robot', 'Run']
  return (
    <div className="pointer-events-none absolute left-4 top-4 flex gap-1" aria-hidden="true">
      {labels.map((l, i) => (
        <span key={l} title={l} className={`h-1.5 w-6 rounded-full transition-colors sm:w-8 ${i <= stage ? 'bg-brand-600' : 'bg-brand-200'}`} />
      ))}
    </div>
  )
}

function EditionPicker({ variant, onChange }) {
  const V = VARIANTS[variant]
  return (
    <div className="mt-5">
      <div className="inline-flex rounded-full border border-brand-100 bg-white p-1 shadow-sm" role="group" aria-label="Microcontroller edition">
        {EDITIONS.map((k) => (
          <button
            key={k}
            onClick={() => onChange(k)}
            aria-pressed={variant === k}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${variant === k ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-brand-50'}`}
          >
            <span className="h-2.5 w-2.5 rounded-full ring-1 ring-white/40" style={{ background: DOT[k] }} /> {VARIANTS[k].label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-600">{V.sub}</p>
      <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
        {V.specs.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k}</dt>
            <dd className="font-medium text-navy-900">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex items-start gap-2 text-xs text-slate-500"><Cpu size={14} className="mt-0.5 shrink-0" /> All three run the same ChampCore library, so lessons work on every edition.</p>
    </div>
  )
}

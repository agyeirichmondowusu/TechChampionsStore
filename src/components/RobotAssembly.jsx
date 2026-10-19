import { useEffect, useMemo, useRef, useState } from 'react'

// Scroll-driven "exploded view": the robot photo is cut into jittered pieces that start
// scattered, snap together one by one as `progress` goes 0 → ASSEMBLED, then the whole
// robot performs its action (walk / drive / grab) for the rest of the scroll.
const ROWS = 5
const COLS = 4
const HOLD = 0.06
const ASSEMBLED = 0.6
const PIECE_SPAN = 0.07

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const easeOutBack = (t) => {
  const c1 = 1.4
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
const hash = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

function buildPieces(id) {
  const rand = rng(hash(id))
  // Shared jittered vertex grid, so neighbouring pieces fit exactly.
  const V = []
  for (let r = 0; r <= ROWS; r++) {
    V.push([])
    for (let c = 0; c <= COLS; c++) {
      let x = (c / COLS) * 100
      let y = (r / ROWS) * 100
      if (c > 0 && c < COLS) x += (rand() - 0.5) * (100 / COLS) * 0.45
      if (r > 0 && r < ROWS) y += (rand() - 0.5) * (100 / ROWS) * 0.45
      V[r].push([x, y])
    }
  }
  const pieces = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const pts = [V[r][c], V[r][c + 1], V[r + 1][c + 1], V[r + 1][c]]
      const cx = pts.reduce((s, p) => s + p[0], 0) / 4
      const cy = pts.reduce((s, p) => s + p[1], 0) / 4
      let dx = cx - 50
      let dy = cy - 50
      const len = Math.hypot(dx, dy)
      if (len < 8) {
        const a = rand() * Math.PI * 2
        dx = Math.cos(a)
        dy = Math.sin(a)
      } else {
        dx /= len
        dy /= len
      }
      const dist = 18 + rand() * 14
      pieces.push({
        r, c, cx, cy,
        top: Math.min(pts[0][1], pts[1][1]),
        clip: `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(',')})`,
        ex: dx * dist,
        ey: dy * dist - 2,
        rot: (rand() - 0.5) * 50,
        bounds: [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))],
      })
    }
  }
  return pieces
}

// Drops pieces that are (almost) fully transparent in the cut-out image.
function useVisiblePieces(src, pieces, framed) {
  const [keep, setKeep] = useState(null)
  useEffect(() => {
    if (framed) return setKeep(pieces.map(() => true))
    const img = new Image()
    img.onload = () => {
      const N = 120
      const cv = document.createElement('canvas')
      cv.width = cv.height = N
      const ctx = cv.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0, N, N)
      const data = ctx.getImageData(0, 0, N, N).data
      setKeep(
        pieces.map(({ bounds: [x0, y0, x1, y1] }) => {
          let solid = 0
          let total = 0
          for (let y = Math.floor((y0 / 100) * N); y < Math.ceil((y1 / 100) * N); y++)
            for (let x = Math.floor((x0 / 100) * N); x < Math.ceil((x1 / 100) * N); x++) {
              total++
              if (data[(y * N + x) * 4 + 3] > 60) solid++
            }
          return solid / Math.max(1, total) > 0.03
        }),
      )
    }
    img.onerror = () => setKeep(pieces.map(() => true))
    img.src = src
  }, [src, pieces, framed])
  return keep
}

export default function RobotAssembly({ robot, progress }) {
  const allPieces = useMemo(() => buildPieces(robot.id), [robot.id])
  const keep = useVisiblePieces(robot.image, allPieces, robot.framed)

  // Assembly order: bottom row first (legs / wheels / base), then upward, outside-in.
  const pieces = useMemo(() => {
    if (!keep) return []
    const list = allPieces.filter((_, i) => keep[i])
    const order = [...list].sort((a, b) => b.r - a.r || Math.abs(b.c - (COLS - 1) / 2) - Math.abs(a.c - (COLS - 1) / 2) || a.c - b.c)
    const step = (ASSEMBLED - HOLD - PIECE_SPAN) / Math.max(1, order.length - 1)
    return list.map((p) => ({ ...p, start: HOLD + order.indexOf(p) * step }))
  }, [allPieces, keep])

  // Smooth the scroll value so each wheel tick turns into a fluid movement.
  const [p, setP] = useState(progress)
  const target = useRef(progress)
  target.current = progress
  useEffect(() => {
    let raf
    const tick = () => {
      setP((cur) => (Math.abs(target.current - cur) < 0.0005 ? target.current : cur + (target.current - cur) * 0.14))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const done = pieces.filter((pc) => p >= pc.start + PIECE_SPAN).length
  const a = clamp((p - ASSEMBLED) / (1 - ASSEMBLED))
  const assembled = p >= ASSEMBLED && pieces.length > 0
  const phase = a * (robot.action === 'drive' ? 3 : 6) * Math.PI * 2

  // Whole-robot motion for the action phase.
  let bodyX = 0
  let bodyY = 0
  let bodyRot = 0
  if (assembled) {
    if (robot.action === 'walk') {
      bodyX = Math.sin(a * Math.PI * 2) * 16
      bodyY = -Math.abs(Math.sin(phase)) * 2.2
      bodyRot = Math.sin(phase) * 1.2
    } else if (robot.action === 'drive') {
      bodyX = Math.sin(a * Math.PI * 2) * 24
      bodyY = Math.sin(phase * 4) * 0.4
      bodyRot = -Math.cos(a * Math.PI * 2) * 2.5
    }
  }
  const direction = Math.cos(a * Math.PI * 2) >= 0 ? 1 : -1

  const pieceStyle = (pc) => {
    const t = clamp((p - pc.start) / PIECE_SPAN)
    const e = easeOutBack(t)
    let tx = pc.ex * (1 - e)
    let ty = pc.ey * (1 - e)
    let rot = pc.rot * (1 - e)
    let origin = `${pc.cx}% ${pc.top}%`

    if (assembled) {
      const side = pc.c < COLS / 2 ? 0 : Math.PI
      const inner = pc.c > 0 && pc.c < COLS - 1
      if (robot.action === 'walk' && pc.r >= ROWS - 2) {
        // Legs swing around the top of their piece, alternating left / right.
        const swing = pc.r === ROWS - 1 ? 9 : 5
        rot += Math.sin(phase + side) * swing * (inner ? 0.45 : 1)
        ty += Math.min(0, Math.sin(phase + side)) * 1.6
      } else if (robot.action === 'walk' && pc.r === 0) {
        ty += Math.sin(phase - 0.8) * 0.8
      } else if (robot.action === 'drive' && pc.r === ROWS - 1) {
        ty += Math.sin(phase * 6 + pc.c) * 0.5
      } else if (robot.action === 'grab' && pc.r <= 1) {
        // Upper arm pivots on the elbow; the gripper row adds its own wrist motion.
        origin = '50% 50%'
        rot += Math.sin(phase / 2) * -18 + (pc.r === 0 ? Math.sin(phase) * 6 : 0)
      }
    }

    const glow = t > 0.6 ? Math.max(0, 1 - Math.abs(p - (pc.start + PIECE_SPAN)) / 0.05) : 0
    return {
      clipPath: pc.clip,
      WebkitClipPath: pc.clip,
      transform: `translate(${tx}%, ${ty}%) rotate(${rot}deg)`,
      transformOrigin: origin,
      opacity: 0.35 + 0.65 * Math.min(1, t * 1.6 + 0.35),
      filter: glow > 0 ? `drop-shadow(0 0 ${10 * glow}px rgba(63,208,255,${0.9 * glow}))` : undefined,
    }
  }

  const label = !pieces.length
    ? 'Preparing parts…'
    : p < HOLD
      ? `Exploded view · ${pieces.length} parts`
      : !assembled
        ? `Joining part ${Math.min(pieces.length, done + 1)} of ${pieces.length}`
        : a < 0.98
          ? `Assembled! Now ${robot.actionLabel}…`
          : 'Mission complete'

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[2rem] bg-[radial-gradient(ellipse_at_50%_35%,#16295c,#0a1633_60%,#050c1f)]">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(77,147,255,.10)_1px,transparent_1px),linear-gradient(to_bottom,rgba(77,147,255,.10)_1px,transparent_1px)] bg-[size:40px_40px]" />

      {/* ground: tick marks slide while the robot moves */}
      <div className="absolute inset-x-0 bottom-[12%] h-px bg-brand-400/40" />
      <div
        className="absolute inset-x-0 bottom-[9%] h-4 opacity-60"
        style={{
          backgroundImage: 'repeating-linear-gradient(90deg, rgba(77,147,255,.55) 0 2px, transparent 2px 46px)',
          backgroundPositionX: `${-a * 1400}px`,
          maskImage: 'linear-gradient(90deg,transparent,black 20%,black 80%,transparent)',
          WebkitMaskImage: 'linear-gradient(90deg,transparent,black 20%,black 80%,transparent)',
        }}
      />

      <div className="absolute bottom-[10%] left-1/2 aspect-square w-[min(72%,58vh)] -translate-x-1/2">
        <div
          className="relative h-full w-full"
          style={{ transform: `translate(${bodyX}%, ${bodyY}%) rotate(${bodyRot}deg) scaleX(${robot.action === 'grab' ? 1 : direction})`, transition: 'none' }}
        >
          <div
            className="absolute bottom-[3%] left-1/2 h-[7%] w-[70%] -translate-x-1/2 rounded-[50%] bg-black/50 blur-md"
            style={{ opacity: 0.3 + 0.5 * (done / Math.max(1, pieces.length)) }}
          />
          {pieces.map((pc, i) => (
            <img
              key={i}
              src={robot.image}
              alt=""
              draggable={false}
              className={`absolute inset-0 h-full w-full select-none object-contain ${robot.framed ? 'rounded-xl' : ''}`}
              style={pieceStyle(pc)}
            />
          ))}
          {assembled && robot.action === 'drive' && (
            <div className="absolute top-[55%] h-[20%] w-[25%]" style={{ left: '-18%', opacity: 0.25 + 0.5 * Math.abs(Math.cos(a * Math.PI * 2)) }}>
              {[0, 1, 2].map((k) => <span key={k} className="absolute h-1 rounded-full bg-accent-400" style={{ top: `${k * 35}%`, width: `${60 + k * 15}%`, right: 0 }} />)}
            </div>
          )}
        </div>
      </div>

      <div className="absolute inset-x-5 top-5 rounded-2xl bg-white/10 p-4 text-white ring-1 ring-white/15 backdrop-blur">
        <div className="flex items-center justify-between text-sm font-semibold">
          <span>{label}</span>
          <span className="text-brand-200">{Math.round(p * 100)}%</span>
        </div>
        <div className="mt-2 flex gap-1">
          {[...pieces].sort((x, y) => x.start - y.start).map((pc, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${p >= pc.start + PIECE_SPAN ? 'bg-accent-400' : 'bg-white/20'}`} />
          ))}
          <span className="h-1.5 flex-[3] overflow-hidden rounded-full bg-white/20">
            <span className="block h-full bg-brand-400" style={{ width: `${a * 100}%` }} />
          </span>
        </div>
      </div>
    </div>
  )
}

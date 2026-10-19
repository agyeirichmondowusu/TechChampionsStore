import { useEffect, useState } from 'react'

// Champ's animated face: eyes follow the pointer and blink, the visor "mouth" is an LED
// equaliser driven by `level` (0..1), and the halo reacts to the current state.
export default function ChampAvatar({ state = 'idle', level = 0, look = { x: 0, y: 0 }, imageUrl }) {
  const [blink, setBlink] = useState(false)
  const [t, setT] = useState(0)

  useEffect(() => {
    let timer
    const loop = () => {
      timer = setTimeout(() => {
        setBlink(true)
        setTimeout(() => setBlink(false), 140)
        loop()
      }, 2200 + Math.random() * 3000)
    }
    loop()
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    let raf
    const tick = (now) => {
      setT(now / 1000)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const speaking = state === 'speaking'
  const listening = state === 'listening'
  const thinking = state === 'thinking'
  const lx = Math.max(-1, Math.min(1, look.x)) * 9
  const ly = Math.max(-1, Math.min(1, look.y)) * 6
  const breathe = Math.sin(t * 1.6) * 2
  const tilt = speaking ? Math.sin(t * 2.3) * 2 : thinking ? -4 : listening ? 3 : Math.sin(t * 0.7) * 1.2
  const eyeH = blink ? 1.5 : thinking ? 9 : 16
  const glow = listening ? 0.55 + level * 0.45 : speaking ? 0.6 + level * 0.4 : 0.45
  const bars = Array.from({ length: 13 }, (_, i) => {
    const center = 1 - Math.abs(i - 6) / 7
    if (speaking) return 3 + (level * 0.75 + 0.25 * Math.abs(Math.sin(t * 9 + i * 1.7))) * 22 * (0.35 + center * 0.65)
    if (listening) return 2 + level * 10 * center
    if (thinking) return 2 + (Math.sin(t * 6 - i * 0.6) + 1) * 3
    return 2
  })

  return (
    <div className="relative aspect-[400/430] w-full select-none">
      {/* halo rings */}
      <div className="absolute inset-[6%] rounded-full bg-brand-500/20 blur-3xl" style={{ opacity: glow }} />
      {(listening || speaking) && (
        <>
          <span className="absolute inset-[14%] rounded-full border-2 border-accent-400/60 animate-pulseRing" />
          <span className="absolute inset-[14%] rounded-full border-2 border-brand-400/50 animate-pulseRing [animation-delay:.8s]" />
        </>
      )}
      {!imageUrl && (
      <svg viewBox="0 0 400 430" className="absolute inset-0 h-full w-full overflow-visible" aria-label="Champ, the TechChampionStore AI assistant">
        <defs>
          <linearGradient id="shell" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".45" stopColor="#eef2f8" />
            <stop offset="1" stopColor="#aeb9cc" />
          </linearGradient>
          <linearGradient id="shellDark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#dfe6f1" />
            <stop offset="1" stopColor="#8d9ab2" />
          </linearGradient>
          <linearGradient id="visor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#14213f" />
            <stop offset=".6" stopColor="#060b19" />
            <stop offset="1" stopColor="#0b1530" />
          </linearGradient>
          <radialGradient id="eye" cx="50%" cy="45%" r="60%">
            <stop offset="0" stopColor="#e8fbff" />
            <stop offset=".35" stopColor="#5fd8ff" />
            <stop offset="1" stopColor="#1e74ff" />
          </radialGradient>
          <radialGradient id="joint" cx="40%" cy="35%" r="70%">
            <stop offset="0" stopColor="#7fc4ff" />
            <stop offset=".45" stopColor="#1e74ff" />
            <stop offset="1" stopColor="#06163d" />
          </radialGradient>
          <linearGradient id="neck" x1="0" x2="1">
            <stop offset="0" stopColor="#0b1020" />
            <stop offset=".5" stopColor="#2a3550" />
            <stop offset="1" stopColor="#0b1020" />
          </linearGradient>
          <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#020617" floodOpacity=".55" />
          </filter>
          <filter id="bloom" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <clipPath id="visorClip"><rect x="112" y="128" width="176" height="112" rx="52" /></clipPath>
        </defs>

        <g transform={`translate(0 ${breathe})`}>
          {/* shoulders and chest */}
          <g filter="url(#soft)">
            <path d="M60 430 C64 360 110 330 200 326 C290 330 336 360 340 430 Z" fill="url(#shell)" />
            <path d="M88 430 C96 378 130 356 166 350 L170 430 Z" fill="url(#shellDark)" opacity=".55" />
            <path d="M312 430 C304 378 270 356 234 350 L230 430 Z" fill="url(#shellDark)" opacity=".55" />
            <path d="M150 352 Q200 372 250 352" stroke="#1e74ff" strokeWidth="3" fill="none" opacity=".8" />
            <circle cx="200" cy="396" r={18 + level * 4} fill="url(#joint)" filter="url(#bloom)" opacity={0.7 + glow * 0.3} />
            <circle cx="200" cy="396" r="7" fill="#e8fbff" opacity={0.6 + level * 0.4} />
            <circle cx="92" cy="380" r="20" fill="#0b1020" />
            <circle cx="92" cy="380" r="12" fill="url(#joint)" />
            <circle cx="308" cy="380" r="20" fill="#0b1020" />
            <circle cx="308" cy="380" r="12" fill="url(#joint)" />
          </g>

          {/* neck */}
          <rect x="176" y="282" width="48" height="56" rx="10" fill="url(#neck)" />
          {[292, 306, 320].map((y) => <rect key={y} x="172" y={y} width="56" height="5" rx="2.5" fill="#1e74ff" opacity=".85" />)}

          {/* head */}
          <g transform={`rotate(${tilt} 200 200) translate(${lx * 0.35} ${ly * 0.3})`} filter="url(#soft)">
            {/* ear pods */}
            <circle cx="88" cy="188" r="30" fill="#0b1020" />
            <circle cx="88" cy="188" r="20" fill="url(#joint)" filter="url(#bloom)" opacity={0.75 + glow * 0.25} />
            <circle cx="312" cy="188" r="30" fill="#0b1020" />
            <circle cx="312" cy="188" r="20" fill="url(#joint)" filter="url(#bloom)" opacity={0.75 + glow * 0.25} />
            <rect x="306" y="96" width="6" height="56" rx="3" fill="#2a3550" transform="rotate(14 309 124)" />
            <circle cx="318" cy="94" r="7" fill="#5fd8ff" filter="url(#bloom)" opacity={listening ? 0.6 + Math.abs(Math.sin(t * 6)) * 0.4 : 0.7} />

            {/* helmet */}
            <path d="M200 58 C276 58 318 112 318 182 C318 252 282 296 200 298 C118 296 82 252 82 182 C82 112 124 58 200 58 Z" fill="url(#shell)" />
            <path d="M118 112 C140 80 170 70 200 70 C176 78 150 96 136 128 Z" fill="#ffffff" opacity=".9" />
            <path d="M282 250 C262 280 232 290 200 292 C238 280 268 258 290 222 Z" fill="#7d8aa3" opacity=".35" />
            <path d="M136 84 Q200 54 264 84" stroke="#1e74ff" strokeWidth="3" fill="none" opacity=".7" />
            {/* forehead chip */}
            <g transform="translate(200 102)">
              <rect x="-15" y="-11" width="30" height="22" rx="4" fill="#0b1530" />
              <rect x="-8" y="-5" width="16" height="10" rx="2" fill="#1e74ff" filter="url(#bloom)" opacity={0.6 + glow * 0.4} />
              {[-11, -4, 3, 10].map((x) => <rect key={x} x={x - 1} y="-15" width="2" height="4" fill="#94a3b8" />)}
            </g>

            {/* visor */}
            <rect x="106" y="122" width="188" height="124" rx="58" fill="#0b1020" />
            <rect x="112" y="128" width="176" height="112" rx="52" fill="url(#visor)" />
            <g clipPath="url(#visorClip)">
              <path d="M120 140 C170 126 240 126 282 144 L282 160 C238 142 170 142 120 158 Z" fill="#ffffff" opacity=".08" />
              {/* eyes */}
              <g transform={`translate(${lx} ${ly})`} filter="url(#bloom)">
                <ellipse cx="160" cy="172" rx="21" ry={eyeH} fill="url(#eye)" opacity={0.85 + glow * 0.15} />
                <ellipse cx="240" cy="172" rx="21" ry={eyeH} fill="url(#eye)" opacity={0.85 + glow * 0.15} />
                {!blink && (
                  <>
                    <circle cx="154" cy={166} r="4" fill="#ffffff" opacity=".9" />
                    <circle cx="234" cy={166} r="4" fill="#ffffff" opacity=".9" />
                  </>
                )}
              </g>
              {/* LED mouth */}
              <g transform="translate(200 214)" filter="url(#bloom)">
                {bars.map((h, i) => (
                  <rect key={i} x={(i - 6) * 8 - 2.5} y={-h / 2} width="5" height={h} rx="2.5" fill={i % 3 === 1 ? '#5fd8ff' : '#1e74ff'} opacity={speaking || listening || thinking ? 0.95 : 0.55} />
                ))}
              </g>
            </g>
            <rect x="112" y="128" width="176" height="112" rx="52" fill="none" stroke="#1e74ff" strokeOpacity=".5" strokeWidth="2" />
          </g>
        </g>
      </svg>
      )}
      {imageUrl && (
        <img src={imageUrl} alt="Champ" className="absolute left-1/2 top-[8%] aspect-square w-[62%] -translate-x-1/2 rounded-full object-cover ring-4 ring-brand-400/60" style={{ transform: `translateX(-50%) scale(${1 + (speaking ? level * 0.03 : 0)})`, boxShadow: `0 0 ${30 + level * 40}px rgba(30,116,255,.6)` }} />
      )}
    </div>
  )
}

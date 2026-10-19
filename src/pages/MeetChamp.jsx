import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AudioLines, Mic, MicOff, PhoneOff, Send, Sparkles, Volume2, VolumeX } from 'lucide-react'
import ChampAvatar from '../components/ChampAvatar'
import { useStore } from '../context/StoreContext'
import { localReply } from '../lib/champBrain'
import { SUPABASE_URL } from '../lib/supabase'
import { cedi } from '../lib/format'

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

const SUGGESTIONS = [
  'Which board should I use for a smart home project?',
  'Do you have ultrasonic sensors?',
  'How much is delivery to Tamale?',
  'How do I pay for my order?',
]

const forSpeech = (s) => s.replace(/\/product\/[\w-]+/g, '').replace(/https?:\/\/\S+/g, '').replace(/[*_#`•]/g, '').replace(/₵\s?([\d,.]+)/g, '$1 cedis')

function pickVoice() {
  const voices = speechSynthesis.getVoices()
  return (
    voices.find((v) => /en-GB|en-US/.test(v.lang) && /Google|Natural|Neural|Samantha|Daniel/i.test(v.name)) ||
    voices.find((v) => v.lang?.startsWith('en')) ||
    voices[0]
  )
}

export default function MeetChamp() {
  const { products, settings } = useStore()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [state, setState] = useState('idle') // idle | listening | thinking | speaking
  const [interim, setInterim] = useState('')
  const [voiceOn, setVoiceOn] = useState(true)
  const [live, setLive] = useState(false)
  const [level, setLevel] = useState(0)
  const [look, setLook] = useState({ x: 0, y: 0 })
  const [mode, setMode] = useState(null) // 'ai' | 'local'
  const liveRef = useRef(false)
  const recRef = useRef(null)
  const micRef = useRef(null)
  const listRef = useRef(null)
  const historyRef = useRef([])

  const endpoint = settings.champ_api_url || import.meta.env.VITE_CHAMP_API_URL || (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/champ-chat` : '')

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    const t = setTimeout(() => (el.scrollTop = el.scrollHeight), 300)
    return () => clearTimeout(t)
  }, [messages, interim])

  useEffect(() => {
    const move = (e) => setLook({ x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 })
    window.addEventListener('pointermove', move)
    if (canSpeak) speechSynthesis.getVoices()
    return () => {
      window.removeEventListener('pointermove', move)
      liveRef.current = false
      recRef.current?.abort()
      stopMicMeter()
      if (canSpeak) speechSynthesis.cancel()
    }
  }, [])

  // Mic level meter so the avatar reacts while the user talks.
  const startMicMeter = async () => {
    if (micRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const m = { stream, ctx, raf: 0 }
      const tick = () => {
        analyser.getByteFrequencyData(data)
        setLevel(Math.min(1, (data.reduce((a, b) => a + b, 0) / data.length / 255) * 3.2))
        m.raf = requestAnimationFrame(tick)
      }
      tick()
      micRef.current = m
    } catch {
      /* meter is cosmetic; recognition still works without it */
    }
  }
  function stopMicMeter() {
    const m = micRef.current
    if (!m) return
    cancelAnimationFrame(m.raf)
    m.stream.getTracks().forEach((t) => t.stop())
    m.ctx.close()
    micRef.current = null
    setLevel(0)
  }

  const speak = useCallback(
    (text) =>
      new Promise((resolve) => {
        if (!canSpeak || !voiceOn) return resolve()
        speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(forSpeech(text))
        const v = pickVoice()
        if (v) u.voice = v
        u.rate = 1.02
        u.pitch = 1.05
        let raf
        let boost = 0
        const anim = () => {
          boost *= 0.88
          setLevel(Math.min(1, 0.35 + Math.random() * 0.4 + boost))
          raf = requestAnimationFrame(anim)
        }
        u.onstart = () => {
          setState('speaking')
          anim()
        }
        u.onboundary = () => (boost = 0.5)
        u.onend = u.onerror = () => {
          cancelAnimationFrame(raf)
          setLevel(0)
          setState('idle')
          resolve()
        }
        speechSynthesis.speak(u)
      }),
    [voiceOn],
  )

  const ask = async (text) => {
    const q = text.trim()
    if (!q) return
    setInput('')
    setInterim('')
    setMessages((m) => [...m, { role: 'user', content: q }])
    historyRef.current = [...historyRef.current, { role: 'user', content: q }]
    setState('thinking')

    let reply
    let items = []
    if (endpoint) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(import.meta.env.VITE_SUPABASE_ANON_KEY && { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` }),
          },
          body: JSON.stringify({ messages: historyRef.current }),
        })
        const data = await res.json()
        if (!res.ok || !data.reply) throw new Error(data.error || 'No reply')
        reply = data.reply
        const slugs = [...reply.matchAll(/\/product\/([\w-]+)/g)].map((m) => m[1])
        items = products.filter((p) => slugs.includes(p.slug)).slice(0, 4)
        setMode('ai')
      } catch (e) {
        console.warn('Champ AI endpoint failed, using offline answers.', e)
      }
    }
    if (!reply) {
      const r = localReply(q, { products, settings })
      reply = r.reply
      items = r.products
      setMode('local')
    }

    historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }]
    setMessages((m) => [...m, { role: 'assistant', content: reply, products: items }])
    setState('idle')
    await speak(reply)
    if (liveRef.current) listen()
  }

  const listen = () => {
    if (!SpeechRecognition) {
      alert('Voice input needs Chrome, Edge or Safari. You can still type your question.')
      return
    }
    if (canSpeak) speechSynthesis.cancel()
    recRef.current?.abort()
    const rec = new SpeechRecognition()
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.continuous = false
    let finalText = ''
    rec.onstart = () => {
      setState('listening')
      startMicMeter()
    }
    rec.onresult = (e) => {
      let txt = ''
      for (const r of e.results) {
        txt += r[0].transcript
        if (r.isFinal) finalText = txt
      }
      setInterim(txt)
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') {
        liveRef.current = false
        setLive(false)
        alert('Microphone access was blocked. Allow it in your browser to talk to Champ.')
      }
    }
    rec.onend = () => {
      stopMicMeter()
      recRef.current = null
      if (finalText.trim()) ask(finalText)
      else {
        setInterim('')
        setState('idle')
        // In live mode keep listening through silences.
        if (liveRef.current) setTimeout(() => liveRef.current && listen(), 250)
      }
    }
    recRef.current = rec
    rec.start()
  }

  const toggleLive = () => {
    if (live) {
      liveRef.current = false
      setLive(false)
      recRef.current?.abort()
      if (canSpeak) speechSynthesis.cancel()
      setState('idle')
      return
    }
    liveRef.current = true
    setLive(true)
    setVoiceOn(true)
    if (!messages.length) {
      const hello = "Hi, I'm Champ. I'm listening, go ahead and ask me anything."
      setMessages([{ role: 'assistant', content: hello }])
      historyRef.current = [{ role: 'assistant', content: hello }]
      speak(hello).then(() => liveRef.current && listen())
    } else listen()
  }

  const status = {
    idle: live ? 'Live conversation on' : 'Ask me anything about components, projects or orders',
    listening: 'Listening…',
    thinking: 'Thinking…',
    speaking: 'Speaking…',
  }[state]

  return (
    <div className="relative flex h-[calc(100dvh-var(--header-h,156px))] flex-col overflow-hidden bg-[radial-gradient(ellipse_at_50%_0%,#16295c,#0a1633_55%,#050c1f)] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(77,147,255,.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(77,147,255,.07)_1px,transparent_1px)] bg-[size:44px_44px]" />

      <div className="container-x relative flex min-h-0 flex-1 flex-col items-center pt-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.25em] text-brand-200">
          <Sparkles size={14} /> Meet Champ
          {mode && <span className="rounded-full bg-white/10 px-2 py-0.5 normal-case tracking-normal text-brand-100">{mode === 'ai' ? 'AI mode' : 'Store assistant mode'}</span>}
        </div>

        <button
          onClick={() => (state === 'speaking' ? speechSynthesis.cancel() : null)}
          className={`mt-1 shrink-0 cursor-default transition-all duration-500 ${messages.length ? 'w-[min(190px,38vw)]' : 'w-[min(330px,70vw,42vh)]'}`}
          aria-label="Champ avatar"
          tabIndex={-1}
        >
          <ChampAvatar state={state} level={level} look={look} imageUrl={settings.champ_avatar_url} />
        </button>
        <p className="mt-1 h-6 shrink-0 text-center text-sm font-medium text-brand-100">{status}</p>

        <div ref={listRef} className="no-scrollbar mt-3 min-h-0 w-full max-w-3xl flex-1 space-y-3 overflow-y-auto pb-4">
          {!messages.length && (
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-full bg-white/10 px-4 py-2 text-sm text-brand-50 ring-1 ring-white/15 transition hover:bg-white/20">
                  {s}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fadeIn`}>
              <div className={`max-w-[85%] rounded-3xl px-5 py-3 text-sm leading-relaxed ${m.role === 'user' ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md bg-white/10 text-brand-50 ring-1 ring-white/10 backdrop-blur'}`}>
                <p className="whitespace-pre-line">{m.content.replace(/\(?\/product\/[\w-]+\)?/g, '').trim()}</p>
                {m.products?.length > 0 && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {m.products.map((p) => (
                      <Link key={p.id} to={`/product/${p.slug}`} className="flex items-center gap-3 rounded-2xl bg-white p-2 text-navy-900 transition hover:ring-2 hover:ring-brand-400">
                        <img src={p.image_url} alt="" className="h-12 w-12 rounded-xl bg-brand-50 object-cover" />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold">{p.name}</span>
                          <span className="text-xs font-bold text-brand-700">{cedi(p.price)}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {interim && state === 'listening' && (
            <div className="flex justify-end"><div className="max-w-[85%] rounded-3xl rounded-br-md bg-brand-600/50 px-5 py-3 text-sm italic">{interim}</div></div>
          )}
          {state === 'thinking' && (
            <div className="flex gap-1 px-2">
              {[0, 1, 2].map((k) => <span key={k} className="h-2 w-2 animate-bounce rounded-full bg-brand-300" style={{ animationDelay: `${k * 0.15}s` }} />)}
            </div>
          )}
        </div>
      </div>

      <div className="relative z-30 shrink-0 bg-gradient-to-t from-navy-950 via-navy-950/95 to-transparent pb-5 pt-3">
        <div className="container-x max-w-3xl">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              ask(input)
            }}
            className="flex items-center gap-2 rounded-full bg-white p-1.5 shadow-glow"
          >
            <button type="button" onClick={() => setVoiceOn(!voiceOn)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-navy-800 hover:bg-brand-50" title={voiceOn ? 'Mute Champ' : 'Unmute Champ'} aria-label="Toggle voice">
              {voiceOn ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </button>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your question…" className="min-w-0 flex-1 bg-transparent px-2 text-sm text-navy-900 outline-none" aria-label="Message Champ" />
            <button
              type="button"
              onClick={() => (state === 'listening' && !live ? recRef.current?.stop() : listen())}
              disabled={live}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition ${state === 'listening' && !live ? 'bg-brand-600 text-white' : 'text-navy-800 hover:bg-brand-50'} disabled:opacity-40`}
              title="Record a voice question"
              aria-label="Record voice"
            >
              {state === 'listening' && !live ? <MicOff size={19} /> : <Mic size={19} />}
            </button>
            <button disabled={!input.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40" aria-label="Send">
              <Send size={18} />
            </button>
          </form>
          <div className="mt-3 flex justify-center">
            <button onClick={toggleLive} className={`btn px-6 ${live ? 'bg-white text-navy-900' : 'bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20'}`}>
              {live ? <><PhoneOff size={16} /> End live conversation</> : <><AudioLines size={16} /> Start live voice conversation</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

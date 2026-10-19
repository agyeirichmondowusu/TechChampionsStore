import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Lock, Mail, User } from 'lucide-react'
import { useStore } from '../context/StoreContext'
import { signIn, signUp } from '../lib/api'
import { isDemo } from '../lib/supabase'

function Shell({ title, subtitle, children }) {
  return (
    <div className="container-x grid place-items-center py-14">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-card">
        <div className="bg-gradient-to-br from-navy-900 to-brand-700 px-8 py-8 text-center text-white">
          <img src="/logo-512.png" alt="" className="mx-auto h-16 w-16 rounded-2xl bg-white object-contain p-1" />
          <h1 className="mt-4 text-2xl font-black">{title}</h1>
          <p className="text-sm text-brand-100">{subtitle}</p>
        </div>
        <div className="p-8">{children}</div>
      </div>
    </div>
  )
}

const Field = ({ icon: Icon, ...props }) => (
  <div className="relative">
    <Icon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
    <input className="input pl-11" required {...props} />
  </div>
)

export function Login() {
  const { setUser } = useStore()
  const navigate = useNavigate()
  const [f, setF] = useState({ email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const u = await signIn(f)
      setUser(u)
      navigate(u?.isAdmin ? '/admin' : '/')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title="Welcome back" subtitle="Log in to track orders and save your details">
      <form onSubmit={submit} className="space-y-4">
        <Field icon={Mail} type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
        <Field icon={Lock} type="password" placeholder="Password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
        {err && <p className="rounded-xl bg-brand-50 px-4 py-2 text-sm font-medium text-brand-800">{err}</p>}
        <button disabled={busy} className="btn-primary w-full py-3">{busy ? 'Logging in…' : 'Login'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">New here? <Link to="/signup" className="font-semibold text-brand-700 hover:underline">Create an account</Link></p>
      {isDemo && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Demo mode: the admin login is admin@techchampionstore.com with the password from VITE_DEMO_ADMIN_PASSWORD.</p>}
    </Shell>
  )
}

export function Signup() {
  const { setUser } = useStore()
  const navigate = useNavigate()
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (f.password.length < 6) return setErr('Password must be at least 6 characters.')
    setBusy(true)
    setErr('')
    try {
      const { user, needsConfirmation } = await signUp(f)
      if (needsConfirmation) setMsg('Check your email to confirm your account, then log in.')
      else {
        setUser(isDemo ? user : { id: user.id, email: user.email, name: f.name, isAdmin: false })
        navigate('/')
      }
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title="Create your account" subtitle="Faster checkout and order history">
      {msg ? (
        <p className="rounded-xl bg-brand-50 p-4 text-sm font-medium text-brand-800">{msg}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field icon={User} placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
          <Field icon={Mail} type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
          <Field icon={Lock} type="password" placeholder="Password (6+ characters)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
          {err && <p className="rounded-xl bg-brand-50 px-4 py-2 text-sm font-medium text-brand-800">{err}</p>}
          <button disabled={busy} className="btn-primary w-full py-3">{busy ? 'Creating…' : 'Sign up'}</button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-slate-500">Already have an account? <Link to="/login" className="font-semibold text-brand-700 hover:underline">Login</Link></p>
      <p className="mt-2 text-center text-xs text-slate-400">You can also order without an account.</p>
    </Shell>
  )
}

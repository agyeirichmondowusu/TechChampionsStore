import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { LogOut, Mail, Menu, Phone, Shield, ShoppingCart, Truck, User, X } from 'lucide-react'
import { useStore } from '../context/StoreContext'
import { signOut } from '../lib/api'
import SearchBar from './SearchBar'
import { CATEGORIES } from '../data/defaultSettings'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/products', label: 'Our Products' },
  { to: '/robots', label: 'Robots' },
  { to: '/slicer', label: '3D Slicer' },
  { to: '/simulator', label: 'Simulator' },
  { to: '/meet-champ', label: 'Meet Champ' },
]

const navClass = ({ isActive }) =>
  `rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 ${
    isActive ? 'bg-brand-600 text-white shadow-glow' : 'text-navy-800 hover:bg-brand-50 hover:text-brand-700'
  }`

export function Wordmark({ className = '' }) {
  return (
    <span className={`font-display font-black tracking-tight ${className}`}>
      <span className="text-navy-900">TechChampion</span>
      <span className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent">Store</span>
    </span>
  )
}

export default function Header() {
  const { cartCount, user, setUser, settings } = useStore()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const ref = useRef(null)

  // Sticky panels (robot stage) sit below the header, so publish its height as a CSS variable.
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => document.documentElement.style.setProperty('--header-h', `${Math.round(e.target.offsetHeight)}px`))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  const logout = async () => {
    await signOut()
    setUser(null)
    navigate('/')
  }

  const auth = user ? (
    <div className="flex items-center gap-2">
      {user.isAdmin && (
        <NavLink to="/admin" className={navClass}>
          <span className="inline-flex items-center gap-1.5"><Shield size={15} /> Admin</span>
        </NavLink>
      )}
      <span className="hidden items-center gap-1.5 text-sm font-medium text-slate-600 xl:inline-flex">
        <User size={15} /> {user.name?.split(' ')[0]}
      </span>
      <button onClick={logout} className="btn-ghost px-3 py-2" title="Log out">
        <LogOut size={15} />
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <NavLink to="/login" className={navClass}>Login</NavLink>
      <NavLink
        to="/signup"
        className={({ isActive }) => `btn px-4 py-2 ${isActive ? 'bg-navy-900 text-white' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
      >
        Sign up
      </NavLink>
    </div>
  )

  return (
    <header ref={ref} className="sticky top-0 z-40">
      <div className="bg-navy-900 text-xs text-brand-100">
        <div className="container-x flex h-9 items-center justify-between gap-4">
          <div className="flex items-center gap-4 overflow-hidden whitespace-nowrap">
            {settings.phones.map((p) => (
              <a key={p} href={`tel:${p}`} className="inline-flex items-center gap-1.5 hover:text-white">
                <Phone size={13} /> {p}
              </a>
            ))}
            <a href={`mailto:${settings.email}`} className="hidden items-center gap-1.5 hover:text-white md:inline-flex">
              <Mail size={13} /> {settings.email}
            </a>
          </div>
          <Link to="/delivery" className="hidden items-center gap-1.5 hover:text-white sm:inline-flex">
            <Truck size={13} /> Nationwide delivery · Free pickup at KNUST
          </Link>
        </div>
      </div>

      <div className="border-b border-slate-200/70 bg-white/95 backdrop-blur">
        <div className="container-x flex h-16 items-center gap-3">
          <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="TechChampionStore home">
            <img src="/logo-512.png" alt="TechChampionStore logo" className="h-12 w-12 rounded-xl object-contain" />
            <Wordmark className="hidden text-lg sm:inline lg:text-xl" />
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={navClass}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 lg:ml-0">
            <div className="hidden lg:block">{auth}</div>
            <span className="hidden h-8 w-px bg-slate-200 lg:block" />
            <NavLink to="/cart" className={navClass} aria-label={`Cart, ${cartCount} items`}>
              <span className="relative inline-flex items-center gap-2">
                <span className="hidden sm:inline">Cart</span>
                <ShoppingCart size={20} />
                {cartCount > 0 && (
                  <span className="absolute -right-3 -top-3 grid h-5 min-w-5 place-items-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">
                    {cartCount}
                  </span>
                )}
              </span>
            </NavLink>
            <button className="rounded-full p-2 text-navy-900 hover:bg-brand-50 lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        <div className="container-x flex items-center gap-4 pb-3">
          <SearchBar />
          <div className="no-scrollbar hidden gap-1 overflow-x-auto xl:flex">
            {CATEGORIES.map((c) => (
              <Link key={c.id} to={`/products?category=${c.id}`} className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-brand-50 hover:text-brand-700">
                {c.name}
              </Link>
            ))}
          </div>
        </div>

        {open && (
          <div className="border-t border-slate-100 bg-white lg:hidden" onClick={() => setOpen(false)}>
            <nav className="container-x flex flex-col gap-1 py-3">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className={navClass}>
                  {n.label}
                </NavLink>
              ))}
              <div className="mt-2 border-t border-slate-100 pt-3">{auth}</div>
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}

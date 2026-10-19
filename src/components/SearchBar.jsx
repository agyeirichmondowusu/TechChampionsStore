import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useStore } from '../context/StoreContext'
import { CATEGORIES } from '../data/defaultSettings'
import { cedi } from '../lib/format'

// Scores name hits above type/category/description hits so the best match is first.
export function searchProducts(products, query, category = '') {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  return products
    .filter((p) => !category || p.category === category)
    .map((p) => {
      const name = p.name.toLowerCase()
      const rest = `${p.type} ${p.category} ${p.short_description}`.toLowerCase()
      let score = 0
      for (const t of terms) {
        if (name.includes(t)) score += name.startsWith(t) ? 4 : 3
        else if (rest.includes(t)) score += 1
        else return null
      }
      return { p, score }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p)
}

export default function SearchBar() {
  const { products } = useStore()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const box = useRef(null)

  const results = useMemo(() => (q.trim() ? searchProducts(products, q, cat).slice(0, 8) : []), [products, q, cat])

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const go = (path) => {
    setOpen(false)
    setQ('')
    navigate(path)
  }

  const submit = (e) => {
    e.preventDefault()
    go(`/products?q=${encodeURIComponent(q)}${cat ? `&category=${cat}` : ''}`)
  }

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(results.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(-1, a - 1))
    } else if (e.key === 'Enter' && active >= 0 && results[active]) {
      e.preventDefault()
      go(`/product/${results[active].slug}`)
    } else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={box} className="relative flex-1">
      <form onSubmit={submit} className="flex h-11 items-stretch overflow-hidden rounded-full border-2 border-brand-600 bg-white focus-within:ring-4 focus-within:ring-brand-100">
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="hidden border-r border-slate-200 bg-brand-50 px-3 text-xs font-semibold text-navy-800 outline-none sm:block" aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Search Arduino, ESP32, sensors, servos, 3D printers..."
          className="min-w-0 flex-1 px-4 text-sm outline-none"
          aria-label="Search products"
        />
        <button className="flex items-center gap-2 bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">
          <Search size={18} /> <span className="hidden sm:inline">Search</span>
        </button>
      </form>

      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl animate-fadeIn">
          {results.length === 0 ? (
            <p className="px-4 py-5 text-sm text-slate-500">No components match “{q}”. Try another word or ask Champ.</p>
          ) : (
            <ul>
              {results.map((p, i) => (
                <li key={p.id}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(`/product/${p.slug}`)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === active ? 'bg-brand-50' : ''}`}
                  >
                    <img src={p.image_url} alt="" className="h-11 w-11 rounded-lg bg-brand-50 object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-navy-900">{p.name}</span>
                      <span className="text-xs text-slate-500">{p.type} · {p.stock > 0 ? `${p.stock} left` : 'Out of stock'}</span>
                    </span>
                    <span className="text-sm font-bold text-brand-700">{cedi(p.price)}</span>
                  </button>
                </li>
              ))}
              <li>
                <button onClick={submit} className="w-full border-t border-slate-100 px-4 py-2.5 text-left text-sm font-semibold text-brand-700 hover:bg-brand-50">
                  See all results for “{q}”
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

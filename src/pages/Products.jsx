import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, X } from 'lucide-react'
import { useStore } from '../context/StoreContext'
import { CATEGORIES } from '../data/defaultSettings'
import ProductGrid from '../components/ProductGrid'
import { searchProducts } from '../components/SearchBar'
import { GridSkeleton } from './Home'

const SORTS = {
  relevance: 'Best match',
  newest: 'Newest',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  popular: 'Best selling',
}

export default function Products() {
  const { products, loading } = useStore()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const category = params.get('category') || ''
  const sort = params.get('sort') || 'relevance'
  const inStock = params.get('stock') === '1'
  const max = Number(params.get('max')) || 0

  const set = (k, v) => {
    const p = new URLSearchParams(params)
    v ? p.set(k, v) : p.delete(k)
    setParams(p, { replace: true })
  }

  const list = useMemo(() => {
    let l = q ? searchProducts(products, q, category) : products.filter((p) => !category || p.category === category)
    if (inStock) l = l.filter((p) => p.stock > 0)
    if (max) l = l.filter((p) => Number(p.price) <= max)
    const by = {
      newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      popular: (a, b) => (b.sold || 0) - (a.sold || 0),
    }[sort]
    return by ? [...l].sort(by) : l
  }, [products, q, category, inStock, max, sort])

  const catName = CATEGORIES.find((c) => c.id === category)?.name

  return (
    <div className="container-x py-8">
      <div className="mb-6">
        <h1 className="section-title">{catName || 'Our Products'}</h1>
        <p className="text-sm text-slate-500">
          {list.length} items{q && <> matching “<b className="text-navy-900">{q}</b>”</>}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-5">
          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><SlidersHorizontal size={16} /> Categories</h3>
            <div className="flex flex-wrap gap-2 lg:flex-col">
              {[{ id: '', name: 'All products' }, ...CATEGORIES].map((c) => (
                <button
                  key={c.id}
                  onClick={() => set('category', c.id)}
                  className={`rounded-xl px-3 py-2 text-left text-sm font-medium transition ${category === c.id ? 'bg-brand-600 text-white' : 'bg-slate-50 text-navy-800 hover:bg-brand-50'}`}
                >
                  {c.name}
                  <span className="ml-1 opacity-60">({c.id ? products.filter((p) => p.category === c.id).length : products.length})</span>
                </button>
              ))}
            </div>
          </div>
          <div className="card space-y-4 p-5">
            <div>
              <label className="label" htmlFor="max">Max price (₵)</label>
              <input id="max" type="number" min="0" className="input" placeholder="Any" value={max || ''} onChange={(e) => set('max', e.target.value)} />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={inStock} onChange={(e) => set('stock', e.target.checked ? '1' : '')} className="h-4 w-4 accent-brand-600" />
              In stock only
            </label>
          </div>
        </aside>

        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {q && <Pill onClear={() => set('q', '')}>Search: {q}</Pill>}
            {catName && <Pill onClear={() => set('category', '')}>{catName}</Pill>}
            <div className="ml-auto flex items-center gap-2 text-sm">
              <span className="text-slate-500">Sort by</span>
              <select value={sort} onChange={(e) => set('sort', e.target.value)} className="input w-auto py-2">
                {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          {loading ? <GridSkeleton /> : <ProductGrid products={list} resetKey={`${q}|${category}|${sort}|${inStock}|${max}`} />}
        </div>
      </div>
    </div>
  )
}

const Pill = ({ children, onClear }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 py-1 pl-3 pr-1 text-xs font-semibold text-brand-800">
    {children}
    <button onClick={onClear} className="grid h-5 w-5 place-items-center rounded-full hover:bg-brand-200" aria-label="Clear"><X size={12} /></button>
  </span>
)

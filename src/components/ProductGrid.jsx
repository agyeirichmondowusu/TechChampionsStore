import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, PackageSearch } from 'lucide-react'
import ProductCard from './ProductCard'
import QuickView from './QuickView'
import { useStore } from '../context/StoreContext'

// Grid size (columns × rows) comes from Admin > Site settings.
export default function ProductGrid({ products, resetKey }) {
  const { settings } = useStore()
  const cols = Math.max(1, Number(settings.grid_columns) || 4)
  const pageSize = Math.max(1, cols * (Number(settings.grid_rows) || 4))
  const [page, setPage] = useState(1)
  const [quick, setQuick] = useState(null)
  const top = useRef(null)
  const pages = Math.max(1, Math.ceil(products.length / pageSize))

  useEffect(() => setPage(1), [resetKey, pageSize])

  const goto = (n) => {
    setPage(Math.min(pages, Math.max(1, n)))
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!products.length) {
    return (
      <div className="card grid place-items-center py-16 text-center">
        <PackageSearch size={44} className="mb-3 text-brand-400" />
        <p className="font-semibold">No products found</p>
        <p className="text-sm text-slate-500">Try another search or category.</p>
      </div>
    )
  }

  const visible = products.slice((page - 1) * pageSize, page * pageSize)
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1)

  return (
    <div ref={top} className="scroll-mt-40">
      <div
        style={{ '--cols': cols }}
        className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
      >
        {visible.map((p) => (
          <ProductCard key={p.id} product={p} onQuickView={setQuick} />
        ))}
      </div>

      <nav className="mt-8 flex flex-wrap items-center justify-center gap-2" aria-label="Pagination">
        <button onClick={() => goto(page - 1)} disabled={page === 1} className="btn-ghost">
          <ChevronLeft size={16} /> Previous
        </button>
        {nums.map((n, i) => (
          <span key={n} className="flex items-center gap-2">
            {i > 0 && n - nums[i - 1] > 1 && <span className="text-slate-400">…</span>}
            <button
              onClick={() => goto(n)}
              className={`h-10 w-10 rounded-full text-sm font-semibold transition ${n === page ? 'bg-brand-600 text-white shadow-glow' : 'bg-white text-navy-800 ring-1 ring-slate-200 hover:ring-brand-400'}`}
              aria-current={n === page ? 'page' : undefined}
            >
              {n}
            </button>
          </span>
        ))}
        <button onClick={() => goto(page + 1)} disabled={page === pages} className="btn-primary">
          Next <ChevronRight size={16} />
        </button>
      </nav>
      <p className="mt-3 text-center text-xs text-slate-500">
        Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, products.length)} of {products.length} products
      </p>

      {quick && <QuickView product={quick} onClose={() => setQuick(null)} />}
    </div>
  )
}

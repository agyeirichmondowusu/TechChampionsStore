import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, ImagePlus, Loader2, RefreshCw, Upload } from 'lucide-react'
import { useStore } from '../context/StoreContext'
import * as api from '../lib/api'
import { CATEGORIES } from '../data/defaultSettings'
import { cedi } from '../lib/format'
import { COLUMNS, exportCatalog, imageFileNames, planImport, readRows, rowToProduct } from '../lib/catalogSheet'

const LABEL = Object.fromEntries(COLUMNS.map((c) => [c.key, c.header]))
const catName = (id) => CATEGORIES.find((c) => c.id === id)?.name || id

function show(key, v) {
  if (v === null || v === undefined || v === '') return '—'
  if (key === 'price' || key === 'old_price') return cedi(v)
  if (key === 'category') return catName(v)
  if (key === 'is_active') return v ? 'Visible' : 'Hidden'
  if (key === 'specs') return Object.entries(v).map(([k, x]) => `${k}: ${x}`).join('; ')
  const s = String(v)
  return s.length > 60 ? s.slice(0, 57) + '…' : s
}

const KIND = {
  update: { label: 'Update', cls: 'bg-brand-100 text-brand-800' },
  new: { label: 'New', cls: 'bg-emerald-100 text-emerald-800' },
  same: { label: 'No change', cls: 'bg-slate-100 text-slate-500' },
  error: { label: 'Fix needed', cls: 'bg-rose-100 text-rose-700' },
}

export default function AdminImport() {
  const { refreshProducts, notify } = useStore()
  const [all, setAll] = useState([])
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [images, setImages] = useState({}) // lower-case file name -> File
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [done, setDone] = useState(null)
  const sheetInput = useRef(null)

  const load = () => api.listProducts({ includeInactive: true }).then(setAll)
  useEffect(() => { load() }, [])

  const onSheet = async (file) => {
    if (!file) return
    setError('')
    setDone(null)
    setResult(null)
    setFileName(file.name)
    try {
      const fresh = await api.listProducts({ includeInactive: true })
      setAll(fresh)
      setResult(planImport(await readRows(file), fresh))
    } catch (e) {
      setError(e.message || 'Could not read that file.')
    }
  }

  const plan = result?.plan || []
  const todo = plan.filter((r) => r.kind === 'update' || r.kind === 'new')
  const counts = Object.fromEntries(Object.keys(KIND).map((k) => [k, plan.filter((r) => r.kind === k).length]))
  const wantedImages = imageFileNames(plan)
  const missingImages = wantedImages.filter((n) => !images[n])

  const apply = async () => {
    setBusy(true)
    const failed = []
    const urls = {}
    try {
      // Upload pictures referenced by file name first, into the folder of the product's category.
      const needed = todo.filter((r) => r.fields.image_url && images[r.fields.image_url.toLowerCase()])
      for (const r of needed) {
        const key = r.fields.image_url.toLowerCase()
        if (urls[key]) continue
        setProgress({ label: `Uploading ${images[key].name}`, n: Object.keys(urls).length, of: needed.length })
        urls[key] = await api.uploadImage(images[key], r.fields.category || r.product?.category || 'misc')
      }
      for (const [i, r] of todo.entries()) {
        setProgress({ label: `Saving ${r.fields.name || r.product?.name}`, n: i, of: todo.length })
        const product = rowToProduct(r, urls)
        // Leave the old picture alone when the sheet names a file that wasn't selected.
        if (r.fields.image_url && !/^(https?:|data:|\/)/i.test(r.fields.image_url) && !urls[r.fields.image_url.toLowerCase()]) {
          product.image_url = r.product?.image_url || ''
        }
        try {
          await api.saveProduct(product)
        } catch (e) {
          failed.push({ line: r.line, name: product.name, message: e.message })
        }
      }
      await Promise.all([load(), refreshProducts()])
      const ok = todo.length - failed.length
      setDone({ updated: todo.filter((r) => r.kind === 'update').length, created: todo.filter((r) => r.kind === 'new').length, failed })
      setResult(null)
      notify(failed.length ? `${ok} products saved, ${failed.length} failed` : `${ok} products updated from ${fileName}`)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="card p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold"><FileSpreadsheet size={20} className="text-brand-600" /> Update products from Excel</h2>
          <p className="mt-1 text-sm text-slate-500">
            Upload an .xlsx or .csv file with one product per row. Rows that match an existing product (by Slug or Name) update it on the live site; new names are added as new products. Empty cells keep the current value.
          </p>

          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onSheet(e.dataTransfer.files[0]) }}
            className="mt-5 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/50 p-8 text-center transition hover:border-brand-400 hover:bg-brand-50"
          >
            <Upload className="text-brand-600" />
            <span className="font-semibold text-navy-900">{fileName ? `Selected: ${fileName}` : 'Drop your Excel file here, or click to choose'}</span>
            <span className="text-xs text-slate-500">.xlsx or .csv</span>
            <input ref={sheetInput} type="file" accept=".xlsx,.csv,.xls" className="hidden" onChange={(e) => { onSheet(e.target.files[0]); e.target.value = '' }} />
          </label>

          {error && <p className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}</p>}

          {done && (
            <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
              <p className="flex items-center gap-2 font-semibold"><CheckCircle2 size={16} /> Website updated: {done.updated} products changed, {done.created} added.</p>
              {done.failed.map((f) => <p key={f.line} className="mt-1 text-rose-700">Row {f.line} ({f.name}) failed: {f.message}</p>)}
            </div>
          )}
        </div>

        <div className="card space-y-4 p-6 text-sm">
          <div>
            <h3 className="font-bold">Start from your current catalogue</h3>
            <p className="mt-1 text-slate-500">Download every product ({all.length}) as Excel, edit prices or stock, then upload it back.</p>
            <button onClick={() => exportCatalog(all)} disabled={!all.length} className="btn-primary mt-3 w-full"><Download size={16} /> Download catalogue (.xlsx)</button>
          </div>
          <div>
            <h3 className="font-bold">Columns it understands</h3>
            <p className="mt-1 text-slate-500">Only <b>Name</b> is required to update. New products also need <b>Category</b> and <b>Price</b>.</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {COLUMNS.map((c) => <span key={c.key} className="chip">{c.header}</span>)}
            </div>
            <p className="mt-2 text-xs text-slate-500">Category: {CATEGORIES.map((c) => c.name).join(', ')}. Visible: Yes/No. Specs: “Voltage: 5V; Pins: 20”. Image: a web link, or a file name such as esp32.jpg that you select below.</p>
          </div>
        </div>
      </div>

      {result && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
            <h3 className="mr-auto font-bold">Preview of {fileName}</h3>
            {Object.entries(KIND).map(([k, { label, cls }]) => counts[k] > 0 && <span key={k} className={`chip ${cls}`}>{counts[k]} {label}</span>)}
          </div>

          {wantedImages.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-brand-50/40 p-4 text-sm">
              <ImagePlus size={18} className="text-brand-600" />
              <span className="flex-1">
                The sheet names {wantedImages.length} picture file{wantedImages.length > 1 ? 's' : ''}.{' '}
                {missingImages.length ? <>Select them to upload ({missingImages.length} still missing: {missingImages.slice(0, 4).join(', ')}{missingImages.length > 4 ? '…' : ''}).</> : 'All selected.'}
              </span>
              <label className="btn-ghost cursor-pointer">
                Select pictures
                <input
                  type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => setImages((m) => ({ ...m, ...Object.fromEntries([...e.target.files].map((f) => [f.name.toLowerCase(), f])) }))}
                />
              </label>
            </div>
          )}

          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="p-3">Row</th><th className="p-3">Product</th><th className="p-3">Action</th><th className="p-3">What changes</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plan.map((r) => (
                  <tr key={r.line} className={r.kind === 'same' ? 'text-slate-400' : ''}>
                    <td className="p-3 text-xs">{r.line}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {r.product?.image_url && <img src={r.product.image_url} alt="" className="h-10 w-10 rounded-lg bg-brand-50 object-cover" />}
                        <span className="max-w-[240px] font-semibold">{r.product?.name || r.fields.name || '(no name)'}</span>
                      </div>
                    </td>
                    <td className="p-3"><span className={`chip ${KIND[r.kind].cls}`}>{KIND[r.kind].label}</span></td>
                    <td className="p-3">
                      {r.kind === 'error' && r.errors.map((e) => <p key={e} className="text-rose-700">{e}</p>)}
                      {r.kind === 'update' && Object.entries(r.changes).map(([k, { before, after }]) => (
                        <p key={k}><span className="text-slate-500">{LABEL[k]}:</span> <s className="text-slate-400">{show(k, before)}</s> → <b>{show(k, after)}</b></p>
                      ))}
                      {r.kind === 'new' && (
                        <p>{catName(r.fields.category)} · {cedi(r.fields.price)} · {r.fields.stock ?? 0} in stock</p>
                      )}
                      {r.kind === 'same' && 'Already up to date'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 p-4">
            <p className="mr-auto text-sm text-slate-500">
              {todo.length ? `${counts.update} products will be updated and ${counts.new} added on the live site.` : 'Nothing to change.'}
              {counts.error > 0 && ` ${counts.error} row${counts.error > 1 ? 's' : ''} with problems will be skipped.`}
            </p>
            <button onClick={() => { setResult(null); setFileName('') }} className="btn-ghost" disabled={busy}>Cancel</button>
            <button onClick={() => sheetInput.current?.click()} className="btn-ghost" disabled={busy}><RefreshCw size={16} /> Choose another file</button>
            <button onClick={apply} disabled={busy || !todo.length} className="btn-primary">
              {busy ? <><Loader2 size={16} className="animate-spin" /> {progress ? `${progress.label} (${progress.n + 1}/${progress.of})` : 'Working…'}</> : <><CheckCircle2 size={16} /> Apply {todo.length} change{todo.length === 1 ? '' : 's'}</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

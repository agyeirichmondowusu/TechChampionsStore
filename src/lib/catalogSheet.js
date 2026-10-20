import { readSheet } from 'read-excel-file/browser'
import writeExcelFile from 'write-excel-file/browser'
import { CATEGORIES } from '../data/defaultSettings'
import { slugify } from './format'

// Spreadsheet columns the importer understands. Header matching ignores case, spaces and
// punctuation, so "Old Price", "old_price" and "OLD-PRICE" all work.
export const COLUMNS = [
  { key: 'slug', header: 'Slug', aliases: ['slug', 'id', 'sku', 'code', 'productcode'] },
  { key: 'name', header: 'Name', aliases: ['name', 'product', 'productname', 'title', 'item', 'component'] },
  { key: 'category', header: 'Category', aliases: ['category', 'cat', 'folder'] },
  { key: 'type', header: 'Type', aliases: ['type', 'subtype', 'kind'] },
  { key: 'price', header: 'Price', aliases: ['price', 'priceghs', 'pricecedis', 'sellingprice', 'cost', 'amount'] },
  { key: 'old_price', header: 'Old Price', aliases: ['oldprice', 'wasprice', 'compareatprice', 'originalprice'] },
  { key: 'stock', header: 'Remaining', aliases: ['remaining', 'stock', 'qty', 'quantity', 'instock', 'available', 'unitsremaining'] },
  { key: 'short_description', header: 'Short Description', aliases: ['shortdescription', 'summary', 'brief', 'shortdesc'] },
  { key: 'description', header: 'Description', aliases: ['description', 'fulldescription', 'details', 'desc'] },
  { key: 'image_url', header: 'Image', aliases: ['image', 'imageurl', 'picture', 'photo', 'img', 'imagefile'] },
  { key: 'video_url', header: 'YouTube Link', aliases: ['youtubelink', 'youtube', 'video', 'videourl', 'videolink', 'tutorial'] },
  { key: 'specs', header: 'Specs', aliases: ['specs', 'specifications', 'spec'] },
  { key: 'is_active', header: 'Visible', aliases: ['visible', 'active', 'isactive', 'show', 'published'] },
]

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const NUMERIC = new Set(['price', 'old_price', 'stock'])

function toCategory(v) {
  const n = norm(v)
  if (!n) return null
  const hit = CATEGORIES.find((c) => norm(c.id) === n || norm(c.name) === n || norm(c.name).startsWith(n) || n.startsWith(norm(c.name).replace(/s$/, '')))
  return hit?.id || null
}

function toNumber(v) {
  if (typeof v === 'number') return v
  const n = Number(String(v).replace(/[₵,\s]|ghs|gh¢|cedis?/gi, ''))
  return Number.isFinite(n) ? n : NaN
}

function toBool(v) {
  if (typeof v === 'boolean') return v
  const n = norm(v)
  if (['yes', 'y', 'true', '1', 'visible', 'active', 'show'].includes(n)) return true
  if (['no', 'n', 'false', '0', 'hidden', 'inactive', 'hide'].includes(n)) return false
  return null
}

// "Voltage: 5V; Pins: 20" or one "Key: Value" per line → { Voltage: '5V', Pins: '20' }
const toSpecs = (v) =>
  Object.fromEntries(
    String(v)
      .split(/[;\n]/)
      .map((l) => l.split(':'))
      .filter((p) => p.length >= 2 && p[0].trim())
      .map(([k, ...rest]) => [k.trim(), rest.join(':').trim()]),
  )

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') row.push(cell), (cell = '')
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) rows.push([...row, cell])
  return rows
}

export async function readRows(file) {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text())
  if (/\.xls$/i.test(file.name)) throw new Error('Old .xls files are not supported. In Excel use File → Save As → "Excel Workbook (.xlsx)" or CSV.')
  return readSheet(file)
}

/**
 * Turns sheet rows into a change plan against the current catalogue.
 * Rows are matched to existing products by Slug, then by Name (ignoring case and punctuation).
 * Empty cells leave the existing value untouched, so a sheet with only Name + Price just updates prices.
 */
export function planImport(rows, products) {
  const headerIdx = rows.findIndex((r) => r.some((c) => COLUMNS.some((col) => col.aliases.includes(norm(c)))))
  if (headerIdx < 0) throw new Error('Could not find a header row. Add a first row with column names such as Name, Price, Remaining.')
  const header = rows[headerIdx]
  const map = header.map((h) => COLUMNS.find((col) => col.aliases.includes(norm(h)))?.key || null)
  if (!map.includes('name') && !map.includes('slug')) throw new Error('The sheet needs a "Name" (or "Slug") column to know which product each row is.')

  const bySlug = new Map(products.map((p) => [p.slug, p]))
  const byName = new Map(products.map((p) => [norm(p.name), p]))
  const seen = new Set()
  const plan = []

  rows.slice(headerIdx + 1).forEach((cells, i) => {
    const line = headerIdx + i + 2
    const raw = {}
    map.forEach((key, c) => {
      if (!key) return
      const v = cells[c]
      if (v === null || v === undefined || String(v).trim() === '') return
      raw[key] = typeof v === 'string' ? v.trim() : v
    })
    if (!Object.keys(raw).length) return

    const errors = []
    const fields = {}
    for (const [key, v] of Object.entries(raw)) {
      if (NUMERIC.has(key)) {
        const n = toNumber(v)
        if (Number.isNaN(n) || n < 0) errors.push(`${key === 'stock' ? 'Remaining' : key === 'price' ? 'Price' : 'Old Price'} "${v}" is not a number`)
        else fields[key] = key === 'stock' ? Math.round(n) : n
      } else if (key === 'category') {
        const cat = toCategory(v)
        if (!cat) errors.push(`Unknown category "${v}" (use ${CATEGORIES.map((c) => c.name).join(', ')})`)
        else fields.category = cat
      } else if (key === 'is_active') {
        const b = toBool(v)
        if (b === null) errors.push(`Visible "${v}" should be Yes or No`)
        else fields.is_active = b
      } else if (key === 'specs') fields.specs = toSpecs(v)
      else fields[key] = String(v)
    }

    const existing = (fields.slug && bySlug.get(fields.slug)) || (fields.name && byName.get(norm(fields.name)))
    const id = existing?.id || fields.slug || slugify(fields.name || '')
    if (seen.has(id)) errors.push('This product appears more than once in the sheet')
    seen.add(id)

    if (existing) {
      const changes = {}
      for (const [k, v] of Object.entries(fields)) {
        if (k === 'slug') continue
        // A name that only differs in case or punctuation is how the row was matched, not a rename.
        if (k === 'name' && norm(v) === norm(existing.name)) continue
        const before = existing[k]
        const same = k === 'specs' ? JSON.stringify({ ...(before || {}), ...v }) === JSON.stringify(before || {}) : String(before ?? '') === String(v)
        if (!same) changes[k] = { before, after: k === 'specs' ? { ...(before || {}), ...v } : v }
      }
      plan.push({ line, kind: errors.length ? 'error' : Object.keys(changes).length ? 'update' : 'same', product: existing, changes, fields, errors })
    } else {
      if (!fields.name) errors.push('New products need a Name')
      if (fields.price === undefined) errors.push('New products need a Price')
      if (!fields.category) errors.push('New products need a Category')
      plan.push({ line, kind: errors.length ? 'error' : 'new', product: null, changes: {}, fields, errors })
    }
  })
  return { plan, columns: [...new Set(map.filter(Boolean))] }
}

// Builds the product object to save for one plan row. `imageUrls` maps uploaded file names to URLs.
export function rowToProduct(row, imageUrls = {}) {
  const f = { ...row.fields }
  if (row.product && f.name && norm(f.name) === norm(row.product.name)) delete f.name
  if (f.image_url && imageUrls[f.image_url.toLowerCase()]) f.image_url = imageUrls[f.image_url.toLowerCase()]
  if (row.product) {
    const p = { ...row.product, ...f }
    if (f.specs) p.specs = { ...(row.product.specs || {}), ...f.specs }
    return p
  }
  return {
    is_active: true, featured: false, rating: 4.8, sold: 0, gallery: [], specs: {}, video_url: '',
    type: '', old_price: null, stock: 0, short_description: '', description: '', image_url: '',
    ...f,
    slug: f.slug || slugify(f.name),
  }
}

// Image cells that name a file (e.g. "esp32.jpg") rather than a web address.
export const imageFileNames = (plan) =>
  [...new Set(plan.filter((r) => r.kind !== 'error' && r.fields.image_url && !/^(https?:|data:|\/)/i.test(r.fields.image_url)).map((r) => r.fields.image_url.toLowerCase()))]

export async function exportCatalog(products, fileName = 'techchampionstore-products.xlsx') {
  const catName = (id) => CATEGORIES.find((c) => c.id === id)?.name || id
  const columns = [
    { header: 'Slug', value: (p) => p.slug, width: 30 },
    { header: 'Name', value: (p) => p.name, width: 40 },
    { header: 'Category', value: (p) => catName(p.category), width: 18 },
    { header: 'Type', value: (p) => p.type || '', width: 20 },
    { header: 'Price', value: (p) => Number(p.price), width: 10 },
    { header: 'Old Price', value: (p) => (p.old_price ? Number(p.old_price) : null), width: 10 },
    { header: 'Remaining', value: (p) => Number(p.stock), width: 11 },
    { header: 'Short Description', value: (p) => p.short_description || '', width: 50 },
    { header: 'Description', value: (p) => p.description || '', width: 60 },
    { header: 'Image', value: (p) => (p.image_url?.startsWith('data:') ? '' : p.image_url || ''), width: 40 },
    { header: 'YouTube Link', value: (p) => p.video_url || '', width: 40 },
    { header: 'Specs', value: (p) => Object.entries(p.specs || {}).map(([k, v]) => `${k}: ${v}`).join('; '), width: 50 },
    { header: 'Visible', value: (p) => (p.is_active ? 'Yes' : 'No'), width: 8 },
  ]
  const data = [
    columns.map((c) => ({ value: c.header, fontWeight: 'bold' })),
    ...products.map((p) => columns.map((c) => c.value(p) ?? null)),
  ]
  await writeExcelFile(data, { columns: columns.map((c) => ({ width: c.width })), stickyRowsCount: 1 }).toFile(fileName)
}

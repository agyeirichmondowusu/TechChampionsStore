export const cedi = (n) =>
  '₵' + Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

// Accepts watch, youtu.be, shorts, embed and live links, or a bare 11-char id.
export function youtubeId(url) {
  if (!url) return null
  if (/^[\w-]{11}$/.test(url.trim())) return url.trim()
  const m = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/)
  return m ? m[1] : null
}

// Ghana local numbers (0XXXXXXXXX) become 233XXXXXXXXX for wa.me links.
export function waNumber(phone) {
  const d = String(phone || '').replace(/\D/g, '')
  if (d.startsWith('233')) return d
  if (d.startsWith('0')) return '233' + d.slice(1)
  return d
}

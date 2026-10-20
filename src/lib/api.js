import { supabase, isDemo } from './supabase'
import seedProducts from '../data/seedProducts.json'
import { DEFAULT_SETTINGS } from '../data/defaultSettings'
import { slugify } from './format'

// Every data call goes through here so the UI works the same against Supabase or demo storage.
const LS = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key)
      return v ? JSON.parse(v) : fallback
    } catch {
      return fallback
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value))
  },
}

const demoProducts = () => {
  let list = LS.get('tcs_products', null)
  if (!list) {
    list = seedProducts.map((p, i) => ({ ...p, id: `demo-${i + 1}`, created_at: new Date(Date.now() - i * 3600e3).toISOString() }))
    LS.set('tcs_products', list)
  }
  return list
}

const mergeSettings = (data) => ({
  ...DEFAULT_SETTINGS,
  ...(data || {}),
  socials: { ...DEFAULT_SETTINGS.socials, ...(data?.socials || {}) },
  payment: { ...DEFAULT_SETTINGS.payment, ...(data?.payment || {}) },
})

// ---------- Settings ----------
export async function getSettings() {
  if (isDemo) return mergeSettings(LS.get('tcs_settings', {}))
  const { data, error } = await supabase.from('site_settings').select('data').eq('id', 1).maybeSingle()
  if (error) console.error(error)
  return mergeSettings(data?.data)
}

export async function saveSettings(settings) {
  if (isDemo) return LS.set('tcs_settings', settings)
  const { error } = await supabase.from('site_settings').upsert({ id: 1, data: settings, updated_at: new Date().toISOString() })
  if (error) throw error
}

// ---------- Products ----------
export async function listProducts({ includeInactive = false } = {}) {
  if (isDemo) return demoProducts().filter((p) => includeInactive || p.is_active)
  let q = supabase.from('products').select('*').order('created_at', { ascending: false })
  if (!includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function saveProduct(product) {
  const row = { ...product, slug: product.slug || slugify(product.name) }
  for (const k of ['price', 'old_price', 'stock']) row[k] = row[k] === '' || row[k] == null ? null : Number(row[k])
  if (row.stock == null) row.stock = 0
  if (isDemo) {
    const list = demoProducts()
    if (row.id) {
      LS.set('tcs_products', list.map((p) => (p.id === row.id ? { ...p, ...row } : p)))
    } else {
      row.id = 'demo-' + Date.now()
      row.created_at = new Date().toISOString()
      LS.set('tcs_products', [row, ...list])
    }
    return row
  }
  const { id, ...fields } = row
  const query = id ? supabase.from('products').update(fields).eq('id', id) : supabase.from('products').insert(fields)
  const { data, error } = await query.select().single()
  if (error) throw error
  return data
}

export async function deleteProduct(id) {
  if (isDemo) return LS.set('tcs_products', demoProducts().filter((p) => p.id !== id))
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw error
}

// Uploads into the bucket folder for the category (microcontrollers/, sensors/, ...).
export async function uploadImage(file, folder) {
  if (isDemo) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }
  const ext = file.name.split('.').pop()
  const path = `${folder}/${Date.now()}-${slugify(file.name.replace(/\.[^.]+$/, ''))}.${ext}`
  const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: false, contentType: file.type })
  if (error) throw error
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
}

// ---------- Orders ----------
export async function createOrder(order) {
  if (isDemo) {
    const orders = LS.get('tcs_orders', [])
    const row = { ...order, id: 'order-' + Date.now(), status: 'new', created_at: new Date().toISOString() }
    LS.set('tcs_orders', [row, ...orders])
    return row
  }
  const { data: session } = await supabase.auth.getSession()
  const { error } = await supabase.from('orders').insert({ ...order, user_id: session.session?.user.id ?? null })
  if (error) throw error
  return order
}

export async function listOrders() {
  if (isDemo) return LS.get('tcs_orders', [])
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  return data
}

export async function updateOrderStatus(id, status) {
  if (isDemo) return LS.set('tcs_orders', LS.get('tcs_orders', []).map((o) => (o.id === id ? { ...o, status } : o)))
  const { error } = await supabase.from('orders').update({ status }).eq('id', id)
  if (error) throw error
}

// ---------- Auth ----------
const DEMO_ADMIN = { email: 'admin@techchampionstore.com', password: import.meta.env.VITE_DEMO_ADMIN_PASSWORD || 'champion123' }
const demoUsers = () => LS.get('tcs_users', [])

export async function getCurrentUser() {
  if (isDemo) return LS.get('tcs_session', null)
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user) return null
  return { id: user.id, email: user.email, name: user.user_metadata?.name || user.email, isAdmin: await checkAdmin(user.id) }
}

// The first account to log in becomes admin (see migration 0002); later accounts are checked normally.
async function checkAdmin(userId) {
  const { data, error } = await supabase.rpc('claim_first_admin')
  if (!error) return !!data
  const { data: row } = await supabase.from('admins').select('user_id').eq('user_id', userId).maybeSingle()
  return !!row
}

export async function signUp({ name, email, password }) {
  if (isDemo) {
    const users = demoUsers()
    if (users.some((u) => u.email === email) || email === DEMO_ADMIN.email) throw new Error('An account with this email already exists.')
    // Demo mode only: credentials live in this browser's storage, never on a server.
    // The first account created becomes the store admin.
    const isAdmin = users.length === 0
    LS.set('tcs_users', [...users, { name, email, password, isAdmin }])
    const session = { id: email, email, name, isAdmin }
    LS.set('tcs_session', session)
    return { user: session }
  }
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } })
  if (error) throw error
  return { user: data.user, needsConfirmation: !data.session }
}

export async function signIn({ email, password }) {
  if (isDemo) {
    if (email === DEMO_ADMIN.email && password === DEMO_ADMIN.password) {
      const session = { id: 'admin', email, name: 'Store Admin', isAdmin: true }
      LS.set('tcs_session', session)
      return session
    }
    const u = demoUsers().find((x) => x.email === email && x.password === password)
    if (!u) throw new Error('Incorrect email or password.')
    const session = { id: u.email, email: u.email, name: u.name, isAdmin: !!u.isAdmin }
    LS.set('tcs_session', session)
    return session
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return getCurrentUser()
}

export async function signOut() {
  if (isDemo) return localStorage.removeItem('tcs_session')
  await supabase.auth.signOut()
}

export function onAuthChange(cb) {
  if (isDemo) return () => {}
  const { data } = supabase.auth.onAuthStateChange(() => getCurrentUser().then(cb))
  return () => data.subscription.unsubscribe()
}

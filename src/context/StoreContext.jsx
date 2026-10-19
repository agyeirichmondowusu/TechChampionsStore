import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as api from '../lib/api'
import { DEFAULT_SETTINGS } from '../data/defaultSettings'

const StoreContext = createContext(null)

const loadCart = () => {
  try {
    return JSON.parse(localStorage.getItem('tcs_cart')) || []
  } catch {
    return []
  }
}

export function StoreProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [cart, setCart] = useState(loadCart)
  const [toast, setToast] = useState(null)

  const refreshProducts = useCallback(async () => {
    try {
      setProducts(await api.listProducts())
    } catch (e) {
      console.error(e)
    }
  }, [])

  const refreshSettings = useCallback(async () => setSettings(await api.getSettings()), [])

  useEffect(() => {
    Promise.all([refreshProducts(), refreshSettings(), api.getCurrentUser().then(setUser)]).finally(() => setLoading(false))
    return api.onAuthChange(setUser)
  }, [refreshProducts, refreshSettings])

  useEffect(() => {
    localStorage.setItem('tcs_cart', JSON.stringify(cart))
  }, [cart])

  const notify = useCallback((message) => {
    setToast({ message, key: Date.now() })
    setTimeout(() => setToast((t) => (t && Date.now() - t.key >= 2400 ? null : t)), 2500)
  }, [])

  // Cart lines keep a snapshot of name/price/image so the cart renders before products load.
  const addToCart = useCallback(
    (product, qty = 1) => {
      setCart((c) => {
        const line = c.find((l) => l.id === product.id)
        const max = product.stock ?? Infinity
        if (line) return c.map((l) => (l.id === product.id ? { ...l, qty: Math.min(max, l.qty + qty) } : l))
        return [...c, { id: product.id, slug: product.slug, name: product.name, price: Number(product.price), image_url: product.image_url, stock: product.stock, qty: Math.min(max, qty) }]
      })
      notify(`Added ${qty} × ${product.name} to cart`)
    },
    [notify],
  )
  const setQty = useCallback((id, qty) => setCart((c) => (qty <= 0 ? c.filter((l) => l.id !== id) : c.map((l) => (l.id === id ? { ...l, qty: Math.min(l.stock ?? Infinity, qty) } : l)))), [])
  const removeFromCart = useCallback((id) => setCart((c) => c.filter((l) => l.id !== id)), [])
  const clearCart = useCallback(() => setCart([]), [])

  const value = useMemo(() => {
    const cartCount = cart.reduce((n, l) => n + l.qty, 0)
    const cartTotal = cart.reduce((n, l) => n + l.qty * l.price, 0)
    return {
      settings, setSettings, refreshSettings, products, refreshProducts, loading,
      user, setUser, cart, cartCount, cartTotal, addToCart, setQty, removeFromCart, clearCart, toast, notify,
    }
  }, [settings, refreshSettings, products, refreshProducts, loading, user, cart, addToCart, setQty, removeFromCart, clearCart, toast, notify])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useStore = () => useContext(StoreContext)

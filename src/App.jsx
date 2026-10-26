import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import BackToTop from './components/BackToTop'
import Toast from './components/Toast'
import AnalyticsConsent from './components/AnalyticsConsent'
import Home from './pages/Home'
import Products from './pages/Products'
import ProductDetail from './pages/ProductDetail'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import Robots from './pages/Robots'
import RobotDetail from './pages/RobotDetail'
import MeetChamp from './pages/MeetChamp'
import { Login, Signup } from './pages/Auth'
import Admin from './pages/Admin'
import { About, Contact, Delivery, Faq, Privacy, Returns, Unsubscribe, NotFound } from './pages/InfoPages'

// The slicer pulls in three.js, so it loads only when someone opens it.
const Slicer = lazy(() => import('./pages/Slicer'))

export default function App() {
  const { pathname } = useLocation()
  // Braces matter: newer browsers return a Promise from scrollTo, and React treats a returned value as the cleanup function.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  const bare = pathname === '/meet-champ'

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          <Route path="/product/:slug" element={<ProductDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/robots" element={<Robots />} />
          <Route path="/robots/:id" element={<RobotDetail />} />
          <Route path="/meet-champ" element={<MeetChamp />} />
          <Route
            path="/slicer"
            element={
              <Suspense fallback={<div className="container-x py-24 text-center text-slate-500">Loading the slicer…</div>}>
                <Slicer />
              </Suspense>
            }
          />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/returns" element={<Returns />} />
          <Route path="/delivery" element={<Delivery />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {!bare && <Footer />}
      <BackToTop />
      <Toast />
      <AnalyticsConsent />
    </div>
  )
}

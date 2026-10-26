import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BarChart3 } from 'lucide-react'
import { useStore } from '../context/StoreContext'
import { getConsent, gpcEnabled, setConsent, trackPageview, trackingAllowed } from '../lib/analytics'

// Shows the analytics notice and records a page view on every route change once tracking is allowed.
// Admins and the admin page are never counted.
export default function AnalyticsConsent() {
  const { settings, user, loading } = useStore()
  const { pathname } = useLocation()
  const mode = settings.analytics_mode || 'opt_in'
  const [consent, setLocal] = useState(getConsent)

  useEffect(() => {
    const sync = () => setLocal(getConsent())
    window.addEventListener('tcs-consent', sync)
    return () => window.removeEventListener('tcs-consent', sync)
  }, [])

  useEffect(() => {
    if (loading || user?.isAdmin || pathname.startsWith('/admin')) return
    if (trackingAllowed(mode)) trackPageview(pathname)
  }, [pathname, consent, mode, loading, user])

  if (consent || gpcEnabled() || pathname.startsWith('/admin')) return null

  return (
    <div role="dialog" aria-label="Analytics notice" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl bg-navy-900 p-4 text-sm text-brand-100 shadow-2xl animate-fadeIn sm:p-5">
      <div className="flex gap-3">
        <BarChart3 size={20} className="mt-0.5 shrink-0 text-brand-400" />
        <p>
          {mode === 'notice' ? 'We count visits.' : 'May we count your visit?'} We use a random ID stored in your browser to see how many people visit,
          how often, and roughly where from (country and city, never your exact location). No ads, nothing sold.{' '}
          <Link to="/privacy" className="font-semibold text-white underline">Privacy and cookies</Link>
        </p>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={() => setConsent('denied')} className="btn border border-white/20 px-4 py-2 text-white hover:bg-white/10">{mode === 'notice' ? 'Opt out' : 'No thanks'}</button>
        <button onClick={() => setConsent('granted')} className="btn-primary px-4 py-2">{mode === 'notice' ? 'OK' : 'Allow'}</button>
      </div>
    </div>
  )
}

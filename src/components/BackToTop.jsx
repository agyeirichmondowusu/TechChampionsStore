import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'

export default function BackToTop() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 500)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className={`fixed bottom-6 right-6 z-40 grid h-12 w-12 place-items-center rounded-full bg-brand-600 text-white shadow-glow transition-all hover:-translate-y-1 hover:bg-brand-700 ${show ? 'opacity-100' : 'pointer-events-none translate-y-4 opacity-0'}`}
    >
      <ArrowUp size={22} />
    </button>
  )
}

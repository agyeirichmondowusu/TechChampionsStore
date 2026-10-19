import { CheckCircle2 } from 'lucide-react'
import { useStore } from '../context/StoreContext'

export default function Toast() {
  const { toast } = useStore()
  if (!toast) return null
  return (
    <div key={toast.key} className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-navy-900 px-5 py-3 text-sm font-medium text-white shadow-2xl animate-fadeIn">
      <CheckCircle2 size={18} className="text-accent-400" /> {toast.message}
    </div>
  )
}

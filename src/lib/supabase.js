import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Without credentials the site runs in demo mode and keeps data in localStorage.
export const supabase = url && key ? createClient(url, key) : null
export const isDemo = !supabase
export const SUPABASE_URL = url

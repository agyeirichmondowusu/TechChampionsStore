import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The AVR compiler loads its own worker and WebAssembly files; pre-bundling would break their URLs.
  optimizeDeps: { exclude: ['@horang-corp/avr-gcc-wasm'] },
  worker: { format: 'es' },
})

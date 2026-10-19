/** Theme colours are sampled from the TechChampionStore logo (navy wordmark + royal/electric blue). */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#050c1f', 900: '#0a1633', 800: '#0f1f47', 700: '#16295c', 600: '#1f3675' },
        brand: {
          50: '#f2f7ff', 100: '#e3eeff', 200: '#c4dbff', 300: '#94bdff', 400: '#4d93ff',
          500: '#1e74ff', 600: '#0a58e0', 700: '#0846b4', 800: '#0c3a8c', 900: '#0f326f',
        },
        accent: { 400: '#3fd0ff', 500: '#00b3f5', 600: '#0090c9' },
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
        display: ['Montserrat', 'Poppins', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(10,22,51,.06), 0 8px 24px -12px rgba(10,22,51,.18)',
        glow: '0 0 0 1px rgba(30,116,255,.25), 0 12px 40px -10px rgba(30,116,255,.55)',
      },
      keyframes: {
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        pulseRing: { '0%': { transform: 'scale(.9)', opacity: '.7' }, '100%': { transform: 'scale(1.5)', opacity: '0' } },
        fadeIn: { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: {
        floaty: 'floaty 4s ease-in-out infinite',
        pulseRing: 'pulseRing 1.6s ease-out infinite',
        fadeIn: 'fadeIn .25s ease-out',
      },
    },
  },
  plugins: [],
}

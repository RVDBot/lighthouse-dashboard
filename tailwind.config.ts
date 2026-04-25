import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg':            '#0b1220',
        'surface-1':     '#111b2e',
        'surface-2':     '#1a2540',
        'surface-3':     '#243052',
        'border':        '#2b3a5a',
        'text-primary':  '#e6ecf8',
        'text-secondary':'#a8b3cc',
        'text-tertiary': '#6b7a99',
        'accent':        '#4aa3ff',
        'accent-hover':  '#2b8fff',
        'good':          '#22c55e',
        'warn':          '#f59e0b',
        'bad':           '#ef4444',
      },
    },
  },
  plugins: [],
}
export default config

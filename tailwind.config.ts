import type { Config } from 'tailwindcss'

// Colors are wired through CSS variables defined in app/globals.css so that
// switching the [data-theme] attribute on <html> flips the entire palette.
// The `rgb(var(...) / <alpha-value>)` pattern lets Tailwind opacity modifiers
// like `bg-good/20` keep working.
const themeColor = (name: string) => `rgb(var(--color-${name}-rgb) / <alpha-value>)`

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg':             themeColor('bg'),
        'surface-1':      themeColor('surface-1'),
        'surface-2':      themeColor('surface-2'),
        'surface-3':      themeColor('surface-3'),
        'border':         themeColor('border'),
        'text-primary':   themeColor('text-primary'),
        'text-secondary': themeColor('text-secondary'),
        'text-tertiary':  themeColor('text-tertiary'),
        'accent':         themeColor('accent'),
        'accent-hover':   themeColor('accent-hover'),
        'good':           themeColor('good'),
        'warn':           themeColor('warn'),
        'bad':            themeColor('bad'),
      },
    },
  },
  plugins: [],
}
export default config

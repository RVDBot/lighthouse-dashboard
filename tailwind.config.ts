import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

// Colors are wired through CSS variables defined in app/globals.css so that
// switching the [data-theme] attribute on <html> flips the entire palette.
// The `rgb(var(...) / <alpha-value>)` pattern lets Tailwind opacity modifiers
// like `bg-good/20` keep working.
const themeColor = (name: string) => `rgb(var(--color-${name}-rgb) / <alpha-value>)`
const v = (name: string) => `rgb(var(--color-${name}-rgb))`

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
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-body':            v('text-primary'),
            '--tw-prose-headings':        v('text-primary'),
            '--tw-prose-lead':            v('text-secondary'),
            '--tw-prose-links':           v('accent'),
            '--tw-prose-bold':            v('text-primary'),
            '--tw-prose-counters':        v('text-tertiary'),
            '--tw-prose-bullets':         v('text-tertiary'),
            '--tw-prose-hr':              v('border'),
            '--tw-prose-quotes':          v('text-secondary'),
            '--tw-prose-quote-borders':   v('border'),
            '--tw-prose-captions':        v('text-tertiary'),
            '--tw-prose-code':            v('text-primary'),
            '--tw-prose-pre-code':        v('text-primary'),
            '--tw-prose-pre-bg':          v('surface-2'),
            '--tw-prose-th-borders':      v('border'),
            '--tw-prose-td-borders':      v('border'),
            // Tighter spacing — the chat bubbles and issue advice card
            // both feel cramped with the default vertical rhythm.
            'h1': { fontSize: '1.25rem', marginTop: '1.25em', marginBottom: '0.6em' },
            'h2': { fontSize: '1.05rem', marginTop: '1.25em', marginBottom: '0.5em' },
            'h3': { fontSize: '0.95rem', marginTop: '1em',    marginBottom: '0.4em' },
            'h4': { fontSize: '0.9rem',  marginTop: '0.9em',  marginBottom: '0.3em' },
            'p':  { marginTop: '0.6em',  marginBottom: '0.6em', lineHeight: '1.6' },
            'ul': { marginTop: '0.4em',  marginBottom: '0.6em' },
            'ol': { marginTop: '0.4em',  marginBottom: '0.6em' },
            'li': { marginTop: '0.2em',  marginBottom: '0.2em' },
            // Inline code
            'code': {
              backgroundColor: v('surface-2'),
              padding: '0.15em 0.4em',
              borderRadius: '0.25rem',
              fontWeight: '400',
              fontSize: '0.85em',
            },
            'code::before': { content: '""' },
            'code::after':  { content: '""' },
            // Code blocks
            'pre': {
              border: `1px solid ${v('border')}`,
              borderRadius: '0.5rem',
              padding: '0.75rem 1rem',
              fontSize: '0.85em',
              lineHeight: '1.5',
              marginTop: '0.6em',
              marginBottom: '0.6em',
            },
          },
        },
      },
    },
  },
  plugins: [typography],
}
export default config

import './globals.css'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Lighthouse Dashboard',
  description: 'Speed Rope Shop performance tracker',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

// Set data-theme synchronously before first paint to avoid a flash of wrong theme.
const themeBootstrap = `
(function(){
  try {
    var t = localStorage.getItem('theme');
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  } catch(_) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`.trim()

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

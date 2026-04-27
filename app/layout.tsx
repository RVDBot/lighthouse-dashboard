import './globals.css'
import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'

export const metadata: Metadata = {
  title: 'Lighthouse Dashboard',
  description: 'Speed Rope Shop performance tracker',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the theme cookie server-side and bake the data-theme attribute into
  // the rendered HTML. Survives deploys, hydration, and cleared localStorage.
  const cookieStore = await cookies()
  const themeCookie = cookieStore.get('lh_theme')?.value
  const dataTheme = themeCookie === 'light' ? 'light' : 'dark'

  return (
    <html lang="nl" data-theme={dataTheme}>
      <body>{children}</body>
    </html>
  )
}

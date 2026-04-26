import { Header } from '@/components/Header'
import { UrlManager } from '@/components/UrlManager'
import { SiteProfileView } from '@/components/SiteProfileView'
import { ApiKeysForm } from '@/components/ApiKeysForm'
import { ThemeToggle } from '@/components/ThemeToggle'

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  return (
    <main>
      <Header title="Lighthouse Dashboard" />
      <div className="p-6 space-y-8 max-w-5xl mx-auto">
        <section className="space-y-2">
          <h2 className="text-sm text-text-tertiary font-medium">Uiterlijk</h2>
          <ThemeToggle />
        </section>
        <section className="space-y-2">
          <h2 className="text-sm text-text-tertiary font-medium">URL's</h2>
          <UrlManager />
        </section>
        <section className="space-y-2">
          <h2 className="text-sm text-text-tertiary font-medium">Site-profiel</h2>
          <SiteProfileView />
        </section>
        <section className="space-y-2">
          <h2 className="text-sm text-text-tertiary font-medium">API-sleutels</h2>
          <ApiKeysForm />
        </section>
      </div>
    </main>
  )
}

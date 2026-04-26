import { Header } from '@/components/Header'
import { SettingsTabs } from '@/components/SettingsTabs'
import { getVersion } from '@/lib/version'

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  const version = getVersion()
  return (
    <main>
      <Header title="Lighthouse Dashboard" />
      <div className="p-6 max-w-6xl mx-auto">
        <SettingsTabs version={version} />
      </div>
    </main>
  )
}

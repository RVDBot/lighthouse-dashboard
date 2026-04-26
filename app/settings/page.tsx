import { Header } from '@/components/Header'
import { SettingsTabs } from '@/components/SettingsTabs'

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  return (
    <main>
      <Header title="Lighthouse Dashboard" />
      <div className="p-6 max-w-6xl mx-auto">
        <SettingsTabs />
      </div>
    </main>
  )
}

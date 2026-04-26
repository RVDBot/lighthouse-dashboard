'use client'

import { useState, type ReactNode } from 'react'
import { Globe, Server, SlidersHorizontal, ScrollText } from 'lucide-react'
import { UrlManager } from './UrlManager'
import { SiteProfileView } from './SiteProfileView'
import { ApiKeysForm } from './ApiKeysForm'
import { ThemeToggle } from './ThemeToggle'
import { LogsView } from './LogsView'

type TabId = 'urls' | 'profile' | 'app' | 'logs'

interface Tab {
  id: TabId
  label: string
  icon: typeof Globe
}

const TABS: Tab[] = [
  { id: 'urls',    label: "URL's",       icon: Globe },
  { id: 'profile', label: 'Site profiel', icon: Server },
  { id: 'app',     label: 'Instellingen', icon: SlidersHorizontal },
  { id: 'logs',    label: 'Logs',         icon: ScrollText },
]

export function SettingsTabs() {
  const [active, setActive] = useState<TabId>('urls')

  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
      <nav className="bg-surface-1 border border-border rounded-xl p-2 h-fit">
        <ul className="space-y-1">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = active === tab.id
            return (
              <li key={tab.id}>
                <button
                  onClick={() => setActive(tab.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                  }`}
                >
                  <Icon className="w-4 h-4" /> {tab.label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="min-w-0">
        {active === 'urls'    && <Pane title="URL's">         <UrlManager /></Pane>}
        {active === 'profile' && <Pane title="Site profiel"> <SiteProfileView /></Pane>}
        {active === 'app'     && <Pane title="Instellingen">
          <div className="space-y-6">
            <Group title="Uiterlijk"><ThemeToggle /></Group>
            <Group title="API-sleutels"><ApiKeysForm /></Group>
          </div>
        </Pane>}
        {active === 'logs'    && <Pane title="Logs">         <LogsView /></Pane>}
      </div>
    </div>
  )
}

function Pane({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm text-text-tertiary font-medium">{title}</h2>
      {children}
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs uppercase tracking-wide text-text-tertiary font-medium">{title}</h3>
      {children}
    </div>
  )
}

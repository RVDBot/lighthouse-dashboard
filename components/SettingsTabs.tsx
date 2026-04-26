'use client'

import { useState, type ReactNode } from 'react'
import { Globe, Server, SlidersHorizontal, ScrollText, Rocket } from 'lucide-react'
import { UrlManager } from './UrlManager'
import { SiteProfileView } from './SiteProfileView'
import { ApiKeysForm } from './ApiKeysForm'
import { ThemeToggle } from './ThemeToggle'
import { LogsView } from './LogsView'
import { WpRocketUpload } from './WpRocketUpload'

interface VersionInfo {
  version: string
  gitHash: string | null
  gitHashShort: string | null
  buildTime: string | null
}

type TabId = 'urls' | 'profile' | 'wp-rocket' | 'app' | 'logs'

interface Tab {
  id: TabId
  label: string
  icon: typeof Globe
}

const TABS: Tab[] = [
  { id: 'urls',      label: "URL's",        icon: Globe },
  { id: 'profile',   label: 'Site profiel',  icon: Server },
  { id: 'wp-rocket', label: 'WP Rocket',     icon: Rocket },
  { id: 'app',       label: 'Instellingen',  icon: SlidersHorizontal },
  { id: 'logs',      label: 'Logs',          icon: ScrollText },
]

export function SettingsTabs({ version }: { version?: VersionInfo }) {
  const [active, setActive] = useState<TabId>('urls')

  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
      <nav className="bg-surface-1 border border-border rounded-xl p-2 h-fit flex flex-col">
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
        {version && <VersionFooter v={version} />}
      </nav>

      <div className="min-w-0">
        {active === 'urls'      && <Pane title="URL's">         <UrlManager /></Pane>}
        {active === 'profile'   && <Pane title="Site profiel"> <SiteProfileView /></Pane>}
        {active === 'wp-rocket' && <Pane title="WP Rocket-config"> <WpRocketUpload /></Pane>}
        {active === 'app'       && <Pane title="Instellingen">
          <div className="space-y-6">
            <Group title="Uiterlijk"><ThemeToggle /></Group>
            <Group title="API-sleutels & modellen"><ApiKeysForm /></Group>
          </div>
        </Pane>}
        {active === 'logs'      && <Pane title="Logs">         <LogsView /></Pane>}
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

function VersionFooter({ v }: { v: VersionInfo }) {
  const repoUrl = v.gitHash ? `https://github.com/RVDBot/lighthouse-dashboard/commit/${v.gitHash}` : null
  return (
    <div className="text-[11px] text-text-tertiary mt-3 pt-3 border-t border-border px-2 space-y-0.5 leading-snug">
      <div>v{v.version}</div>
      {v.gitHashShort && (
        repoUrl ? (
          <a href={repoUrl} target="_blank" rel="noopener" className="block font-mono hover:text-accent transition-colors" title={v.gitHash ?? ''}>
            {v.gitHashShort}
          </a>
        ) : (
          <div className="font-mono">{v.gitHashShort}</div>
        )
      )}
      {v.buildTime && <div title={v.buildTime}>{formatBuildTime(v.buildTime)}</div>}
    </div>
  )
}

function formatBuildTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

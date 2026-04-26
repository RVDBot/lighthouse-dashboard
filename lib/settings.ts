import { getDb } from './db'

export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

/** Reads from env first, then the settings table. Empty/whitespace-only
 *  values are treated as "not set" so callers' `?? fallback` patterns work. */
export function getConfig(key: string): string | null {
  const raw = process.env[key] ?? getSetting(key)
  if (raw === null || raw === undefined) return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

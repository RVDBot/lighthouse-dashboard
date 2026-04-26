import { getDb, type ExternalConfigRow } from './db'

export type ConfigKind = 'wp-rocket'

export function getExternalConfig(kind: ConfigKind): ExternalConfigRow | null {
  const row = getDb().prepare('SELECT * FROM external_configs WHERE kind = ?').get(kind) as ExternalConfigRow | undefined
  return row ?? null
}

export function setExternalConfig(kind: ConfigKind, jsonData: string, filename: string | null): void {
  getDb().prepare(`
    INSERT INTO external_configs (kind, json_data, filename, uploaded_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(kind) DO UPDATE SET
      json_data   = excluded.json_data,
      filename    = excluded.filename,
      uploaded_at = excluded.uploaded_at
  `).run(kind, jsonData, filename, Date.now())
}

export function deleteExternalConfig(kind: ConfigKind): void {
  getDb().prepare('DELETE FROM external_configs WHERE kind = ?').run(kind)
}

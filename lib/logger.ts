import { getDb } from './db'

type Level = 'info' | 'warn' | 'error'
type Category = 'scan' | 'profile' | 'advice' | 'chat' | 'psi' | 'auth' | 'systeem'

export function log(level: Level, category: Category, message: string, meta?: Record<string, unknown>) {
  const now = Date.now()

  // Persist to DB so the Logs panel in Settings can query it. Wrapped so a
  // logger failure never breaks the caller.
  try {
    getDb().prepare(`
      INSERT INTO logs (level, category, message, meta, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(level, category, message, meta ? JSON.stringify(meta) : null, now)
  } catch {
    // DB unavailable / closed — fall through to stdout-only.
  }

  // Also write to stdout so Docker captures it.
  const entry = {
    t: new Date(now).toISOString(),
    level,
    category,
    message,
    ...(meta ? { meta } : {}),
  }
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

type Level = 'info' | 'warn' | 'error'
type Category = 'scan' | 'profile' | 'advice' | 'chat' | 'psi' | 'auth' | 'systeem'

export function log(level: Level, category: Category, message: string, meta?: Record<string, unknown>) {
  const entry = {
    t: new Date().toISOString(),
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

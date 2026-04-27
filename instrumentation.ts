export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { getDb } = await import('./lib/db')
  const { runScan, getRunningScanId, recoverStaleScans } = await import('./lib/scan')
  const profileMod = await import('./lib/profile')
  const refreshSiteProfile = (profileMod as { refreshSiteProfile?: (() => Promise<unknown>) | null }).refreshSiteProfile ?? null
  const { log } = await import('./lib/logger')

  // Container just (re)started — any scan that was 'running' in the DB is
  // by definition stale (its process is gone). Mark them failed so the UI
  // doesn't sit forever waiting on a finished event.
  recoverStaleScans()

  const HOUR_MS = 60 * 60 * 1000
  const WEEK_MS = 7 * 24 * HOUR_MS
  const MONTH_MS = 30 * 24 * HOUR_MS

  const tick = async () => {
    try {
      const db = getDb()
      const lastDone = db.prepare(`SELECT MAX(finished_at) AS t FROM scans WHERE status = 'done'`).get() as { t: number | null }
      const needScan = (lastDone.t === null || Date.now() - lastDone.t > WEEK_MS) && getRunningScanId() === null
      if (needScan) {
        log('info', 'scan', 'Cron: wekelijkse scan starten')
        runScan('cron').catch(() => { /* logged */ })
      }

      if (refreshSiteProfile) {
        const prof = db.prepare('SELECT refreshed_at FROM site_profile WHERE id = 1').get() as { refreshed_at: number } | undefined
        if (!prof || Date.now() - prof.refreshed_at > MONTH_MS) {
          log('info', 'profile', 'Cron: site-profile verversen')
          refreshSiteProfile().catch(() => { /* logged */ })
        }
      }
    } catch (e) {
      log('error', 'systeem', 'Cron tick error', { error: e instanceof Error ? e.message : String(e) })
    }
  }

  setTimeout(() => { tick() }, 30_000)
  setInterval(() => { tick() }, HOUR_MS)

  log('info', 'systeem', 'Instrumentation registered (cron ticks)')
}

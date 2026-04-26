import { getDb, type UrlRow, type Strategy } from './db'
import { runPsi, type PsiRunResult, PsiError } from './psi'
import { log } from './logger'

const MAX_PARALLEL = 4

let currentScanId: number | null = null
const progressListeners = new Set<(event: ScanProgressEvent) => void>()

let recovered = false
function recoverStaleScans() {
  if (recovered) return
  recovered = true
  const db = getDb()
  const stale = db.prepare(`SELECT id FROM scans WHERE status = 'running'`).all() as Array<{ id: number }>
  if (stale.length === 0) return
  const stmt = db.prepare(`UPDATE scans SET status = 'failed', finished_at = ?, error = 'Hervat na crash' WHERE id = ?`)
  const now = Date.now()
  const tx = db.transaction((rows: Array<{ id: number }>) => {
    for (const r of rows) stmt.run(now, r.id)
  })
  tx(stale)
  log('warn', 'scan', `Recovery: ${stale.length} stale scan(s) gemarkeerd als failed`, { ids: stale.map(s => s.id) })
}

export type ScanProgressEvent =
  | { type: 'started'; scanId: number; total: number }
  | { type: 'url-done'; scanId: number; urlId: number; strategy: Strategy; ok: boolean; error?: string }
  | { type: 'finished'; scanId: number; ok: number; failed: number }
  | { type: 'failed'; scanId: number; error: string }

export function subscribeScanProgress(fn: (e: ScanProgressEvent) => void): () => void {
  progressListeners.add(fn)
  return () => { progressListeners.delete(fn) }
}

function emit(e: ScanProgressEvent) {
  for (const fn of progressListeners) {
    try { fn(e) } catch { /* listener error, ignore */ }
  }
}

export function getRunningScanId(): number | null {
  // Cross-check against the DB so a stale in-memory flag can't block new scans
  // after a crash (recovery on next runScan call clears these, but a status read
  // shouldn't lie either).
  if (currentScanId !== null) return currentScanId
  const row = getDb().prepare(`SELECT id FROM scans WHERE status = 'running' ORDER BY id DESC LIMIT 1`).get() as { id: number } | undefined
  return row?.id ?? null
}

export async function runScan(trigger: 'cron' | 'manual'): Promise<number> {
  const db = getDb()
  recoverStaleScans()

  // Atomic claim: if anything is currently 'running' in the DB, refuse. Otherwise insert
  // and treat the new row as the scan claim. better-sqlite3 statements are synchronous,
  // so this whole block is a single critical section per process.
  const claim = db.transaction((startedAt: number, trg: string): number => {
    const existing = db.prepare(`SELECT id FROM scans WHERE status = 'running' LIMIT 1`).get() as { id: number } | undefined
    if (existing) throw new Error('Scan al bezig')
    const info = db.prepare(`
      INSERT INTO scans (started_at, trigger, status) VALUES (?, ?, 'running')
    `).run(startedAt, trg)
    return info.lastInsertRowid as number
  })

  const startedAt = Date.now()
  const scanId = claim(startedAt, trigger)
  currentScanId = scanId

  const urls = db.prepare('SELECT * FROM urls WHERE enabled = 1 ORDER BY id').all() as UrlRow[]
  const totalTasks = urls.length * 2
  emit({ type: 'started', scanId, total: totalTasks })

  let ok = 0
  let failed = 0

  try {
    const queue: Array<{ url: UrlRow; strategy: Strategy }> = []
    for (const u of urls) {
      queue.push({ url: u, strategy: 'mobile' })
      queue.push({ url: u, strategy: 'desktop' })
    }

    const worker = async () => {
      while (queue.length > 0) {
        const task = queue.shift()
        if (!task) return
        try {
          const res = await runPsi({ url: task.url.url, strategy: task.strategy })
          persistResult(scanId, task.url.id, task.strategy, res)
          ok++
          emit({ type: 'url-done', scanId, urlId: task.url.id, strategy: task.strategy, ok: true })
        } catch (e) {
          failed++
          const msg = e instanceof Error ? e.message : String(e)
          const meta: Record<string, unknown> = {
            urlId: task.url.id,
            url: task.url.url,
            strategy: task.strategy,
            error: msg,
          }
          if (e instanceof PsiError) {
            meta.psiStatus = e.status
            meta.psiBody = e.body
            meta.psiRawTail = e.raw.slice(-1000) // last 1k chars in case body is huge
          }
          log('error', 'scan', 'PSI run mislukt', meta)
          emit({ type: 'url-done', scanId, urlId: task.url.id, strategy: task.strategy, ok: false, error: msg })
        }
      }
    }

    await Promise.all(Array.from({ length: MAX_PARALLEL }, () => worker()))

    db.prepare(`UPDATE scans SET status = 'done', finished_at = ? WHERE id = ?`).run(Date.now(), scanId)
    emit({ type: 'finished', scanId, ok, failed })
    log('info', 'scan', `Scan ${scanId} klaar`, { ok, failed, durationMs: Date.now() - startedAt })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    db.prepare(`UPDATE scans SET status = 'failed', finished_at = ?, error = ? WHERE id = ?`).run(Date.now(), msg, scanId)
    emit({ type: 'failed', scanId, error: msg })
    log('error', 'scan', `Scan ${scanId} gefaald`, { error: msg })
  } finally {
    currentScanId = null
  }

  return scanId
}

function persistResult(scanId: number, urlId: number, strategy: Strategy, res: PsiRunResult) {
  const db = getDb()
  const info = db.prepare(`
    INSERT INTO lighthouse_results
      (scan_id, url_id, strategy, fetched_at, perf_score, a11y_score, best_practices_score, seo_score,
       lcp_ms, inp_ms, cls, fcp_ms, tbt_ms, ttfb_ms, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    scanId, urlId, strategy, Date.now(),
    res.perfScore, res.a11yScore, res.bestPracticesScore, res.seoScore,
    res.lcpMs, res.inpMs, res.cls, res.fcpMs, res.tbtMs, res.ttfbMs,
    JSON.stringify(res.raw),
  )
  const resultId = info.lastInsertRowid as number

  const insertOpp = db.prepare(`
    INSERT INTO opportunities (lighthouse_result_id, audit_id, category, title, score, display_value, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const tx = db.transaction((audits: PsiRunResult['audits']) => {
    for (const a of audits) {
      insertOpp.run(resultId, a.auditId, a.category, a.title, a.score, a.displayValue, a.details ? JSON.stringify(a.details) : null)
    }
  })
  tx(res.audits)
}

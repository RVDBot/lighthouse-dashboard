import { getDb } from '@/lib/db'
import { Header } from '@/components/Header'
import { UrlMatrix, type MatrixRow } from '@/components/UrlMatrix'
import { TopIssuesList, type TopIssue } from '@/components/TopIssuesList'
import { TrendChart, type TrendPoint } from '@/components/TrendChart'
import { ScanNowButton } from '@/components/ScanNowButton'
import { ScoreBadge } from '@/components/ScoreBadge'

export const dynamic = 'force-dynamic'

type CategoryKey = 'perf_score' | 'a11y_score' | 'best_practices_score' | 'seo_score'

const ORDER = ['home','product','category','cart','checkout']

function loadLatestScan() {
  const db = getDb()
  const latest = db.prepare(`SELECT id, finished_at FROM scans WHERE status='done' ORDER BY id DESC LIMIT 1`).get() as
    { id: number; finished_at: number } | undefined
  return latest ?? null
}

function loadMatrix(scanId: number, strategy: 'mobile' | 'desktop'): MatrixRow[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT u.id AS url_id, u.page_type, u.language, lr.perf_score
    FROM urls u
    LEFT JOIN lighthouse_results lr ON lr.url_id = u.id AND lr.scan_id = ? AND lr.strategy = ?
    WHERE u.enabled = 1
  `).all(scanId, strategy) as Array<{ url_id: number; page_type: string; language: string; perf_score: number | null }>

  const byType = new Map<string, MatrixRow>()
  for (const r of rows) {
    if (!byType.has(r.page_type)) byType.set(r.page_type, { pageType: r.page_type, cells: {} })
    byType.get(r.page_type)!.cells[r.language] = { urlId: r.url_id, score: r.perf_score }
  }
  return [...byType.values()].sort((a, b) => ORDER.indexOf(a.pageType) - ORDER.indexOf(b.pageType))
}

function loadTopIssues(scanId: number): TopIssue[] {
  const db = getDb()
  return db.prepare(`
    SELECT o.audit_id AS auditId, o.title, o.category, COUNT(DISTINCT lr.url_id) AS urlCount
    FROM opportunities o
    JOIN lighthouse_results lr ON lr.id = o.lighthouse_result_id
    WHERE lr.scan_id = ?
    GROUP BY o.audit_id
    ORDER BY urlCount DESC, o.audit_id ASC
    LIMIT 10
  `).all(scanId) as TopIssue[]
}

function loadTrend(category: CategoryKey, strategy: 'mobile' | 'desktop', limit = 12): TrendPoint[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT s.finished_at AS t, AVG(lr.${category}) AS v
    FROM scans s
    JOIN lighthouse_results lr ON lr.scan_id = s.id
    WHERE s.status = 'done' AND lr.strategy = ?
    GROUP BY s.id
    ORDER BY s.id DESC
    LIMIT ?
  `).all(strategy, limit) as Array<{ t: number; v: number | null }>
  return rows.reverse().map(r => ({ t: r.t, value: r.v === null ? null : Math.round(r.v * 100) }))
}

export default function Home() {
  const latest = loadLatestScan()
  const strategy: 'mobile' | 'desktop' = 'mobile'
  const scanId = latest?.id ?? 0

  const matrix = scanId ? loadMatrix(scanId, strategy) : []
  const top = scanId ? loadTopIssues(scanId) : []
  const trendPerf = loadTrend('perf_score', strategy)
  const trendA11y = loadTrend('a11y_score', strategy)
  const trendBP   = loadTrend('best_practices_score', strategy)
  const trendSEO  = loadTrend('seo_score', strategy)

  return (
    <main>
      <Header title="Lighthouse Dashboard" right={<ScanNowButton />} />
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="text-sm text-text-tertiary">
          {latest
            ? <>Laatste scan: <span className="text-text-secondary">{new Date(latest.finished_at).toLocaleString('nl-NL')}</span></>
            : 'Nog geen afgeronde scan — draai er eerst één.'}
        </div>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ['Performance',   trendPerf, '#4aa3ff'],
            ['Accessibility', trendA11y, '#a855f7'],
            ['Best Practices',trendBP,   '#22c55e'],
            ['SEO',           trendSEO,  '#f59e0b'],
          ] as const).map(([label, data, color]) => {
            const last = data.length ? data[data.length - 1].value : null
            return (
              <div key={label} className="bg-surface-1 rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-tertiary">{label}</span>
                  <ScoreBadge score={last === null ? null : last / 100} />
                </div>
                <TrendChart data={data} height={40} stroke={color} />
              </div>
            )
          })}
        </section>

        <section>
          <h2 className="text-sm text-text-tertiary font-medium mb-2">URL-matrix (Performance, mobiel)</h2>
          <UrlMatrix rows={matrix} />
        </section>

        <section>
          <h2 className="text-sm text-text-tertiary font-medium mb-2">Top issues deze scan</h2>
          <TopIssuesList issues={top} />
        </section>
      </div>
    </main>
  )
}

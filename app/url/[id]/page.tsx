import { notFound } from 'next/navigation'
import { getDb, type UrlRow, type LighthouseResultRow } from '@/lib/db'
import { Header } from '@/components/Header'
import { ScoreRing } from '@/components/ScoreRing'
import { TrendChart, type TrendPoint } from '@/components/TrendChart'
import { IssueList, type IssueRow } from '@/components/IssueList'

export const dynamic = 'force-dynamic'

function loadUrl(id: number): UrlRow | null {
  return (getDb().prepare(`SELECT * FROM urls WHERE id = ?`).get(id) as UrlRow | undefined) ?? null
}

function loadLatestResult(urlId: number, strategy: 'mobile' | 'desktop'): LighthouseResultRow | null {
  return (getDb().prepare(`
    SELECT * FROM lighthouse_results WHERE url_id = ? AND strategy = ? ORDER BY id DESC LIMIT 1
  `).get(urlId, strategy) as LighthouseResultRow | undefined) ?? null
}

function loadTrend(urlId: number, strategy: 'mobile' | 'desktop', col: string, limit = 12): TrendPoint[] {
  const rows = getDb().prepare(`
    SELECT fetched_at AS t, ${col} AS v
    FROM lighthouse_results WHERE url_id = ? AND strategy = ? ORDER BY id DESC LIMIT ?
  `).all(urlId, strategy, limit) as Array<{ t: number; v: number | null }>
  return rows.reverse().map(r => ({ t: r.t, value: r.v === null ? null : Math.round(r.v * 100) }))
}

function loadIssues(resultId: number): IssueRow[] {
  const rows = getDb().prepare(`
    SELECT audit_id, title, category, score, display_value
    FROM opportunities WHERE lighthouse_result_id = ? ORDER BY score ASC
  `).all(resultId) as Array<{ audit_id: string; title: string; category: string; score: number | null; display_value: string | null }>
  return rows.map(r => ({ auditId: r.audit_id, title: r.title, category: r.category, score: r.score, displayValue: r.display_value }))
}

export default async function UrlDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const urlId = parseInt(id, 10)
  if (isNaN(urlId)) notFound()
  const url = loadUrl(urlId)
  if (!url) notFound()

  const mobile  = loadLatestResult(urlId, 'mobile')
  const desktop = loadLatestResult(urlId, 'desktop')
  const trendPerfMobile = loadTrend(urlId, 'mobile',  'perf_score')
  const trendPerfDesktop = loadTrend(urlId, 'desktop', 'perf_score')
  const issues = mobile ? loadIssues(mobile.id) : []

  return (
    <main>
      <Header title="Lighthouse Dashboard" />
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div>
          <div className="text-xs text-text-tertiary">{url.page_type} · {url.language.toUpperCase()}</div>
          <h1 className="text-lg text-text-primary mt-1">{url.label}</h1>
          <a href={url.url} target="_blank" rel="noopener" className="text-xs text-accent hover:underline">{url.url}</a>
        </div>

        <section className="grid grid-cols-2 gap-6">
          {(['mobile','desktop'] as const).map(strat => {
            const r = strat === 'mobile' ? mobile : desktop
            return (
              <div key={strat} className="bg-surface-1 border border-border rounded-xl p-4">
                <div className="text-xs text-text-tertiary mb-3 uppercase tracking-wide">{strat}</div>
                <div className="grid grid-cols-4 gap-3">
                  <ScoreRing label="Perf"  score={r?.perf_score ?? null} />
                  <ScoreRing label="A11y"  score={r?.a11y_score ?? null} />
                  <ScoreRing label="BP"    score={r?.best_practices_score ?? null} />
                  <ScoreRing label="SEO"   score={r?.seo_score ?? null} />
                </div>
              </div>
            )
          })}
        </section>

        <section>
          <h2 className="text-sm text-text-tertiary font-medium mb-2">Performance-trend</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-1 border border-border rounded-xl p-3">
              <div className="text-xs text-text-tertiary mb-1">Mobile</div>
              <TrendChart data={trendPerfMobile} stroke="#4aa3ff" height={100} />
            </div>
            <div className="bg-surface-1 border border-border rounded-xl p-3">
              <div className="text-xs text-text-tertiary mb-1">Desktop</div>
              <TrendChart data={trendPerfDesktop} stroke="#22c55e" height={100} />
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm text-text-tertiary font-medium mb-2">Issues (mobiel)</h2>
          <IssueList items={issues} />
        </section>
      </div>
    </main>
  )
}

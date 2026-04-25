import { notFound } from 'next/navigation'
import { getDb } from '@/lib/db'
import { getStoredProfile } from '@/lib/profile'
import { getAdvice } from '@/lib/advice'
import { Header } from '@/components/Header'
import { AdviceBody } from '@/components/AdviceBody'
import { OffendersList, type Offender } from '@/components/OffendersList'
import { ChatPanel } from '@/components/ChatPanel'

export const dynamic = 'force-dynamic'

interface IssueHeader {
  auditId: string
  title: string
  category: string
  displayValue: string | null
  urlCount: number
}

function loadIssueHeader(auditId: string): IssueHeader | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT o.audit_id, o.title, o.category, o.display_value,
           (SELECT COUNT(DISTINCT lr.url_id) FROM opportunities o2
            JOIN lighthouse_results lr ON lr.id = o2.lighthouse_result_id
            WHERE o2.audit_id = o.audit_id
              AND lr.scan_id = (SELECT MAX(scan_id) FROM lighthouse_results)) AS url_count
    FROM opportunities o
    WHERE o.audit_id = ?
    ORDER BY o.id DESC LIMIT 1
  `).get(auditId) as { audit_id: string; title: string; category: string; display_value: string | null; url_count: number } | undefined
  if (!row) return null
  return { auditId: row.audit_id, title: row.title, category: row.category, displayValue: row.display_value, urlCount: row.url_count }
}

function loadOffenders(auditId: string): Offender[] {
  const db = getDb()
  const row = db.prepare(`SELECT details_json FROM opportunities WHERE audit_id = ? ORDER BY id DESC LIMIT 1`).get(auditId) as { details_json: string | null } | undefined
  if (!row?.details_json) return []
  try {
    const d = JSON.parse(row.details_json) as { items?: Array<{ url?: string; wastedBytes?: number; totalBytes?: number; wastedMs?: number }> }
    return (d.items ?? []).slice(0, 5).map(it => ({
      label: it.url ?? JSON.stringify(it).slice(0, 120),
      meta: [
        it.wastedBytes ? `${Math.round(it.wastedBytes / 1024)} KiB besparing` : null,
        it.wastedMs ? `${Math.round(it.wastedMs)} ms` : null,
      ].filter(Boolean).join(' · ') || undefined,
    }))
  } catch { return [] }
}

export default async function IssueDetail({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId: raw } = await params
  const auditId = decodeURIComponent(raw)
  const header = loadIssueHeader(auditId)
  if (!header) notFound()
  const profile = getStoredProfile()
  const advice = profile ? getAdvice(auditId, profile.hash) : null
  const offenders = loadOffenders(auditId)

  return (
    <main>
      <Header title="Lighthouse Dashboard" />
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div>
          <div className="text-xs text-text-tertiary">{header.category} · raakt {header.urlCount} URL's</div>
          <h1 className="text-lg text-text-primary mt-1">{header.title}</h1>
          {header.displayValue && <div className="text-sm text-text-secondary">{header.displayValue}</div>}
        </div>

        <AdviceBody
          auditId={auditId}
          initial={advice?.markdown ?? null}
          initialModel={advice?.model ?? null}
          initialGeneratedAt={advice?.generatedAt ?? null}
        />

        <OffendersList items={offenders} />

        <ChatPanel auditId={auditId} />
      </div>
    </main>
  )
}

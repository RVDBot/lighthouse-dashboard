import Link from 'next/link'

export interface TopIssue {
  auditId: string
  title: string
  category: string
  urlCount: number
}

export function TopIssuesList({ issues }: { issues: TopIssue[] }) {
  if (issues.length === 0) {
    return <p className="text-text-tertiary text-sm">Geen issues — draai eerst een scan.</p>
  }
  return (
    <ol className="space-y-1">
      {issues.map((it, idx) => (
        <li key={it.auditId} className="flex items-center gap-3 bg-surface-1 px-4 py-2 rounded-lg border border-border">
          <span className="text-text-tertiary w-5 text-right tabular-nums">{idx + 1}.</span>
          <div className="flex-1">
            <div className="text-text-primary text-sm">{it.title}</div>
            <div className="text-text-tertiary text-xs">{it.category} · raakt {it.urlCount} URL's</div>
          </div>
          <Link href={`/issue/${encodeURIComponent(it.auditId)}`} className="text-accent text-xs hover:underline">Open →</Link>
        </li>
      ))}
    </ol>
  )
}

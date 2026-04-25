import Link from 'next/link'

export interface IssueRow {
  auditId: string
  title: string
  category: string
  score: number | null
  displayValue: string | null
}

export function IssueList({ items }: { items: IssueRow[] }) {
  if (items.length === 0) {
    return <p className="text-text-tertiary text-sm">Geen issues voor deze URL in de laatste scan.</p>
  }
  return (
    <ul className="space-y-1">
      {items.map(it => (
        <li key={it.auditId} className="flex items-center gap-3 bg-surface-1 px-4 py-2 rounded-lg border border-border">
          <span className={`w-14 text-xs font-medium tabular-nums ${it.score === null ? 'text-text-tertiary' : it.score >= 0.9 ? 'text-good' : it.score >= 0.5 ? 'text-warn' : 'text-bad'}`}>
            {it.score === null ? '—' : Math.round(it.score * 100)}
          </span>
          <div className="flex-1">
            <div className="text-text-primary text-sm">{it.title}</div>
            <div className="text-text-tertiary text-xs">{it.category}{it.displayValue ? ` · ${it.displayValue}` : ''}</div>
          </div>
          <Link href={`/issue/${encodeURIComponent(it.auditId)}`} className="text-accent text-xs hover:underline">Open →</Link>
        </li>
      ))}
    </ul>
  )
}

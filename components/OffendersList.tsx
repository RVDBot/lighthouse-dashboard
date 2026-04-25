export interface Offender {
  label: string
  meta?: string
}

export function OffendersList({ items }: { items: Offender[] }) {
  if (items.length === 0) return null
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-2">
      <div className="text-xs text-text-tertiary uppercase tracking-wide">Top offenders</div>
      <ul className="text-sm space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="text-text-tertiary tabular-nums">{i + 1}.</span>
            <div className="flex-1 break-all">
              <div className="text-text-primary">{it.label}</div>
              {it.meta && <div className="text-text-tertiary text-xs">{it.meta}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

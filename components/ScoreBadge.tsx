export function scoreColor(score: number | null): string {
  if (score === null) return 'bg-surface-3 text-text-tertiary'
  const s = score * 100
  if (s >= 90) return 'bg-good/20 text-good'
  if (s >= 50) return 'bg-warn/20 text-warn'
  return 'bg-bad/20 text-bad'
}

export function ScoreBadge({ score }: { score: number | null }) {
  return (
    <span className={`inline-flex items-center justify-center w-10 h-6 rounded-md text-xs font-medium tabular-nums ${scoreColor(score)}`}>
      {score === null ? '—' : Math.round(score * 100)}
    </span>
  )
}

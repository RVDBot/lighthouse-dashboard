export function ScoreRing({ label, score }: { label: string; score: number | null }) {
  const pct = score === null ? 0 : Math.round(score * 100)
  // Functional traffic-light colours stay fixed across themes — they encode meaning, not chrome.
  const color = score === null
    ? 'rgb(var(--color-text-tertiary-rgb))'
    : pct >= 90 ? 'rgb(var(--color-good-rgb))'
    : pct >= 50 ? 'rgb(var(--color-warn-rgb))'
    : 'rgb(var(--color-bad-rgb))'
  const circumference = 2 * Math.PI * 32
  const dash = score === null ? 0 : (pct / 100) * circumference
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="32" stroke="rgb(var(--color-border-rgb))" strokeWidth="6" fill="none" />
        <circle cx="40" cy="40" r="32" stroke={color} strokeWidth="6" fill="none"
                strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" transform="rotate(-90 40 40)" />
        <text x="40" y="45" textAnchor="middle" fill="rgb(var(--color-text-primary-rgb))" fontSize="18" fontWeight="500">
          {score === null ? '—' : pct}
        </text>
      </svg>
      <span className="text-xs text-text-tertiary">{label}</span>
    </div>
  )
}

export function ScoreRing({ label, score }: { label: string; score: number | null }) {
  const pct = score === null ? 0 : Math.round(score * 100)
  const color = score === null ? '#475569' : pct >= 90 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'
  const circumference = 2 * Math.PI * 32
  const dash = score === null ? 0 : (pct / 100) * circumference
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="32" stroke="#2b3a5a" strokeWidth="6" fill="none" />
        <circle cx="40" cy="40" r="32" stroke={color} strokeWidth="6" fill="none"
                strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" transform="rotate(-90 40 40)" />
        <text x="40" y="45" textAnchor="middle" fill="#e6ecf8" fontSize="18" fontWeight="500">
          {score === null ? '—' : pct}
        </text>
      </svg>
      <span className="text-xs text-text-tertiary">{label}</span>
    </div>
  )
}

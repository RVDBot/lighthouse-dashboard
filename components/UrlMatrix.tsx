import Link from 'next/link'
import { ScoreBadge } from './ScoreBadge'

export interface MatrixCell {
  urlId: number
  score: number | null
}

export interface MatrixRow {
  pageType: string
  cells: Record<string, MatrixCell | undefined>
}

const LANG_ORDER = ['nl','en','de','fr','es','it'] as const
const LABELS: Record<string, string> = { home: 'Home', product: 'Product', category: 'Categorie', cart: 'Winkelwagen', checkout: 'Checkout' }

export function UrlMatrix({ rows }: { rows: MatrixRow[] }) {
  return (
    <div className="bg-surface-1 rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-text-tertiary">
          <tr>
            <th className="text-left px-4 py-2 font-medium"> </th>
            {LANG_ORDER.map(l => <th key={l} className="px-2 py-2 font-medium uppercase tracking-wide">{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.pageType} className="border-t border-border">
              <td className="px-4 py-2 text-text-secondary">{LABELS[r.pageType] ?? r.pageType}</td>
              {LANG_ORDER.map(l => {
                const c = r.cells[l]
                return (
                  <td key={l} className="px-2 py-2 text-center">
                    {c ? (
                      <Link href={`/url/${c.urlId}`}>
                        <ScoreBadge score={c.score} />
                      </Link>
                    ) : <span className="text-text-tertiary">—</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

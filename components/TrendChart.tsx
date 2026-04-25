'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export interface TrendPoint { t: number; value: number | null }

export function TrendChart({ data, height = 80, stroke = '#4aa3ff' }: { data: TrendPoint[]; height?: number; stroke?: string }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
          <XAxis dataKey="t" hide domain={['dataMin', 'dataMax']} />
          <YAxis hide domain={[0, 100]} />
          <Tooltip
            contentStyle={{ background: '#111b2e', border: '1px solid #2b3a5a', borderRadius: 8, fontSize: 12 }}
            labelFormatter={(v) => new Date(v as number).toLocaleDateString('nl-NL')}
            formatter={(v) => [v, 'score']}
          />
          <Line type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

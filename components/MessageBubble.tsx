import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface ChatMsg {
  id: number | string
  role: 'user' | 'assistant'
  content: string
  attachments?: Array<{ id: number; mime: string }>
}

export function MessageBubble({ m }: { m: ChatMsg }) {
  const alignClass = m.role === 'user' ? 'justify-end' : 'justify-start'
  const bubbleClass = m.role === 'user'
    ? 'bg-accent/15 text-text-primary'
    : 'bg-surface-2 text-text-primary'
  return (
    <div className={`flex ${alignClass}`}>
      <div className={`${bubbleClass} px-3 py-2 rounded-xl max-w-[80%] space-y-2`}>
        {m.attachments && m.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {m.attachments.map(a => (
              <img key={a.id} src={`/api/attachments/${a.id}`} alt="" className="w-24 h-24 object-cover rounded border border-border" />
            ))}
          </div>
        )}
        {m.role === 'assistant' ? (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
          </div>
        ) : (
          <div className="text-sm whitespace-pre-wrap">{m.content}</div>
        )}
      </div>
    </div>
  )
}

import type Anthropic from '@anthropic-ai/sdk'
import { getDb, type ChatMessageRow } from './db'
import { listAttachmentsForMessage, readAttachment } from './attachments'
import { getStoredProfile } from './profile'
import { getAdvice } from './advice'
import { getClaude, modelByKey, defaultChatModelKey, type ModelKey } from './claude'
import { getExternalConfig } from './external-configs'

const SYSTEM_PROMPT = `Je bent een WordPress-performance-expert die stapsgewijs helpt bij het oplossen van concrete Lighthouse-issues op een specifieke WordPress+WooCommerce site. Antwoord kort en in het Nederlands. Geef exacte menupaden. Als de gebruiker een screenshot deelt, verwijs concreet naar wat je ziet (kopjes, knoppen) en zeg welke klik volgt.`

export interface TurnInput {
  auditId: string
  userText: string
  pendingMessageId: number | null
  model?: ModelKey
}

export async function* streamTurn(input: TurnInput): AsyncGenerator<string, void, void> {
  const db = getDb()
  const modelKey: ModelKey = input.model ?? defaultChatModelKey()
  const modelName = modelByKey(modelKey)

  let userMsgId: number
  if (input.pendingMessageId) {
    db.prepare(`UPDATE issue_chat_messages SET content = ? WHERE id = ?`).run(input.userText, input.pendingMessageId)
    userMsgId = input.pendingMessageId
  } else {
    const info = db.prepare(`
      INSERT INTO issue_chat_messages (audit_id, role, content, created_at)
      VALUES (?, 'user', ?, ?)
    `).run(input.auditId, input.userText, Date.now())
    userMsgId = info.lastInsertRowid as number
  }
  void userMsgId

  const profile = getStoredProfile()
  const profileBlock = profile
    ? `Site-profiel:\n${JSON.stringify(profile.profile, null, 2)}`
    : '(site-profiel nog niet beschikbaar)'

  const issueRow = db.prepare(`
    SELECT title, category, display_value, details_json
    FROM opportunities WHERE audit_id = ? ORDER BY id DESC LIMIT 1
  `).get(input.auditId) as { title: string; category: string; display_value: string | null; details_json: string | null } | undefined

  const issueBlock = issueRow
    ? `Issue: ${input.auditId} — ${issueRow.title}\nCategorie: ${issueRow.category}\n${issueRow.display_value ?? ''}\nDetails (top 10):\n${summariseDetails(issueRow.details_json)}`
    : `Issue: ${input.auditId}`

  const existingAdvice = profile ? getAdvice(input.auditId, profile.hash) : null
  const adviceBlock = existingAdvice ? `Eerder gegenereerd advies:\n${existingAdvice.markdown}` : '(nog geen eerder advies)'

  const wpRocket = getExternalConfig('wp-rocket')
  const wpRocketBlock = wpRocket
    ? `Geüploade WP Rocket-export (huidige settings):\n${wpRocket.json_data}`
    : null

  // Drop orphaned user rows (placeholder created during upload but never followed
  // by a real text turn) so we never send Claude an assistant-first sequence.
  const historyRows = db.prepare(`
    SELECT * FROM issue_chat_messages WHERE audit_id = ? ORDER BY id ASC
  `).all(input.auditId) as ChatMessageRow[]

  const messages: Anthropic.MessageParam[] = []
  for (const row of historyRows) {
    const attach = listAttachmentsForMessage(row.id)
    const content: Anthropic.ContentBlockParam[] = []
    for (const a of attach) {
      const file = readAttachment(a.id)
      if (!file) continue
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: a.mime_type as 'image/png' | 'image/jpeg' | 'image/webp',
          data: file.buffer.toString('base64'),
        },
      })
    }
    if (row.content) content.push({ type: 'text', text: row.content })
    if (content.length === 0) continue
    messages.push({ role: row.role, content })
  }

  // Guarantee the message list starts with a user turn (Claude rejects an
  // assistant-first sequence). If somehow we still lead with assistant —
  // e.g., the user message was filtered above — drop the leading assistant turns.
  while (messages.length > 0 && messages[0].role === 'assistant') {
    messages.shift()
  }

  const client = getClaude()
  const contextBlocks: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: profileBlock, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: issueBlock,   cache_control: { type: 'ephemeral' } },
    { type: 'text', text: adviceBlock,  cache_control: { type: 'ephemeral' } },
  ]
  if (wpRocketBlock) {
    contextBlocks.push({ type: 'text', text: wpRocketBlock, cache_control: { type: 'ephemeral' } })
  }

  const stream = client.messages.stream({
    model: modelName,
    max_tokens: 2000,
    // System prompt isn't cached: it's well under Anthropic's minimum
    // cacheable size, so the cache_control tag would just consume one of
    // our four available breakpoints without saving tokens. The four
    // breakpoints go to the four sizeable, stable user-content blocks below.
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: contextBlocks },
      ...messages,
    ],
  })

  let assistantText = ''
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const chunk = event.delta.text
      assistantText += chunk
      yield chunk
    }
  }

  db.prepare(`
    INSERT INTO issue_chat_messages (audit_id, role, content, created_at)
    VALUES (?, 'assistant', ?, ?)
  `).run(input.auditId, assistantText, Date.now())
}

export function getChatHistory(auditId: string): Array<{
  id: number
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  attachments: Array<{ id: number; mime: string; size: number }>
}> {
  const rows = getDb().prepare(`
    SELECT * FROM issue_chat_messages WHERE audit_id = ? ORDER BY id ASC
  `).all(auditId) as ChatMessageRow[]
  return rows.map(r => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
    attachments: listAttachmentsForMessage(r.id).map(a => ({ id: a.id, mime: a.mime_type, size: a.size_bytes })),
  }))
}

function summariseDetails(json: string | null): string {
  if (!json) return '(geen details)'
  try {
    const parsed = JSON.parse(json) as { items?: unknown[] }
    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 10) : []
    return JSON.stringify(items, null, 2)
  } catch {
    return json.slice(0, 2000)
  }
}

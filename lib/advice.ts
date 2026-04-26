import type Anthropic from '@anthropic-ai/sdk'
import { getDb, type OpportunityRow } from './db'
import { getStoredProfile, refreshSiteProfile } from './profile'
import { getClaude, defaultModel, modelByKey, type ModelKey } from './claude'
import { getExternalConfig } from './external-configs'
import { log } from './logger'

const SYSTEM_PROMPT = `Je bent een WordPress-performance-expert. Antwoorden zijn in het Nederlands, pragmatisch, stap-voor-stap en met concrete menupaden (bijv. "WP Admin → WP Rocket → Cache"). Vermijd generieke tips; gebruik de meegegeven site-stack. Output in Markdown zonder codeblok eromheen.`

const ISSUE_TEMPLATE = `Issue: {audit_id} — {title}
Categorie: {category}
Voorbeeld-details (top 10): {details_json}
Betrokken URL's: {url_count} van {total_urls}

Geef stap-voor-stap uitleg:
1) Waar komt dit waarschijnlijk vandaan? (Vernoem specifieke plugins/thema uit het profiel.)
2) Concrete stappen (admin-menu's).
3) Hoe te verifiëren dat de fix werkt (bijv. "cf-cache-status in response", "PageSpeed opnieuw draaien", specifieke audit-score).
4) Risico's (cache-clear, CSS-regenerate, downtime, WPML-interactie).`

export interface GenerateOptions {
  auditId: string
  model?: string
  modelKey?: ModelKey
}

export async function generateAdviceForIssue(opts: GenerateOptions): Promise<{ markdown: string; model: string; hash: string }> {
  const db = getDb()

  let profile = getStoredProfile()
  if (!profile) {
    const fresh = await refreshSiteProfile()
    profile = { profile: fresh.profile, hash: fresh.hash, refreshedAt: Date.now() }
  }

  const sample = db.prepare(`
    SELECT * FROM opportunities WHERE audit_id = ? ORDER BY id DESC LIMIT 1
  `).get(opts.auditId) as OpportunityRow | undefined
  if (!sample) throw new Error(`Geen opportunity gevonden voor audit_id=${opts.auditId}`)

  const affectedUrls = db.prepare(`
    SELECT COUNT(DISTINCT lr.url_id) AS c
    FROM opportunities o
    JOIN lighthouse_results lr ON lr.id = o.lighthouse_result_id
    WHERE o.audit_id = ?
      AND lr.scan_id = (SELECT MAX(scan_id) FROM lighthouse_results)
  `).get(opts.auditId) as { c: number }
  const totalUrls = (db.prepare(`SELECT COUNT(*) AS c FROM urls WHERE enabled = 1`).get() as { c: number }).c

  const detailsSummary = summariseDetails(sample.details_json)

  const userMsg = ISSUE_TEMPLATE
    .replace('{audit_id}', sample.audit_id)
    .replace('{title}', sample.title)
    .replace('{category}', sample.category)
    .replace('{details_json}', detailsSummary)
    .replace('{url_count}', String(affectedUrls.c))
    .replace('{total_urls}', String(totalUrls))

  // Optional WP Rocket export — if uploaded, give the model exact visibility
  // into which settings are on/off so its advice can reference real keys.
  const wpRocket = getExternalConfig('wp-rocket')
  const wpRocketBlock = wpRocket
    ? `Geüploade WP Rocket-export (huidige settings):\n${wpRocket.json_data}`
    : null

  const model = opts.model ?? (opts.modelKey ? modelByKey(opts.modelKey) : defaultModel())
  const client = getClaude()

  const userBlocks: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: `Site-profiel:\n${JSON.stringify(profile.profile, null, 2)}`, cache_control: { type: 'ephemeral' } },
  ]
  if (wpRocketBlock) {
    userBlocks.push({ type: 'text', text: wpRocketBlock, cache_control: { type: 'ephemeral' } })
  }
  userBlocks.push({ type: 'text', text: userMsg })

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    // System prompt unsketched (see lib/chat.ts comment) — keep all four
    // cache breakpoints for the larger stable user-content blocks.
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: userBlocks },
    ],
  })

  const markdown = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim()

  db.prepare(`
    INSERT INTO issue_advice (audit_id, site_profile_hash, markdown_body, model_used, generated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(audit_id, site_profile_hash) DO UPDATE SET
      markdown_body = excluded.markdown_body,
      model_used    = excluded.model_used,
      generated_at  = excluded.generated_at
  `).run(opts.auditId, profile.hash, markdown, model, Date.now())

  log('info', 'advice', `Advies gegenereerd voor ${opts.auditId}`, { model, bytes: markdown.length })
  return { markdown, model, hash: profile.hash }
}

export function getAdvice(auditId: string, profileHash: string): { markdown: string; model: string; generatedAt: number } | null {
  const row = getDb().prepare(`
    SELECT markdown_body, model_used, generated_at FROM issue_advice
    WHERE audit_id = ? AND site_profile_hash = ?
  `).get(auditId, profileHash) as { markdown_body: string; model_used: string; generated_at: number } | undefined
  return row ? { markdown: row.markdown_body, model: row.model_used, generatedAt: row.generated_at } : null
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

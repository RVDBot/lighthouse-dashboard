import { getConfig } from './settings'
import { log } from './logger'
import type { Strategy, Category } from './db'

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'

export interface PsiRunRequest {
  url: string
  strategy: Strategy
  categories?: Category[]
}

export interface PsiRunResult {
  perfScore: number | null
  a11yScore: number | null
  bestPracticesScore: number | null
  seoScore: number | null
  lcpMs: number | null
  inpMs: number | null
  cls: number | null
  fcpMs: number | null
  tbtMs: number | null
  ttfbMs: number | null
  audits: Array<{
    auditId: string
    category: Category
    title: string
    score: number | null
    displayValue: string | null
    details: unknown
  }>
  raw: unknown
}

const DEFAULT_CATEGORIES: Category[] = ['performance', 'accessibility', 'best-practices', 'seo']

export async function runPsi(req: PsiRunRequest): Promise<PsiRunResult> {
  const apiKey = getConfig('PSI_API_KEY')
  if (!apiKey) throw new Error('PSI_API_KEY niet geconfigureerd')

  const params = new URLSearchParams()
  params.set('url', req.url)
  params.set('strategy', req.strategy)
  params.set('key', apiKey)
  for (const c of req.categories ?? DEFAULT_CATEGORIES) params.append('category', c)

  const endpoint = `${PSI_ENDPOINT}?${params.toString()}`
  const body = await fetchWithRetry(endpoint)
  return parsePsiResponse(body)
}

async function fetchWithRetry(url: string): Promise<unknown> {
  const attempt = async (): Promise<Response> => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 60_000)
    try {
      return await fetch(url, { signal: ctrl.signal })
    } finally {
      clearTimeout(t)
    }
  }

  let res: Response
  try {
    res = await attempt()
  } catch (e) {
    log('warn', 'psi', 'PSI fetch failed, retrying once', { error: e instanceof Error ? e.message : String(e) })
    res = await attempt()
  }

  if (res.status >= 500 && res.status < 600) {
    log('warn', 'psi', `PSI ${res.status}, retrying once`)
    res = await attempt()
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    let parsed: unknown = null
    try { parsed = JSON.parse(raw) } catch { /* not JSON */ }
    const apiErr = parsed && typeof parsed === 'object' && 'error' in parsed
      ? (parsed as { error: { message?: string; status?: string; errors?: unknown } }).error
      : null
    const summary = apiErr?.message ?? raw.slice(0, 500) ?? `HTTP ${res.status}`
    log('error', 'psi', `PSI ${res.status}: ${summary}`, {
      status: res.status,
      apiErrorStatus: apiErr?.status ?? null,
      apiErrors: apiErr?.errors ?? null,
      bodyRaw: raw,
    })
    throw new PsiError(res.status, summary, parsed, raw)
  }
  return await res.json()
}

export class PsiError extends Error {
  status: number
  body: unknown
  raw: string
  constructor(status: number, summary: string, body: unknown, raw: string) {
    super(`PSI ${status}: ${summary}`)
    this.name = 'PsiError'
    this.status = status
    this.body = body
    this.raw = raw
  }
}

function parsePsiResponse(body: unknown): PsiRunResult {
  const b = body as {
    lighthouseResult?: {
      categories?: Record<string, { score: number | null }>
      audits?: Record<string, {
        id?: string
        title?: string
        score?: number | null
        displayValue?: string | null
        numericValue?: number | null
        details?: unknown
      }>
    }
  }
  const lh = b.lighthouseResult
  if (!lh) throw new Error('PSI response mist lighthouseResult')

  const cat = (id: string) => lh.categories?.[id]?.score ?? null
  const auditNumeric = (id: string) => lh.audits?.[id]?.numericValue ?? null

  const catAudits: Record<Category, string[]> = {
    'performance':     ['render-blocking-resources','unused-css-rules','unused-javascript','unminified-css','unminified-javascript','uses-optimized-images','modern-image-formats','uses-text-compression','uses-responsive-images','efficient-animated-content','total-byte-weight','uses-long-cache-ttl','dom-size','third-party-summary','bootup-time','mainthread-work-breakdown','legacy-javascript','redirects','server-response-time','font-display'],
    'accessibility':   ['color-contrast','image-alt','label','link-name','button-name','html-has-lang','html-lang-valid','meta-viewport','heading-order','tabindex','aria-allowed-attr','aria-required-attr','aria-required-parent','aria-valid-attr','aria-valid-attr-value','form-field-multiple-labels'],
    'best-practices':  ['is-on-https','uses-http2','no-vulnerable-libraries','deprecations','errors-in-console','geolocation-on-start','notification-on-start','password-inputs-can-be-pasted-into','doctype','charset','js-libraries','image-aspect-ratio','image-size-responsive','csp-xss'],
    'seo':             ['viewport','document-title','meta-description','http-status-code','link-text','crawlable-anchors','is-crawlable','robots-txt','hreflang','canonical','font-size','plugins','tap-targets','structured-data'],
  }

  const audits: PsiRunResult['audits'] = []
  for (const [c, ids] of Object.entries(catAudits) as [Category, string[]][]) {
    for (const id of ids) {
      const a = lh.audits?.[id]
      if (!a) continue
      const score = a.score ?? null
      const hasDetails = a.details && typeof a.details === 'object' && (a.details as { items?: unknown[] }).items?.length
      if (score !== null && score >= 0.99 && !hasDetails) continue
      audits.push({
        auditId: id,
        category: c,
        title: a.title ?? id,
        score,
        displayValue: a.displayValue ?? null,
        details: a.details ?? null,
      })
    }
  }

  return {
    perfScore:          cat('performance'),
    a11yScore:          cat('accessibility'),
    bestPracticesScore: cat('best-practices'),
    seoScore:           cat('seo'),
    lcpMs:              auditNumeric('largest-contentful-paint'),
    inpMs:              auditNumeric('interaction-to-next-paint') ?? auditNumeric('experimental-interaction-to-next-paint'),
    cls:                auditNumeric('cumulative-layout-shift'),
    fcpMs:              auditNumeric('first-contentful-paint'),
    tbtMs:              auditNumeric('total-blocking-time'),
    ttfbMs:             auditNumeric('server-response-time'),
    audits,
    raw:                lh,
  }
}

import { createHash } from 'crypto'
import * as cheerio from 'cheerio'
import { getDb } from './db'
import { log } from './logger'
import { getConfig } from './settings'

export interface SiteProfile {
  detectedAt: number
  cdn: 'cloudflare' | 'other' | null
  cache: {
    plugin: 'wp-rocket' | 'w3-total-cache' | 'litespeed' | null
    edgeCache: boolean
    ttlSeconds: number
  }
  pageBuilder: 'elementor-pro' | 'elementor' | 'gutenberg' | null
  theme: { slug: string | null; type: 'child' | 'parent' | null }
  plugins: string[]
  wpml: { active: boolean; autoTranslate: boolean; languages: string[] }
  signals: {
    homepageHtmlBytes: number
    inlineCssBytes: number
    scriptCount: number
    thirdPartyHosts: string[]
  }
}

export async function detectProfile(baseUrl: string): Promise<SiteProfile> {
  const homeRes = await fetch(baseUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LighthouseDashboard/1.0)' },
  })
  const html = await homeRes.text()
  const homeBytes = new TextEncoder().encode(html).length
  const headers = Object.fromEntries([...homeRes.headers])

  const cdn: SiteProfile['cdn'] = (headers['server'] || '').toLowerCase().includes('cloudflare') ? 'cloudflare'
    : headers['cf-ray'] ? 'cloudflare' : headers['server'] ? 'other' : null

  const cc = headers['cache-control'] || ''
  const sMax = cc.match(/s-maxage=(\d+)/)?.[1]
  const maxAge = cc.match(/max-age=(\d+)/)?.[1]
  const ttlSeconds = parseInt(sMax ?? maxAge ?? '0', 10)
  const edgeCache = Boolean(sMax) || Boolean(headers['cf-cache-status'])

  const $ = cheerio.load(html)

  const bodyClass = $('body').attr('class') || ''
  const hasElementor = /elementor-page|elementor-kit-/.test(bodyClass) || html.includes('/wp-content/plugins/elementor/')
  const hasElementorPro = html.includes('/wp-content/plugins/elementor-pro/')
  const pageBuilder: SiteProfile['pageBuilder'] = hasElementorPro ? 'elementor-pro'
    : hasElementor ? 'elementor'
    : html.includes('wp-block-') ? 'gutenberg' : null

  const themeMatch = html.match(/\/wp-content\/themes\/([a-zA-Z0-9_\-]+)/)
  const themeSlug = themeMatch?.[1] ?? null
  const isChild = themeSlug ? new RegExp(`/themes/${themeSlug}-child/`).test(html) : false
  const theme: SiteProfile['theme'] = { slug: themeSlug, type: themeSlug ? (isChild ? 'child' : 'parent') : null }

  const cachePlugin: SiteProfile['cache']['plugin'] =
    html.includes('WP Rocket') || headers['x-wp-rocket'] ? 'wp-rocket'
    : html.includes('W3 Total Cache') ? 'w3-total-cache'
    : html.includes('LiteSpeed Cache') ? 'litespeed' : null

  let plugins: string[] = []
  let wpmlActive = false
  let wpmlAuto = false
  try {
    const wpjsonRes = await fetch(new URL('/wp-json/', baseUrl).toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (wpjsonRes.ok) {
      const data = await wpjsonRes.json() as { namespaces?: string[] }
      const ns = data.namespaces ?? []
      const set = new Set<string>()
      for (const n of ns) {
        const slug = n.split('/')[0]
        if (slug && slug !== 'wp' && slug !== 'oembed') set.add(slug)
      }
      plugins = [...set].sort()
      wpmlActive = plugins.some(p => p.startsWith('wpml'))
      wpmlAuto = plugins.includes('wpml/ate')
    }
  } catch (e) {
    log('warn', 'profile', 'wp-json niet bereikbaar', { error: e instanceof Error ? e.message : String(e) })
  }

  const languages = [...new Set($('link[rel="alternate"][hreflang]').map((_, el) => $(el).attr('hreflang')).get().filter(Boolean))]

  let inlineCssBytes = 0
  $('style').each((_, el) => { inlineCssBytes += new TextEncoder().encode($(el).html() ?? '').length })
  const scriptCount = $('script').length
  const hosts = new Set<string>()
  const baseHost = new URL(baseUrl).host
  $('script[src], link[rel="stylesheet"][href], img[src]').each((_, el) => {
    const $el = $(el)
    const src = $el.attr('src') || $el.attr('href')
    if (!src) return
    try {
      const h = new URL(src, baseUrl).host
      if (h && h !== baseHost) hosts.add(h)
    } catch { /* relative path with no base */ }
  })

  return {
    detectedAt: Date.now(),
    cdn,
    cache: { plugin: cachePlugin, edgeCache, ttlSeconds },
    pageBuilder,
    theme,
    plugins,
    wpml: { active: wpmlActive, autoTranslate: wpmlAuto, languages },
    signals: {
      homepageHtmlBytes: homeBytes,
      inlineCssBytes,
      scriptCount,
      thirdPartyHosts: [...hosts].sort(),
    },
  }
}

export function getStoredProfile(): { profile: SiteProfile; hash: string; refreshedAt: number } | null {
  const row = getDb().prepare('SELECT json_data, hash, refreshed_at FROM site_profile WHERE id = 1').get() as
    { json_data: string; hash: string; refreshed_at: number } | undefined
  if (!row) return null
  return { profile: JSON.parse(row.json_data), hash: row.hash, refreshedAt: row.refreshed_at }
}

export async function refreshSiteProfile(): Promise<{ profile: SiteProfile; hash: string }> {
  const baseUrl = getConfig('PROFILE_BASE_URL') ?? 'https://speedropeshop.com/'
  const profile = await detectProfile(baseUrl)
  const json = JSON.stringify(profile)
  const hash = createHash('sha256').update(json).digest('hex')

  getDb().prepare(`
    INSERT INTO site_profile (id, json_data, hash, refreshed_at) VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET json_data = excluded.json_data, hash = excluded.hash, refreshed_at = excluded.refreshed_at
  `).run(json, hash, Date.now())
  log('info', 'profile', 'Site-profiel bijgewerkt', { hash: hash.slice(0, 12), pluginCount: profile.plugins.length })
  return { profile, hash }
}

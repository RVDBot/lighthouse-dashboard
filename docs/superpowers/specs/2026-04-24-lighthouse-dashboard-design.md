# Lighthouse Dashboard — Design

**Date:** 2026-04-24
**Status:** Approved by user, ready for implementation planning
**Scope:** A self-hosted web dashboard that runs weekly (and on-demand) Lighthouse audits against the 6-language Speed Rope Shop WooCommerce site, stores historical scores, and surfaces WordPress-specific step-by-step remediation advice with a per-issue AI chat (including screenshot upload).

---

## Goal

Give the operator a single place to:
1. **See** how every key page of `speedropeshop.com` + the WPML-translated domains (`.nl`, `.de`, `.fr`, `.es`, `.it`) scores on Lighthouse over time (Performance, Accessibility, Best Practices, SEO; mobile + desktop).
2. **Understand** which issues are the highest-leverage to fix — aggregated across all URLs so the operator can prioritise.
3. **Fix** issues step-by-step inside WordPress/WooCommerce with advice that knows the actual plugin stack, theme, and cache setup (no generic "enable caching" advice).
4. **Troubleshoot** interactively via a per-issue AI chat with screenshot upload, so questions like "where exactly is this WP Rocket setting?" get answered against the real admin UI.

## Non-goals

- No SLA-grade monitoring or public status pages.
- No push notifications (operator checks the dashboard when they want).
- No authenticated-session tests (cart/checkout scanned "empty" — first-visit view is representative enough).
- No code-level autofix or auto-deploy to WordPress.
- No multi-user login; single operator, protected like the other personal tools.

## Decisions locked in during brainstorming

| Decision | Choice | Rationale |
| --- | --- | --- |
| Use case | Both monitor+track AND advise+prioritise | User picked "C": wants trends over time *and* actionable advice. |
| URL scope | Customer journey per language: home + 5 top products + category + cart + checkout = ~54 URLs/scan | User picked "C": dek de volledige koopfunnel. |
| Lighthouse engine | PageSpeed Insights API (Google cloud) | Zelfde methodologie als Google's Core Web Vitals/SEO-scoring; gratis tot 25 000 calls/dag; 54 URLs × 2 strategies × weekly × 52 ≈ 5 600/year, ruim onder de limiet. |
| Cadence | Weekly cron + on-demand button | WordPress site verandert zelden dagelijks; trends over weken zeggen meer; on-demand vangt "ik heb net iets veranderd"-usecase. |
| Categories | All 4 (Perf/A11y/BP/SEO) | PSI geeft ze sowieso terug; SEO is extra relevant met WPML (hreflang, canonicals); ruis filterbaar in UI. |
| Advice depth | Per-issue step-by-step WordPress+WooCommerce specific, informed by a persistent site-profile | User: "ik wil dat hij per issue stap voor stap uitlegt hoe ik dit binnen Wordpress + woocommerce kan fixen". |
| Notifications | None | User picked "C": geen pushmeldingen, checkt dashboard zelf. |
| Chat per issue | Yes, with screenshot upload from day one | User: "bouw meteen in". |

---

## Initial site recon (speedropeshop.com)

Performed once during brainstorming so the spec reflects the real stack. Will be re-run and stored in `site_profile` on first boot of the app.

**Infrastructure**
- Cloudflare CDN in front (edge cache with `s-maxage=2592000` = 30 days).
- Cache plugin: **WP Rocket** (wp-json namespace `wp-rocket/v1` present).

**Page builder / theme**
- **Elementor + Elementor Pro** (+ Elementor AI, Happy Addons for Elementor).

**WooCommerce + payments**
- WooCommerce, Mollie, PayPal, WC Shipment Tracking, AutomateWoo, WC POS.

**Translation**
- WPML with ATE (Automatic Translation Engine), String Translation, Translation Management.

**Other plugins detected**
- Yoast SEO, Ninja Forms, Slider Revolution, Jetpack, Complianz (cookies), Akismet, WP Mail SMTP.

**Initial red flag**
- Homepage HTML is **~2.4 MB** (normal ecom range: 100–400 KB). Almost certainly driven by Elementor-generated inline CSS + heavy DOM + Slider Revolution. This is likely the single biggest leverage point and the first real test of whether the AI-advice layer produces actionable, stack-aware recommendations.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Weekly cron (Fri 03:00)  +  on-demand button                │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Scan runner  (lib/scan.ts)                                  │
│   • Reads URL list from DB (~54 URLs, configurable)          │
│   • Calls PageSpeed Insights API, mobile + desktop           │
│   • Stores raw PSI response in lighthouse_results            │
│   • Parses audit items → opportunities table                 │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Site profiler  (lib/profile.ts)                             │
│   • Runs monthly + on demand                                 │
│   • Fingerprints HTTP headers + /wp-json/ + homepage HTML    │
│   • Output JSON + sha256 hash → site_profile table           │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Advice generator  (lib/advice.ts)                           │
│   • For every new (audit_id, site_profile.hash) pair, calls  │
│     Claude with the profile as context + issue details       │
│   • Default model: Haiku. "Regenerate with Opus" button per  │
│     issue to escalate.                                       │
│   • Stored as markdown in issue_advice                       │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Per-issue chat  (lib/chat.ts + UI)                          │
│   • Thread per audit_id, persists across scans               │
│   • Text + up to 5 images per turn (png/jpeg/webp, ≤10MB)    │
│   • Prompt-cached prefix (system + profile + issue context + │
│     base advice); only chat turns are "fresh"                │
│   • Model selectable per thread (Haiku default / Opus)       │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Dashboard UI (Next.js App Router)                           │
│   • Overview, URL detail, issue detail, settings             │
└──────────────────────────────────────────────────────────────┘

Stack: Next.js 15 + TS + better-sqlite3 + Tailwind
Deployment: new /docker/lighthouse-dashboard project on the same VPS,
same auto-deploy pipeline (GHA → ghcr.io → SSH pull on main).
```

---

## Data model

Eight SQLite tables. Each has one clear responsibility.

```sql
-- URLs to scan. Managed from Settings UI.
CREATE TABLE urls (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  url        TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL,              -- "Homepage NL", "Top product EN"
  language   TEXT NOT NULL,              -- 'nl', 'en', 'de', 'fr', 'es', 'it'
  page_type  TEXT NOT NULL,              -- 'home' | 'product' | 'category' | 'cart' | 'checkout'
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- Each scan run (weekly cron or manual).
CREATE TABLE scans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  trigger     TEXT NOT NULL,             -- 'cron' | 'manual'
  status      TEXT NOT NULL,             -- 'running' | 'done' | 'failed'
  error       TEXT
);

-- One row per URL × strategy (mobile/desktop) per scan.
CREATE TABLE lighthouse_results (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id              INTEGER NOT NULL,
  url_id               INTEGER NOT NULL,
  strategy             TEXT NOT NULL,     -- 'mobile' | 'desktop'
  fetched_at           INTEGER NOT NULL,
  perf_score           REAL,              -- 0..1
  a11y_score           REAL,
  best_practices_score REAL,
  seo_score            REAL,
  lcp_ms               REAL,
  inp_ms               REAL,
  cls                  REAL,
  fcp_ms               REAL,
  tbt_ms               REAL,
  ttfb_ms              REAL,
  raw_json             TEXT NOT NULL,
  FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE,
  FOREIGN KEY (url_id)  REFERENCES urls(id)  ON DELETE CASCADE
);

-- Per result: audit items with actual findings (score < 1 or details present).
CREATE TABLE opportunities (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  lighthouse_result_id INTEGER NOT NULL,
  audit_id             TEXT NOT NULL,
  category             TEXT NOT NULL,
  title                TEXT NOT NULL,
  score                REAL,
  display_value        TEXT,
  details_json         TEXT,
  FOREIGN KEY (lighthouse_result_id) REFERENCES lighthouse_results(id) ON DELETE CASCADE
);

-- AI-generated step-by-step advice, deduped by (audit_id, site-profile hash).
CREATE TABLE issue_advice (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_id          TEXT NOT NULL,
  site_profile_hash TEXT NOT NULL,
  markdown_body     TEXT NOT NULL,
  model_used        TEXT NOT NULL,
  generated_at      INTEGER NOT NULL,
  UNIQUE(audit_id, site_profile_hash)
);

-- Chat thread per audit_id, persists across scans.
CREATE TABLE issue_chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_id   TEXT NOT NULL,
  role       TEXT NOT NULL,              -- 'user' | 'assistant'
  content    TEXT NOT NULL,              -- text portion; images in chat_attachments
  created_at INTEGER NOT NULL
);

-- Image uploads (screenshots), linked to a chat message.
CREATE TABLE chat_attachments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_message_id INTEGER NOT NULL,
  file_path       TEXT NOT NULL,         -- relative inside /app/data/attachments/
  mime_type       TEXT NOT NULL,         -- 'image/png' | 'image/jpeg' | 'image/webp'
  size_bytes      INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (chat_message_id) REFERENCES issue_chat_messages(id) ON DELETE CASCADE
);

-- Single-row: detected stack.
CREATE TABLE site_profile (
  id           INTEGER PRIMARY KEY CHECK(id = 1),
  json_data    TEXT NOT NULL,
  hash         TEXT NOT NULL,             -- sha256 of json_data
  refreshed_at INTEGER NOT NULL
);
```

**Why this split**
- `opportunities` grows predictably (~14 k rows/year); index on `audit_id` powers the "where does issue X appear?" view.
- `issue_advice` cache keys on `(audit_id, site_profile.hash)` — adding a plugin invalidates advice automatically.
- `issue_chat_messages` keys on `audit_id` (not per-scan), so the thread persists. Image support is normalized via `chat_attachments` rather than blobbed into the message.
- `raw_json` preserved so future features can parse additional PSI fields without re-scanning.

---

## Scan pipeline (`lib/scan.ts`)

```
runScan(trigger: 'cron' | 'manual') →

  1. INSERT scans(status='running', trigger, started_at)
  2. rows = SELECT * FROM urls WHERE enabled=1
  3. For each url × strategy in { mobile, desktop } (max 4 parallel):
       • GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed
             ?url={url}
             &strategy={strategy}
             &category=performance&category=accessibility
             &category=best-practices&category=seo
             &key={PSI_API_KEY}
         timeout 60s · 1 retry on 5xx/network
       • INSERT lighthouse_results (scores + CWV fields + raw_json)
       • Parse audit items: keep those with score<1 OR details-with-items
         → INSERT opportunities
  4. UPDATE scans SET status='done', finished_at=now
  5. Enqueue advice generation for any new (audit_id, profile_hash) pairs.

  Individual URL failures are logged but do not abort the scan.
  Fatal errors: UPDATE scans SET status='failed', error=...
```

**Scheduling**: Next.js `instrumentation.ts` starts an internal tick on boot (same pattern as cs-assistant's email poller). A single timer checks every hour: if the most recent `status='done'` scan is older than 7 days, call `runScan('cron')`. No external cron required.

**On-demand**: `POST /api/scans` starts `runScan('manual')` and streams progress to the UI via SSE. Returns 429 if another scan is already running.

---

## Site profiler (`lib/profile.ts`)

Three sources, combined into one JSON payload:

1. **Headers** of the home URL → `cdn`, `server`, cache-headers, security-headers.
2. **`GET /wp-json/`** → `namespaces[]`, which reveals most plugin slugs for free.
3. **`GET /`** (homepage) + HTML parsing → theme path (`/wp-content/themes/X/`), `generator` meta, inline-CSS byte count, script count, third-party hosts, explicit detection of Elementor / Slider Revolution / WPML markers.

**Output shape** (stored in `site_profile.json_data`):

```typescript
{
  detectedAt: number,                  // unix ms
  cdn: 'cloudflare' | 'other' | null,
  cache: { plugin: 'wp-rocket' | 'w3-total-cache' | 'litespeed' | null,
           edgeCache: boolean, ttlSeconds: number },
  pageBuilder: 'elementor-pro' | 'elementor' | 'gutenberg' | null,
  theme: { slug: string | null, type: 'child' | 'parent' | null },
  plugins: string[],                   // slugs from wp-json namespaces
  wpml: { active: boolean, autoTranslate: boolean, languages: string[] },
  signals: {
    homepageHtmlBytes: number,
    inlineCssBytes: number,
    scriptCount: number,
    thirdPartyHosts: string[],
  }
}
```

**Refresh triggers**: monthly via the same instrumentation tick; on demand from Settings ("Refresh profile"); automatically after any scan that detects a change in detected plugins (compared to stored `plugins[]`).

**Hash**: `sha256(json_data)` drives the `issue_advice` cache key.

---

## AI advice generation (`lib/advice.ts`)

**Trigger**: after every scan, find `audit_id` values with no matching `issue_advice` row for the current `site_profile.hash`. One call per unique `audit_id`, dedupe is critical (one issue covering 20 URLs = 1 advice, not 20).

**Prompt structure** (Anthropic SDK, prompt caching on the stable prefix):

```
[cache] system: "Je bent een WordPress-performance-expert. Geef antwoorden
                in het Nederlands, pragmatisch, stap-voor-stap, met concrete
                menupaden (bijv. 'WP Admin → WP Rocket → Cache → …')."
[cache] user:   "Site-profiel: {site_profile.json_data}
                 Relevante signals: HTML {homepageHtmlBytes} B,
                 inline-CSS {inlineCssBytes} B, {plugin list summary}."
[     ] user:   "Issue: {audit_id} — {title}
                 Voorbeeld-details van één URL: {top 10 items uit details_json}
                 Betrokken URL's: {count} (bijv. '20 van 54, alle talen').

                 Geef stap-voor-stap uitleg:
                 1) Waar komt dit waarschijnlijk vandaan?
                 2) Concrete stappen (admin-menu's).
                 3) Hoe te verifiëren dat de fix werkt.
                 4) Risico's (cache-clear, regenerate, downtime)."
```

**Model selection**
- Default: `claude-haiku-4-5` — fast, cheap, handles structured advice well.
- Escalation: "Regenerate with Opus" button on each issue → `claude-opus-4-7`. Updates `issue_advice.markdown_body` and `model_used`.

**Output**: Markdown saved in `issue_advice.markdown_body`. Rendered client-side in the issue detail view.

---

## Per-issue chat (`lib/chat.ts` + UI)

Each `audit_id` gets one persistent chat thread. Every turn, Claude receives:

```
[cache] system:  (same as advice generator)
[cache] user:    site_profile + signals
[cache] user:    issue context (audit_id, title, display_value, details_json top 10)
[cache] user:    the stored markdown_body for this issue
[     ] turns:   prior issue_chat_messages (+ their chat_attachments as image blocks)
[     ] latest:  the new user turn (text + any fresh images)
```

The first four blocks hit the prompt cache, so subsequent turns are cheap.

**Image upload**
- UI: drag-drop or file picker next to the input. Thumbnail preview before send. Max 5 images/turn, 10 MB each, mime must be `image/png | image/jpeg | image/webp`.
- Server: validates mime at read time (not just extension), writes to `/app/data/attachments/<uuid>.<ext>`, inserts `chat_attachments` row with `file_path`, `mime_type`, `size_bytes`.
- To Claude: attachments are read from disk, base64-encoded, attached as `image` content blocks on the user message. Text + images in the same turn.
- Safety: UUID filenames (no user-controlled paths), response served with `Content-Disposition: attachment` when the UI fetches the raw image, auth middleware still gates access.

**Streaming**: yes — Next.js route handler with `text/event-stream`, client renders tokens as they arrive. Model selector (Haiku/Opus) visible at the top of the chat and switchable mid-thread (takes effect on the next user turn).

---

## UI

Four screens, built with Next.js App Router + Tailwind.

### Overview (landing)
- Header row: "Laatste scan: ..." + `[scan nu]` + `[⚙︎]`.
- Trend card: sparklines for Perf / A11y / BP / SEO across last 12 weeks, mobile/desktop toggle.
- URL matrix: grid with rows = page type, columns = language, cells = coloured score badges. Click cell → URL detail.
- Top issues this week: aggregated list of audit_ids sorted by URL-reach. Click → issue detail.

### URL detail
- Score rings per category (mobile + desktop side by side).
- Trend chart per score over the last 12 scans.
- List of opportunities for this URL sorted by impact. Click → issue detail.

### Issue detail (the main workflow view)
- Header: issue title, category, affected URL count, potential savings.
- Markdown-rendered advice body + "Regenerate with Opus" button + model+date byline.
- Top-5 offenders list (from `details_json`).
- Chat panel: model selector, prior messages (with attached image thumbnails), text input + upload button.

### Settings
- URL manager (add/edit/delete/enable, CSV import later).
- Site-profile read-only view + "Refresh profile".
- API keys (`PSI_API_KEY`, `ANTHROPIC_API_KEY`) — stored in `settings` table like cs-assistant, or via env vars if set.
- Scans: last 10 runs with status/duration/error, manual-scan button.

---

## Deployment

Follows the same pattern as cs-assistant:

- New GitHub repo `RVDBot/lighthouse-dashboard`.
- GitHub Actions workflow `docker.yml` builds + pushes `ghcr.io/rvdbot/lighthouse-dashboard:latest` on push to `main`.
- Second workflow `deploy.yml` triggers on successful image build, SSHes into the VPS, runs `docker compose pull && docker compose up -d` in `/docker/lighthouse-dashboard`.
- VPS compose file: single `lighthouse-dashboard` service, Cloudflare in front via the existing `nginx-proxy-manager`, SQLite volume for `data/`, attachments dir mounted.
- Reuses existing GHA secrets `VPS_SSH_KEY`, `VPS_USER`, `VPS_HOST`.

## Open items for the implementation plan

- Choosing a sensible initial URL list. The spec says 54 URLs (6 langs × 9 pages). The plan should include a way to seed the `urls` table — either a one-time import step or a Settings-UI-driven first-run wizard. Picking the "top 5 products" per language can be done by calling the WooCommerce REST API once to find best-sellers; otherwise the user enters them manually.
- Authentication: the cs-assistant-style cookie middleware is the intended pattern; the plan should decide whether to literally share an auth module or copy the pattern.
- PSI API key provisioning: Google Cloud Console → Credentials → API key restricted to `pagespeedonline.googleapis.com`. The plan should include operator-facing instructions for generating it.
- Chart library: `recharts` is the typical fit and is already popular in the other projects if reused. Decide in the plan.
- Markdown rendering library for the advice body (`react-markdown` + `remark-gfm` is the obvious choice).

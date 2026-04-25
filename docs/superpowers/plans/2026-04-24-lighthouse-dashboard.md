# Lighthouse Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted Next.js dashboard that runs weekly + on-demand PageSpeed Insights scans against the 6-language Speed Rope Shop WooCommerce site, stores historical scores and audit findings, generates WordPress-specific step-by-step remediation advice per issue (informed by a persistent site profile), and provides a per-issue AI chat with screenshot upload.

**Architecture:** One new Next.js 15 App Router project with better-sqlite3, Tailwind, and the Anthropic SDK. Deployed as its own Docker image on the shared VPS via the same GHA → GHCR → SSH auto-deploy pipeline as cs-assistant. Eight SQLite tables (urls, scans, lighthouse_results, opportunities, issue_advice, issue_chat_messages, chat_attachments, site_profile) power four UI screens (overview, URL detail, issue detail, settings).

**Tech Stack:** Next.js 15 (App Router, standalone output) · TypeScript · better-sqlite3 · Tailwind CSS · `@anthropic-ai/sdk` (streaming + prompt caching + images) · `recharts` for charts · `react-markdown` + `remark-gfm` for advice rendering · `lucide-react` for icons · `cheerio` for HTML parsing in the site profiler.

**Reference spec:** `docs/superpowers/specs/2026-04-24-lighthouse-dashboard-design.md`

**Project root (use everywhere below):**
`/Users/ruben/Library/CloudStorage/ProtonDrive-ruben.vandenbussche@proton.me-folder/_Personal/Claude code/lighthouse-dashboard`

**Testing note:** No unit-test framework is configured; verification for each task uses `npx tsc --noEmit`, running the dev server and hitting endpoints with curl or the browser, and visually checking pages. The final task sets up a real scan against `speedropeshop.com` end-to-end.

---

## File structure

**Top-level**
- `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `next-env.d.ts`
- `.env.example`
- `middleware.ts` — cookie-based auth (adapted from cs-assistant)
- `instrumentation.ts` — boot-time cron tick for weekly scans + monthly profile refresh
- `Dockerfile`, `docker-compose.yml`, `.dockerignore`
- `.github/workflows/docker.yml`, `.github/workflows/deploy.yml`

**`lib/`** — one file per responsibility
- `db.ts` — SQLite init, schema, shared types
- `logger.ts` — structured logs
- `security.ts` — cookie token sign/verify
- `settings.ts` — typed getter/setter for the `settings` key-value table
- `psi.ts` — PageSpeed Insights fetch + parse
- `scan.ts` — scan orchestration
- `profile.ts` — site fingerprinting
- `claude.ts` — Anthropic SDK wrapper with prompt caching + streaming helpers
- `advice.ts` — AI advice generation
- `chat.ts` — chat turn assembly (history + images → Claude content blocks)
- `attachments.ts` — upload validation + disk I/O

**`app/`** — App Router routes
- `layout.tsx`, `globals.css`, `page.tsx` (Overview)
- `login/page.tsx`
- `url/[id]/page.tsx` (URL detail)
- `issue/[auditId]/page.tsx` (Issue detail)
- `settings/page.tsx`
- `api/auth/login/route.ts`, `api/auth/logout/route.ts`
- `api/urls/route.ts`, `api/urls/[id]/route.ts`
- `api/scans/route.ts` (POST new, GET list), `api/scans/stream/route.ts` (SSE)
- `api/site-profile/route.ts` (GET / POST refresh)
- `api/issues/[auditId]/regenerate/route.ts` (POST)
- `api/issues/[auditId]/chat/route.ts` (GET history, POST streams new turn via SSE)
- `api/attachments/upload/route.ts`, `api/attachments/[id]/route.ts`

**`components/`**
- `ScoreBadge.tsx`, `ScoreRing.tsx`, `TrendChart.tsx`
- `UrlMatrix.tsx`, `TopIssuesList.tsx`
- `IssueList.tsx`, `AdviceBody.tsx`, `OffendersList.tsx`
- `ChatPanel.tsx`, `MessageBubble.tsx`, `ImageUploader.tsx`
- `UrlManager.tsx`, `SiteProfileView.tsx`, `ApiKeysForm.tsx`
- `ScanNowButton.tsx`, `Header.tsx`

---

## Task 1: Scaffold Next.js + Tailwind + TypeScript + SQLite

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `next-env.d.ts`
- Create: `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (temporary)
- Create: `.env.example`

- [ ] **Step 1.1: Initialise npm project**

```bash
cd "/Users/ruben/Library/CloudStorage/ProtonDrive-ruben.vandenbussche@proton.me-folder/_Personal/Claude code/lighthouse-dashboard"
npm init -y
```

- [ ] **Step 1.2: Install runtime + dev dependencies**

```bash
npm install next@15 react@19 react-dom@19 \
  better-sqlite3 \
  @anthropic-ai/sdk \
  cheerio \
  recharts \
  react-markdown remark-gfm \
  lucide-react \
  clsx tailwind-merge

npm install --save-dev typescript \
  @types/node @types/react @types/react-dom @types/better-sqlite3 \
  tailwindcss@3 postcss autoprefixer
```

- [ ] **Step 1.3: Replace `package.json` scripts and config**

Overwrite `package.json` with:

```json
{
  "name": "lighthouse-dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "better-sqlite3": "^11.0.0",
    "cheerio": "^1.0.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.469.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-markdown": "^9.0.0",
    "recharts": "^2.15.0",
    "remark-gfm": "^4.0.0",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 1.4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 1.5: Create `next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: { serverActions: { bodySizeLimit: '15mb' } },
}

export default nextConfig
```

The 15 MB body limit covers the 5 × 10 MB image uploads in the chat.

- [ ] **Step 1.6: Tailwind + PostCSS**

`postcss.config.js`:

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

`tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg':            '#0b1220',
        'surface-1':     '#111b2e',
        'surface-2':     '#1a2540',
        'surface-3':     '#243052',
        'border':        '#2b3a5a',
        'text-primary':  '#e6ecf8',
        'text-secondary':'#a8b3cc',
        'text-tertiary': '#6b7a99',
        'accent':        '#4aa3ff',
        'accent-hover':  '#2b8fff',
        'good':          '#22c55e',
        'warn':          '#f59e0b',
        'bad':           '#ef4444',
      },
    },
  },
  plugins: [],
}
export default config
```

`next-env.d.ts`:

```typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 1.7: App shell**

`app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body { background-color: #0b1220; color: #e6ecf8; }
body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
```

`app/layout.tsx`:

```tsx
import './globals.css'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Lighthouse Dashboard',
  description: 'Speed Rope Shop performance tracker',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  )
}
```

`app/page.tsx` (placeholder, replaced in later tasks):

```tsx
export default function Home() {
  return <main className="p-8"><h1 className="text-2xl">Lighthouse Dashboard</h1></main>
}
```

- [ ] **Step 1.8: `.env.example`**

```
# App
BASE_URL=http://localhost:3000
APP_PASSWORD=change_me
COOKIE_SECRET=generate_a_long_random_string

# PageSpeed Insights
# Generate at: https://console.cloud.google.com/apis/credentials
# Restrict key to pagespeedonline.googleapis.com
PSI_API_KEY=

# Anthropic
# Generate at: https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=
CLAUDE_MODEL_DEFAULT=claude-haiku-4-5-20251001
CLAUDE_MODEL_ESCALATED=claude-opus-4-7

# Database (SQLite)
DATABASE_PATH=./data/lighthouse.db
```

- [ ] **Step 1.9: Verify scaffold runs**

```bash
npm run dev
```

Expected: `✓ Ready in …ms`. Open `http://localhost:3000/` and see "Lighthouse Dashboard". Ctrl+C.

Then:

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 1.10: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts tailwind.config.ts postcss.config.js next-env.d.ts .env.example app/
git commit -m "Scaffold Next.js 15 + TS + Tailwind + SQLite deps"
```

---

## Task 2: Database layer (`lib/db.ts`) + logger + settings helper

**Files:**
- Create: `lib/db.ts`, `lib/logger.ts`, `lib/settings.ts`

- [ ] **Step 2.1: Create `lib/db.ts` with schema + interfaces**

```typescript
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(process.cwd(), 'data', 'lighthouse.db')

const dir = path.dirname(DB_PATH)
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  initSchema(_db)
  return _db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS urls (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      url        TEXT NOT NULL UNIQUE,
      label      TEXT NOT NULL,
      language   TEXT NOT NULL,
      page_type  TEXT NOT NULL,
      enabled    INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scans (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at  INTEGER NOT NULL,
      finished_at INTEGER,
      trigger     TEXT NOT NULL,
      status      TEXT NOT NULL,
      error       TEXT
    );

    CREATE TABLE IF NOT EXISTS lighthouse_results (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id              INTEGER NOT NULL,
      url_id               INTEGER NOT NULL,
      strategy             TEXT NOT NULL,
      fetched_at           INTEGER NOT NULL,
      perf_score           REAL,
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
    CREATE INDEX IF NOT EXISTS idx_lh_scan ON lighthouse_results(scan_id);
    CREATE INDEX IF NOT EXISTS idx_lh_url  ON lighthouse_results(url_id);

    CREATE TABLE IF NOT EXISTS opportunities (
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
    CREATE INDEX IF NOT EXISTS idx_opp_audit  ON opportunities(audit_id);
    CREATE INDEX IF NOT EXISTS idx_opp_result ON opportunities(lighthouse_result_id);

    CREATE TABLE IF NOT EXISTS issue_advice (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_id          TEXT NOT NULL,
      site_profile_hash TEXT NOT NULL,
      markdown_body     TEXT NOT NULL,
      model_used        TEXT NOT NULL,
      generated_at      INTEGER NOT NULL,
      UNIQUE(audit_id, site_profile_hash)
    );

    CREATE TABLE IF NOT EXISTS issue_chat_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_id   TEXT NOT NULL,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_audit ON issue_chat_messages(audit_id, created_at);

    CREATE TABLE IF NOT EXISTS chat_attachments (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_message_id INTEGER NOT NULL,
      file_path       TEXT NOT NULL,
      mime_type       TEXT NOT NULL,
      size_bytes      INTEGER NOT NULL,
      created_at      INTEGER NOT NULL,
      FOREIGN KEY (chat_message_id) REFERENCES issue_chat_messages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS site_profile (
      id           INTEGER PRIMARY KEY CHECK(id = 1),
      json_data    TEXT NOT NULL,
      hash         TEXT NOT NULL,
      refreshed_at INTEGER NOT NULL
    );
  `)
}

// Shared types ---------------------------------------------------------------

export type Language = 'nl' | 'en' | 'de' | 'fr' | 'es' | 'it'
export type PageType = 'home' | 'product' | 'category' | 'cart' | 'checkout'
export type Strategy = 'mobile' | 'desktop'
export type Category = 'performance' | 'accessibility' | 'best-practices' | 'seo'

export interface UrlRow {
  id: number
  url: string
  label: string
  language: Language
  page_type: PageType
  enabled: number
  created_at: number
}

export interface ScanRow {
  id: number
  started_at: number
  finished_at: number | null
  trigger: 'cron' | 'manual'
  status: 'running' | 'done' | 'failed'
  error: string | null
}

export interface LighthouseResultRow {
  id: number
  scan_id: number
  url_id: number
  strategy: Strategy
  fetched_at: number
  perf_score: number | null
  a11y_score: number | null
  best_practices_score: number | null
  seo_score: number | null
  lcp_ms: number | null
  inp_ms: number | null
  cls: number | null
  fcp_ms: number | null
  tbt_ms: number | null
  ttfb_ms: number | null
  raw_json: string
}

export interface OpportunityRow {
  id: number
  lighthouse_result_id: number
  audit_id: string
  category: Category
  title: string
  score: number | null
  display_value: string | null
  details_json: string | null
}

export interface IssueAdviceRow {
  id: number
  audit_id: string
  site_profile_hash: string
  markdown_body: string
  model_used: string
  generated_at: number
}

export interface ChatMessageRow {
  id: number
  audit_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: number
}

export interface ChatAttachmentRow {
  id: number
  chat_message_id: number
  file_path: string
  mime_type: string
  size_bytes: number
  created_at: number
}

export interface SiteProfileRow {
  id: 1
  json_data: string
  hash: string
  refreshed_at: number
}
```

- [ ] **Step 2.2: Create `lib/logger.ts`**

```typescript
type Level = 'info' | 'warn' | 'error'
type Category = 'scan' | 'profile' | 'advice' | 'chat' | 'psi' | 'auth' | 'systeem'

export function log(level: Level, category: Category, message: string, meta?: Record<string, unknown>) {
  const entry = {
    t: new Date().toISOString(),
    level,
    category,
    message,
    ...(meta ? { meta } : {}),
  }
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}
```

Logging to stdout is enough — Docker captures it; we don't need a DB-backed log table for this project.

- [ ] **Step 2.3: Create `lib/settings.ts`**

```typescript
import { getDb } from './db'

export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

/** Reads from env first, then the settings table. Use for secrets/config that can be set either way. */
export function getConfig(key: string): string | null {
  return process.env[key] ?? getSetting(key)
}
```

- [ ] **Step 2.4: Type-check**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 2.5: Verify schema creates**

```bash
npm run dev
```

Wait for Ready, then in a second terminal:

```bash
sqlite3 data/lighthouse.db ".tables"
```

Expected: lists all 9 tables (`settings`, `urls`, `scans`, `lighthouse_results`, `opportunities`, `issue_advice`, `issue_chat_messages`, `chat_attachments`, `site_profile`). Stop the dev server.

- [ ] **Step 2.6: Commit**

```bash
git add lib/
git commit -m "Add DB schema, logger, and settings helper"
```

---

## Task 3: Auth (middleware + login + security)

**Files:**
- Create: `lib/security.ts`, `middleware.ts`, `app/login/page.tsx`, `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`

- [ ] **Step 3.1: Create `lib/security.ts`**

```typescript
import { getConfig } from './settings'

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export function getSecret(): string {
  const s = getConfig('COOKIE_SECRET')
  if (!s || s.length < 16) throw new Error('COOKIE_SECRET niet geconfigureerd (minimaal 16 tekens)')
  return s
}

export async function signToken(userIdent: string): Promise<string> {
  const payload = `${userIdent}|${Date.now()}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
  return `${payload}.${b64}`
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return false
    const payload = token.slice(0, dot)
    const b64 = token.slice(dot + 1)
    const parts = payload.split('|')
    if (parts.length < 2) return false
    const issuedAt = parseInt(parts[1], 10)
    if (isNaN(issuedAt) || Date.now() - issuedAt > MAX_AGE_MS) return false

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(getSecret()),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    const sig = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    return await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(payload))
  } catch {
    return false
  }
}

export function verifyPassword(input: string): boolean {
  const expected = getConfig('APP_PASSWORD')
  if (!expected) return false
  if (input.length !== expected.length) return false
  // Constant-time compare
  let diff = 0
  for (let i = 0; i < input.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
```

- [ ] **Step 3.2: Create `middleware.ts` at project root**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/security'

export const runtime = 'nodejs'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const token = req.cookies.get('lh_auth')?.value
  if (token && (await verifyToken(token))) {
    return NextResponse.next()
  }

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)'],
}
```

- [ ] **Step 3.3: Login page + auth routes**

`app/login/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setBusy(false)
    if (res.ok) router.push('/')
    else setError('Wachtwoord onjuist')
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 bg-surface-1 p-6 rounded-xl border border-border">
        <h1 className="text-lg font-medium">Lighthouse Dashboard</h1>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full bg-surface-2 text-text-primary px-3 py-2 rounded-lg outline-none border border-border focus:border-accent"
          placeholder="Wachtwoord"
        />
        {error && <p className="text-bad text-sm">{error}</p>}
        <button
          disabled={busy || !password}
          className="w-full bg-accent hover:bg-accent-hover text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {busy ? 'Bezig…' : 'Inloggen'}
        </button>
      </form>
    </main>
  )
}
```

`app/api/auth/login/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { signToken, verifyPassword } from '@/lib/security'

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: '' }))
  if (!verifyPassword(password)) {
    return NextResponse.json({ error: 'Ongeldig' }, { status: 401 })
  }
  const token = await signToken('operator')
  const res = NextResponse.json({ ok: true })
  res.cookies.set('lh_auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  })
  return res
}
```

`app/api/auth/logout/route.ts`:

```typescript
import { NextResponse } from 'next/server'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('lh_auth', '', { maxAge: 0, path: '/' })
  return res
}
```

- [ ] **Step 3.4: Add `.env.local` with dev values**

```bash
cat > .env.local <<'EOF'
BASE_URL=http://localhost:3000
APP_PASSWORD=ontwikkel
COOKIE_SECRET=dev-secret-long-enough-for-hmac-sha256-use
DATABASE_PATH=./data/lighthouse.db
EOF
```

- [ ] **Step 3.5: Verify auth flow manually**

```bash
npm run dev
```

1. Open `http://localhost:3000/` — should redirect to `/login`.
2. Enter password `ontwikkel` → redirects to `/` showing placeholder page.
3. Ctrl+C.

- [ ] **Step 3.6: Type-check and commit**

```bash
npx tsc --noEmit
git add lib/security.ts middleware.ts app/login app/api/auth
git commit -m "Add cookie auth + login page + middleware gate"
```

---

## Task 4: PageSpeed Insights client (`lib/psi.ts`)

**Files:**
- Create: `lib/psi.ts`

- [ ] **Step 4.1: Implement the PSI client**

```typescript
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
  // Core Web Vitals + related field metrics from audits
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
  raw: unknown // full lighthouseResult, stored for later parsing
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
    // Network-level failure — one retry
    log('warn', 'psi', 'PSI fetch failed, retrying once', { error: e instanceof Error ? e.message : String(e) })
    res = await attempt()
  }

  if (res.status >= 500 && res.status < 600) {
    log('warn', 'psi', `PSI ${res.status}, retrying once`)
    res = await attempt()
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`PSI ${res.status}: ${text.slice(0, 200)}`)
  }
  return await res.json()
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

  // Category-to-audit mapping used only to tag opportunities.
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
      if (score !== null && score >= 0.99 && !hasDetails) continue // no finding
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
```

- [ ] **Step 4.2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4.3: Commit**

```bash
git add lib/psi.ts
git commit -m "Add PageSpeed Insights client with retry + parser"
```

---

## Task 5: URL management (API + DB helpers)

**Files:**
- Create: `app/api/urls/route.ts`, `app/api/urls/[id]/route.ts`

- [ ] **Step 5.1: Create `app/api/urls/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb, type UrlRow, type Language, type PageType } from '@/lib/db'

const LANGS: readonly Language[] = ['nl','en','de','fr','es','it']
const PAGE_TYPES: readonly PageType[] = ['home','product','category','cart','checkout']

export async function GET() {
  const rows = getDb().prepare('SELECT * FROM urls ORDER BY language, page_type, id').all() as UrlRow[]
  return NextResponse.json({ urls: rows })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 }) }
  const b = body as Partial<UrlRow>
  const url = typeof b.url === 'string' ? b.url.trim() : ''
  const label = typeof b.label === 'string' ? b.label.trim() : ''
  const language = b.language as Language
  const page_type = b.page_type as PageType

  if (!url || !/^https?:\/\//.test(url)) return NextResponse.json({ error: 'url vereist en moet http(s) zijn' }, { status: 400 })
  if (!label)                              return NextResponse.json({ error: 'label vereist' },                   { status: 400 })
  if (!LANGS.includes(language))           return NextResponse.json({ error: 'ongeldige language' },              { status: 400 })
  if (!PAGE_TYPES.includes(page_type))     return NextResponse.json({ error: 'ongeldige page_type' },             { status: 400 })

  const enabled = b.enabled === 0 ? 0 : 1
  try {
    const info = getDb().prepare(`
      INSERT INTO urls (url, label, language, page_type, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(url, label, language, page_type, enabled, Date.now())
    return NextResponse.json({ id: info.lastInsertRowid, ok: true })
  } catch (e) {
    return NextResponse.json({ error: 'URL bestaat al of DB-fout', detail: e instanceof Error ? e.message : String(e) }, { status: 409 })
  }
}
```

- [ ] **Step 5.2: Create `app/api/urls/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb, type UrlRow } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = parseInt(id, 10)
  if (isNaN(numId)) return NextResponse.json({ error: 'id' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as Partial<UrlRow>
  const sets: string[] = []
  const vals: unknown[] = []
  for (const k of ['label','language','page_type','enabled','url'] as const) {
    if (body[k] !== undefined) {
      sets.push(`${k} = ?`)
      vals.push(body[k])
    }
  }
  if (sets.length === 0) return NextResponse.json({ ok: true })
  vals.push(numId)
  getDb().prepare(`UPDATE urls SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  getDb().prepare('DELETE FROM urls WHERE id = ?').run(parseInt(id, 10))
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5.3: Seed a handful of URLs manually for testing**

Start the dev server (`npm run dev`), log in, then in a terminal:

```bash
# Get session cookie from browser DevTools → Application → Cookies → copy lh_auth value
COOKIE="lh_auth=<paste>"
curl -sS -X POST http://localhost:3000/api/urls -H "Content-Type: application/json" -H "Cookie: $COOKIE" -d '{"url":"https://speedropeshop.com/","label":"Homepage EN","language":"en","page_type":"home"}'
curl -sS -X POST http://localhost:3000/api/urls -H "Content-Type: application/json" -H "Cookie: $COOKIE" -d '{"url":"https://speedropeshop.nl/","label":"Homepage NL","language":"nl","page_type":"home"}'
curl -sS http://localhost:3000/api/urls -H "Cookie: $COOKIE" | head -1
```

Expected: each POST returns `{"id":N,"ok":true}`; GET returns an array with two rows.

- [ ] **Step 5.4: Type-check and commit**

```bash
npx tsc --noEmit
git add app/api/urls
git commit -m "Add /api/urls CRUD routes"
```

---

## Task 6: Scan orchestrator (`lib/scan.ts` + scans API)

**Files:**
- Create: `lib/scan.ts`, `app/api/scans/route.ts`, `app/api/scans/stream/route.ts`

- [ ] **Step 6.1: Create `lib/scan.ts`**

```typescript
import { getDb, type UrlRow, type Strategy } from './db'
import { runPsi, type PsiRunResult } from './psi'
import { log } from './logger'

const MAX_PARALLEL = 4

let currentScanId: number | null = null
const progressListeners = new Set<(event: ScanProgressEvent) => void>()

export type ScanProgressEvent =
  | { type: 'started'; scanId: number; total: number }
  | { type: 'url-done'; scanId: number; urlId: number; strategy: Strategy; ok: boolean; error?: string }
  | { type: 'finished'; scanId: number; ok: number; failed: number }
  | { type: 'failed'; scanId: number; error: string }

export function subscribeScanProgress(fn: (e: ScanProgressEvent) => void): () => void {
  progressListeners.add(fn)
  return () => { progressListeners.delete(fn) }
}

function emit(e: ScanProgressEvent) {
  for (const fn of progressListeners) {
    try { fn(e) } catch { /* listener error, ignore */ }
  }
}

export function getRunningScanId(): number | null { return currentScanId }

export async function runScan(trigger: 'cron' | 'manual'): Promise<number> {
  if (currentScanId !== null) throw new Error('Scan al bezig')

  const db = getDb()
  const startedAt = Date.now()
  const info = db.prepare(`
    INSERT INTO scans (started_at, trigger, status) VALUES (?, ?, 'running')
  `).run(startedAt, trigger)
  const scanId = info.lastInsertRowid as number
  currentScanId = scanId

  const urls = db.prepare('SELECT * FROM urls WHERE enabled = 1 ORDER BY id').all() as UrlRow[]
  const totalTasks = urls.length * 2 // mobile + desktop
  emit({ type: 'started', scanId, total: totalTasks })

  let ok = 0
  let failed = 0

  try {
    const queue: Array<{ url: UrlRow; strategy: Strategy }> = []
    for (const u of urls) {
      queue.push({ url: u, strategy: 'mobile' })
      queue.push({ url: u, strategy: 'desktop' })
    }

    const worker = async () => {
      while (queue.length > 0) {
        const task = queue.shift()
        if (!task) return
        try {
          const res = await runPsi({ url: task.url.url, strategy: task.strategy })
          persistResult(scanId, task.url.id, task.strategy, res)
          ok++
          emit({ type: 'url-done', scanId, urlId: task.url.id, strategy: task.strategy, ok: true })
        } catch (e) {
          failed++
          const msg = e instanceof Error ? e.message : String(e)
          log('error', 'scan', 'PSI run mislukt', { urlId: task.url.id, strategy: task.strategy, error: msg })
          emit({ type: 'url-done', scanId, urlId: task.url.id, strategy: task.strategy, ok: false, error: msg })
        }
      }
    }

    await Promise.all(Array.from({ length: MAX_PARALLEL }, () => worker()))

    db.prepare(`UPDATE scans SET status = 'done', finished_at = ? WHERE id = ?`).run(Date.now(), scanId)
    emit({ type: 'finished', scanId, ok, failed })
    log('info', 'scan', `Scan ${scanId} klaar`, { ok, failed, durationMs: Date.now() - startedAt })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    db.prepare(`UPDATE scans SET status = 'failed', finished_at = ?, error = ? WHERE id = ?`).run(Date.now(), msg, scanId)
    emit({ type: 'failed', scanId, error: msg })
    log('error', 'scan', `Scan ${scanId} gefaald`, { error: msg })
  } finally {
    currentScanId = null
  }

  return scanId
}

function persistResult(scanId: number, urlId: number, strategy: Strategy, res: PsiRunResult) {
  const db = getDb()
  const info = db.prepare(`
    INSERT INTO lighthouse_results
      (scan_id, url_id, strategy, fetched_at, perf_score, a11y_score, best_practices_score, seo_score,
       lcp_ms, inp_ms, cls, fcp_ms, tbt_ms, ttfb_ms, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    scanId, urlId, strategy, Date.now(),
    res.perfScore, res.a11yScore, res.bestPracticesScore, res.seoScore,
    res.lcpMs, res.inpMs, res.cls, res.fcpMs, res.tbtMs, res.ttfbMs,
    JSON.stringify(res.raw),
  )
  const resultId = info.lastInsertRowid as number

  const insertOpp = db.prepare(`
    INSERT INTO opportunities (lighthouse_result_id, audit_id, category, title, score, display_value, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const tx = db.transaction((audits: PsiRunResult['audits']) => {
    for (const a of audits) {
      insertOpp.run(resultId, a.auditId, a.category, a.title, a.score, a.displayValue, a.details ? JSON.stringify(a.details) : null)
    }
  })
  tx(res.audits)
}
```

- [ ] **Step 6.2: Create `app/api/scans/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { runScan, getRunningScanId } from '@/lib/scan'
import { getDb, type ScanRow } from '@/lib/db'

export async function GET() {
  const rows = getDb().prepare('SELECT * FROM scans ORDER BY id DESC LIMIT 20').all() as ScanRow[]
  return NextResponse.json({ scans: rows, running: getRunningScanId() })
}

export async function POST() {
  if (getRunningScanId() !== null) {
    return NextResponse.json({ error: 'Scan al bezig' }, { status: 429 })
  }
  // Fire-and-forget; client follows progress via SSE
  runScan('manual').catch(() => { /* errors already logged + persisted */ })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6.3: Create `app/api/scans/stream/route.ts`**

```typescript
import { subscribeScanProgress, type ScanProgressEvent } from '@/lib/scan'

export const runtime = 'nodejs'

export async function GET() {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const send = (e: ScanProgressEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`))
      }
      const unsub = subscribeScanProgress(send)
      const keepalive = setInterval(() => controller.enqueue(encoder.encode(': keepalive\n\n')), 20_000)
      const cleanup = () => { unsub(); clearInterval(keepalive); try { controller.close() } catch {} }
      // @ts-expect-error non-standard signal
      stream.cancel = cleanup
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
}
```

- [ ] **Step 6.4: Manual end-to-end test**

1. Add a `PSI_API_KEY` to `.env.local` (generate one at https://console.cloud.google.com/apis/credentials, restrict to `pagespeedonline.googleapis.com`).
2. Restart dev server.
3. With at least one URL seeded (from Task 5), run:

```bash
curl -sS -X POST http://localhost:3000/api/scans -H "Cookie: $COOKIE"
```

4. In another terminal, watch SSE:

```bash
curl -N -sS http://localhost:3000/api/scans/stream -H "Cookie: $COOKIE"
```

Expected: `started`, then `url-done` events, then `finished`. Ctrl+C when done.

5. Verify rows:

```bash
sqlite3 data/lighthouse.db "SELECT id, strategy, perf_score FROM lighthouse_results"
sqlite3 data/lighthouse.db "SELECT COUNT(*) FROM opportunities"
```

- [ ] **Step 6.5: Type-check and commit**

```bash
npx tsc --noEmit
git add lib/scan.ts app/api/scans
git commit -m "Add scan orchestrator + /api/scans routes with SSE progress"
```

---

## Task 7: Weekly cron via instrumentation

**Files:**
- Create: `instrumentation.ts`

- [ ] **Step 7.1: Create `instrumentation.ts` at project root**

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { getDb } = await import('./lib/db')
  const { runScan, getRunningScanId } = await import('./lib/scan')
  const { refreshSiteProfile } = await import('./lib/profile').catch(() => ({ refreshSiteProfile: null as null | (() => Promise<void>) }))
  const { log } = await import('./lib/logger')

  const HOUR_MS = 60 * 60 * 1000
  const WEEK_MS = 7 * 24 * HOUR_MS
  const MONTH_MS = 30 * 24 * HOUR_MS

  const tick = async () => {
    try {
      const db = getDb()
      const lastDone = db.prepare(`SELECT MAX(finished_at) AS t FROM scans WHERE status = 'done'`).get() as { t: number | null }
      const needScan = (lastDone.t === null || Date.now() - lastDone.t > WEEK_MS) && getRunningScanId() === null
      if (needScan) {
        log('info', 'scan', 'Cron: wekelijkse scan starten')
        runScan('cron').catch(() => { /* logged */ })
      }

      if (refreshSiteProfile) {
        const prof = db.prepare('SELECT refreshed_at FROM site_profile WHERE id = 1').get() as { refreshed_at: number } | undefined
        if (!prof || Date.now() - prof.refreshed_at > MONTH_MS) {
          log('info', 'profile', 'Cron: site-profile verversen')
          refreshSiteProfile().catch(() => { /* logged */ })
        }
      }
    } catch (e) {
      log('error', 'systeem', 'Cron tick error', { error: e instanceof Error ? e.message : String(e) })
    }
  }

  // First tick after 30s (so app is healthy), then hourly
  setTimeout(() => { tick() }, 30_000)
  setInterval(() => { tick() }, HOUR_MS)

  log('info', 'systeem', 'Instrumentation registered (cron ticks)')
}
```

The dynamic `import('./lib/profile')` with `.catch` lets this file compile before Task 9 exists; the cron simply skips the profile refresh until that file is added.

- [ ] **Step 7.2: Verify boot log**

```bash
npm run dev
```

Expected: the logs show `Instrumentation registered (cron ticks)`. Ctrl+C.

- [ ] **Step 7.3: Commit**

```bash
git add instrumentation.ts
git commit -m "Add instrumentation hook: hourly cron for weekly scan + monthly profile"
```

---

## Task 8: Site profiler (`lib/profile.ts` + API)

**Files:**
- Create: `lib/profile.ts`, `app/api/site-profile/route.ts`

- [ ] **Step 8.1: Create `lib/profile.ts`**

```typescript
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

  // Cache-Control parsing for edge TTL
  const cc = headers['cache-control'] || ''
  const sMax = cc.match(/s-maxage=(\d+)/)?.[1]
  const maxAge = cc.match(/max-age=(\d+)/)?.[1]
  const ttlSeconds = parseInt(sMax ?? maxAge ?? '0', 10)
  const edgeCache = Boolean(sMax) || Boolean(headers['cf-cache-status'])

  const $ = cheerio.load(html)

  // Page builder
  const bodyClass = $('body').attr('class') || ''
  const hasElementor = /elementor-page|elementor-kit-/.test(bodyClass) || html.includes('/wp-content/plugins/elementor/')
  const hasElementorPro = html.includes('/wp-content/plugins/elementor-pro/')
  const pageBuilder: SiteProfile['pageBuilder'] = hasElementorPro ? 'elementor-pro'
    : hasElementor ? 'elementor'
    : html.includes('wp-block-') ? 'gutenberg' : null

  // Theme
  const themeMatch = html.match(/\/wp-content\/themes\/([a-zA-Z0-9_\-]+)/)
  const themeSlug = themeMatch?.[1] ?? null
  const isChild = themeSlug ? new RegExp(`/themes/${themeSlug}-child/`).test(html) : false
  const theme: SiteProfile['theme'] = { slug: themeSlug, type: themeSlug ? (isChild ? 'child' : 'parent') : null }

  // Cache plugin: head comments + response headers
  const cachePlugin: SiteProfile['cache']['plugin'] =
    html.includes('WP Rocket') || headers['x-wp-rocket'] ? 'wp-rocket'
    : html.includes('W3 Total Cache') ? 'w3-total-cache'
    : html.includes('LiteSpeed Cache') ? 'litespeed' : null

  // Plugins from wp-json namespaces
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
      // Extract plugin slugs (first segment before '/')
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

  // WPML languages from <link rel="alternate" hreflang="..."> tags
  const languages = [...new Set($('link[rel="alternate"][hreflang]').map((_, el) => $(el).attr('hreflang')).get().filter(Boolean))]

  // Signals: inline CSS size + script count + third-party hosts
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
```

- [ ] **Step 8.2: Create `app/api/site-profile/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { getStoredProfile, refreshSiteProfile } from '@/lib/profile'

export async function GET() {
  const stored = getStoredProfile()
  return NextResponse.json(stored ?? { profile: null })
}

export async function POST() {
  try {
    const { profile, hash } = await refreshSiteProfile()
    return NextResponse.json({ profile, hash, refreshedAt: Date.now() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 8.3: Test the profiler**

```bash
curl -sS -X POST http://localhost:3000/api/site-profile -H "Cookie: $COOKIE" | head -20
```

Expected: JSON with `profile.cdn === "cloudflare"`, `profile.pageBuilder === "elementor-pro"`, `profile.plugins` array containing `wpml`, `wp-rocket`, `yoast`, `elementor`, etc.

- [ ] **Step 8.4: Type-check and commit**

```bash
npx tsc --noEmit
git add lib/profile.ts app/api/site-profile
git commit -m "Add site profiler + /api/site-profile GET/POST routes"
```

---

## Task 9: Claude wrapper + AI advice generator

**Files:**
- Create: `lib/claude.ts`, `lib/advice.ts`, `app/api/issues/[auditId]/regenerate/route.ts`

- [ ] **Step 9.1: Create `lib/claude.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { getConfig } from './settings'

let _client: Anthropic | null = null

export function getClaude(): Anthropic {
  if (_client) return _client
  const apiKey = getConfig('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY niet geconfigureerd')
  _client = new Anthropic({ apiKey })
  return _client
}

export function defaultModel(): string {
  return getConfig('CLAUDE_MODEL_DEFAULT') ?? 'claude-haiku-4-5-20251001'
}

export function escalatedModel(): string {
  return getConfig('CLAUDE_MODEL_ESCALATED') ?? 'claude-opus-4-7'
}
```

- [ ] **Step 9.2: Create `lib/advice.ts`**

```typescript
import { getDb, type OpportunityRow } from './db'
import { getStoredProfile, refreshSiteProfile } from './profile'
import { getClaude, defaultModel } from './claude'
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
}

export async function generateAdviceForIssue(opts: GenerateOptions): Promise<{ markdown: string; model: string; hash: string }> {
  const db = getDb()

  // Refresh profile if missing
  let profile = getStoredProfile()
  if (!profile) {
    const fresh = await refreshSiteProfile()
    profile = { profile: fresh.profile, hash: fresh.hash, refreshedAt: Date.now() }
  }

  // Gather a representative opportunity row + aggregate stats
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

  // Trim details_json: keep only the top 10 items to save tokens
  const detailsSummary = summariseDetails(sample.details_json)

  const userMsg = ISSUE_TEMPLATE
    .replace('{audit_id}', sample.audit_id)
    .replace('{title}', sample.title)
    .replace('{category}', sample.category)
    .replace('{details_json}', detailsSummary)
    .replace('{url_count}', String(affectedUrls.c))
    .replace('{total_urls}', String(totalUrls))

  const model = opts.model ?? defaultModel()
  const client = getClaude()

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      { role: 'user', content: [
        { type: 'text', text: `Site-profiel:\n${JSON.stringify(profile.profile, null, 2)}`, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: userMsg },
      ] },
    ],
  })

  const markdown = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim()

  // Upsert into issue_advice
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

// Anthropic SDK type import (keeps file self-contained at type level)
import type Anthropic from '@anthropic-ai/sdk'

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
```

- [ ] **Step 9.3: Regenerate endpoint**

`app/api/issues/[auditId]/regenerate/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { generateAdviceForIssue } from '@/lib/advice'
import { escalatedModel, defaultModel } from '@/lib/claude'

export async function POST(req: NextRequest, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params
  const body = await req.json().catch(() => ({})) as { model?: 'default' | 'escalated' }
  const model = body.model === 'escalated' ? escalatedModel() : defaultModel()
  try {
    const result = await generateAdviceForIssue({ auditId, model })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 9.4: Test the advice generator**

Add `ANTHROPIC_API_KEY` to `.env.local`, restart dev server. Then:

```bash
# Assuming Task 6 scan produced at least one opportunity with audit_id "unused-javascript"
curl -sS -X POST http://localhost:3000/api/issues/unused-javascript/regenerate -H "Cookie: $COOKIE" -H "Content-Type: application/json" -d '{"model":"default"}' | head -20
```

Expected: a JSON response with `markdown` containing WordPress-specific step-by-step Dutch advice referencing WP Rocket / Elementor / etc.

- [ ] **Step 9.5: Type-check and commit**

```bash
npx tsc --noEmit
git add lib/claude.ts lib/advice.ts app/api/issues
git commit -m "Add Claude wrapper + AI advice generator + regenerate route"
```

---

## Task 10: Chat — attachments storage + upload API

**Files:**
- Create: `lib/attachments.ts`, `app/api/attachments/upload/route.ts`, `app/api/attachments/[id]/route.ts`

- [ ] **Step 10.1: Create `lib/attachments.ts`**

```typescript
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs'
import { getDb, type ChatAttachmentRow } from './db'

const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_BYTES = 10 * 1024 * 1024

function attachmentsDir(): string {
  const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'lighthouse.db')
  const dir = path.join(path.dirname(path.resolve(dbPath)), 'attachments')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export interface StoreInput {
  chatMessageId: number
  mime: string
  buffer: Buffer
}

export function storeAttachment(input: StoreInput): ChatAttachmentRow {
  if (!ALLOWED_MIMES.has(input.mime)) throw new Error(`MIME niet toegestaan: ${input.mime}`)
  if (input.buffer.byteLength > MAX_BYTES) throw new Error(`Bestand te groot (max ${MAX_BYTES} bytes)`)

  const ext = input.mime === 'image/png' ? 'png' : input.mime === 'image/webp' ? 'webp' : 'jpg'
  const filename = `${randomUUID()}.${ext}`
  const fullPath = path.join(attachmentsDir(), filename)
  fs.writeFileSync(fullPath, input.buffer)

  const info = getDb().prepare(`
    INSERT INTO chat_attachments (chat_message_id, file_path, mime_type, size_bytes, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(input.chatMessageId, filename, input.mime, input.buffer.byteLength, Date.now())

  const row = getDb().prepare(`SELECT * FROM chat_attachments WHERE id = ?`).get(info.lastInsertRowid) as ChatAttachmentRow
  return row
}

export function readAttachment(id: number): { buffer: Buffer; mime: string } | null {
  const row = getDb().prepare(`SELECT file_path, mime_type FROM chat_attachments WHERE id = ?`).get(id) as
    { file_path: string; mime_type: string } | undefined
  if (!row) return null
  const fullPath = path.join(attachmentsDir(), row.file_path)
  if (!fs.existsSync(fullPath)) return null
  return { buffer: fs.readFileSync(fullPath), mime: row.mime_type }
}

export function listAttachmentsForMessage(chatMessageId: number): ChatAttachmentRow[] {
  return getDb().prepare(`SELECT * FROM chat_attachments WHERE chat_message_id = ? ORDER BY id`).all(chatMessageId) as ChatAttachmentRow[]
}
```

- [ ] **Step 10.2: Upload endpoint**

`app/api/attachments/upload/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { storeAttachment } from '@/lib/attachments'
import { getDb } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const auditId = form.get('auditId')
  if (typeof auditId !== 'string' || !auditId) {
    return NextResponse.json({ error: 'auditId vereist' }, { status: 400 })
  }

  // Create a placeholder message row that owns these attachments.
  // It stays role='user' and content='' until the user submits text + attachments together.
  // Simpler: the real turn creates a new message and we re-associate. But for a smaller API,
  // we require the caller to first POST an empty message, then upload. We'll instead create
  // attachments "pending" by linking to a freshly-inserted user message with empty content.
  const info = getDb().prepare(`
    INSERT INTO issue_chat_messages (audit_id, role, content, created_at)
    VALUES (?, 'user', '', ?)
  `).run(auditId, Date.now())
  const chatMessageId = info.lastInsertRowid as number

  const stored = []
  for (const [k, v] of form.entries()) {
    if (k !== 'file') continue
    if (!(v instanceof File)) continue
    const buf = Buffer.from(await v.arrayBuffer())
    try {
      const a = storeAttachment({ chatMessageId, mime: v.type, buffer: buf })
      stored.push({ id: a.id, mime: a.mime_type, size: a.size_bytes })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
    }
  }

  return NextResponse.json({ pendingMessageId: chatMessageId, attachments: stored })
}
```

- [ ] **Step 10.3: Serve endpoint**

`app/api/attachments/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { readAttachment } from '@/lib/attachments'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = readAttachment(parseInt(id, 10))
  if (!a) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  return new NextResponse(a.buffer, {
    headers: {
      'Content-Type': a.mime,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
```

- [ ] **Step 10.4: Type-check and commit**

```bash
npx tsc --noEmit
git add lib/attachments.ts app/api/attachments
git commit -m "Add chat attachments: storage, upload API, serve API"
```

---

## Task 11: Chat turn assembly + streaming API

**Files:**
- Create: `lib/chat.ts`, `app/api/issues/[auditId]/chat/route.ts`

- [ ] **Step 11.1: Create `lib/chat.ts`**

```typescript
import { getDb, type ChatMessageRow } from './db'
import { listAttachmentsForMessage, readAttachment } from './attachments'
import { getStoredProfile } from './profile'
import { getAdvice } from './advice'
import { getClaude, defaultModel, escalatedModel } from './claude'
import type Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `Je bent een WordPress-performance-expert die stapsgewijs helpt bij het oplossen van concrete Lighthouse-issues op een specifieke WordPress+WooCommerce site. Antwoord kort en in het Nederlands. Geef exacte menupaden. Als de gebruiker een screenshot deelt, verwijs concreet naar wat je ziet (kopjes, knoppen) en zeg welke klik volgt.`

export interface TurnInput {
  auditId: string
  userText: string
  pendingMessageId: number | null // if attachments were uploaded first, this is their placeholder msg
  model?: 'default' | 'escalated'
}

export async function* streamTurn(input: TurnInput): AsyncGenerator<string, void, void> {
  const db = getDb()
  const modelName = input.model === 'escalated' ? escalatedModel() : defaultModel()

  // 1. Write or update the user-turn row (with content = input.userText)
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

  // 2. Build the message history for Claude
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

  // History: all messages for this audit ordered by id
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

  // 3. Call Claude streaming
  const client = getClaude()
  const stream = client.messages.stream({
    model: modelName,
    max_tokens: 2000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [
      { role: 'user', content: [
        { type: 'text', text: profileBlock, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: issueBlock, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: adviceBlock, cache_control: { type: 'ephemeral' } },
      ] },
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

  // 4. Persist assistant message
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
```

- [ ] **Step 11.2: Chat route**

`app/api/issues/[auditId]/chat/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getChatHistory, streamTurn } from '@/lib/chat'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params
  return NextResponse.json({ messages: getChatHistory(auditId) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params
  const body = await req.json().catch(() => ({})) as {
    userText?: string
    pendingMessageId?: number | null
    model?: 'default' | 'escalated'
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamTurn({
          auditId,
          userText: body.userText ?? '',
          pendingMessageId: body.pendingMessageId ?? null,
          model: body.model ?? 'default',
        })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`))
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
}
```

- [ ] **Step 11.3: Test one streaming turn (no images)**

```bash
curl -N -sS -X POST "http://localhost:3000/api/issues/unused-javascript/chat" \
  -H "Cookie: $COOKIE" -H "Content-Type: application/json" \
  -d '{"userText":"Waar vind ik in WP Rocket de File Optimization tab?","model":"default"}'
```

Expected: a stream of `data: {"chunk":"…"}` lines, ending with `data: {"done":true}`.

- [ ] **Step 11.4: Type-check and commit**

```bash
npx tsc --noEmit
git add lib/chat.ts app/api/issues/\[auditId\]/chat
git commit -m "Add chat turn assembly + streaming chat route"
```

---

## Task 12: UI — Overview page + shared components

**Files:**
- Create: `components/Header.tsx`, `components/ScoreBadge.tsx`, `components/TrendChart.tsx`, `components/UrlMatrix.tsx`, `components/TopIssuesList.tsx`, `components/ScanNowButton.tsx`
- Rewrite: `app/page.tsx`

- [ ] **Step 12.1: `components/Header.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { Settings, LogOut } from 'lucide-react'

export function Header({ title, right }: { title: string; right?: React.ReactNode }) {
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-3">
      <Link href="/" className="text-text-primary font-medium">{title}</Link>
      <div className="flex items-center gap-3">
        {right}
        <Link href="/settings" aria-label="Settings" className="text-text-tertiary hover:text-text-primary">
          <Settings className="w-5 h-5" />
        </Link>
        <button onClick={logout} aria-label="Logout" className="text-text-tertiary hover:text-text-primary">
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  )
}
```

- [ ] **Step 12.2: `components/ScoreBadge.tsx`**

```tsx
export function scoreColor(score: number | null): string {
  if (score === null) return 'bg-surface-3 text-text-tertiary'
  const s = score * 100
  if (s >= 90) return 'bg-good/20 text-good'
  if (s >= 50) return 'bg-warn/20 text-warn'
  return 'bg-bad/20 text-bad'
}

export function ScoreBadge({ score }: { score: number | null }) {
  return (
    <span className={`inline-flex items-center justify-center w-10 h-6 rounded-md text-xs font-medium tabular-nums ${scoreColor(score)}`}>
      {score === null ? '—' : Math.round(score * 100)}
    </span>
  )
}
```

- [ ] **Step 12.3: `components/TrendChart.tsx`**

```tsx
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
```

- [ ] **Step 12.4: `components/UrlMatrix.tsx`**

```tsx
import Link from 'next/link'
import { ScoreBadge } from './ScoreBadge'

export interface MatrixCell {
  urlId: number
  score: number | null
}

export interface MatrixRow {
  pageType: string
  cells: Record<string, MatrixCell | undefined> // keyed by language
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
```

- [ ] **Step 12.5: `components/TopIssuesList.tsx`**

```tsx
import Link from 'next/link'

export interface TopIssue {
  auditId: string
  title: string
  category: string
  urlCount: number
}

export function TopIssuesList({ issues }: { issues: TopIssue[] }) {
  if (issues.length === 0) {
    return <p className="text-text-tertiary text-sm">Geen issues — draai eerst een scan.</p>
  }
  return (
    <ol className="space-y-1">
      {issues.map((it, idx) => (
        <li key={it.auditId} className="flex items-center gap-3 bg-surface-1 px-4 py-2 rounded-lg border border-border">
          <span className="text-text-tertiary w-5 text-right tabular-nums">{idx + 1}.</span>
          <div className="flex-1">
            <div className="text-text-primary text-sm">{it.title}</div>
            <div className="text-text-tertiary text-xs">{it.category} · raakt {it.urlCount} URL's</div>
          </div>
          <Link href={`/issue/${encodeURIComponent(it.auditId)}`} className="text-accent text-xs hover:underline">Open →</Link>
        </li>
      ))}
    </ol>
  )
}
```

- [ ] **Step 12.6: `components/ScanNowButton.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Play, Loader2 } from 'lucide-react'

export function ScanNowButton() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function start() {
    setBusy(true); setMsg(null)
    const r = await fetch('/api/scans', { method: 'POST' })
    if (r.ok) {
      setMsg('Scan gestart — kan 5–10 minuten duren')
    } else {
      const j = await r.json().catch(() => ({}))
      setMsg(j.error ?? 'Kon scan niet starten')
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={start} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        Scan nu
      </button>
      {msg && <span className="text-xs text-text-tertiary">{msg}</span>}
    </div>
  )
}
```

- [ ] **Step 12.7: Server-side data helpers used by the page**

Add to the **top** of `lib/db.ts` (re-export from db — these are query helpers local to the page and not worth their own file):

Actually keep `lib/db.ts` focused on schema + types. Put page queries inline in the page component as a server function.

Rewrite `app/page.tsx`:

```tsx
import { getDb } from '@/lib/db'
import { Header } from '@/components/Header'
import { UrlMatrix, type MatrixRow } from '@/components/UrlMatrix'
import { TopIssuesList, type TopIssue } from '@/components/TopIssuesList'
import { TrendChart, type TrendPoint } from '@/components/TrendChart'
import { ScanNowButton } from '@/components/ScanNowButton'
import { ScoreBadge } from '@/components/ScoreBadge'

export const dynamic = 'force-dynamic'

type CategoryKey = 'perf_score' | 'a11y_score' | 'best_practices_score' | 'seo_score'

function loadLatestScan() {
  const db = getDb()
  const latest = db.prepare(`SELECT id, finished_at FROM scans WHERE status='done' ORDER BY id DESC LIMIT 1`).get() as
    { id: number; finished_at: number } | undefined
  return latest ?? null
}

function loadMatrix(scanId: number, strategy: 'mobile' | 'desktop'): MatrixRow[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT u.id AS url_id, u.page_type, u.language, lr.perf_score
    FROM urls u
    LEFT JOIN lighthouse_results lr ON lr.url_id = u.id AND lr.scan_id = ? AND lr.strategy = ?
    WHERE u.enabled = 1
  `).all(scanId, strategy) as Array<{ url_id: number; page_type: string; language: string; perf_score: number | null }>

  const byType = new Map<string, MatrixRow>()
  for (const r of rows) {
    if (!byType.has(r.page_type)) byType.set(r.page_type, { pageType: r.page_type, cells: {} })
    byType.get(r.page_type)!.cells[r.language] = { urlId: r.url_id, score: r.perf_score }
  }
  return [...byType.values()].sort((a, b) => ORDER.indexOf(a.pageType) - ORDER.indexOf(b.pageType))
}
const ORDER = ['home','product','category','cart','checkout']

function loadTopIssues(scanId: number): TopIssue[] {
  const db = getDb()
  return db.prepare(`
    SELECT o.audit_id, o.title, o.category, COUNT(DISTINCT lr.url_id) AS url_count
    FROM opportunities o
    JOIN lighthouse_results lr ON lr.id = o.lighthouse_result_id
    WHERE lr.scan_id = ?
    GROUP BY o.audit_id
    ORDER BY url_count DESC, o.audit_id ASC
    LIMIT 10
  `).all(scanId) as TopIssue[]
}

function loadTrend(category: CategoryKey, strategy: 'mobile' | 'desktop', limit = 12): TrendPoint[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT s.finished_at AS t, AVG(lr.${category}) AS v
    FROM scans s
    JOIN lighthouse_results lr ON lr.scan_id = s.id
    WHERE s.status = 'done' AND lr.strategy = ?
    GROUP BY s.id
    ORDER BY s.id DESC
    LIMIT ?
  `).all(strategy, limit) as Array<{ t: number; v: number | null }>
  return rows.reverse().map(r => ({ t: r.t, value: r.v === null ? null : Math.round(r.v * 100) }))
}

export default function Home() {
  const latest = loadLatestScan()
  const strategy: 'mobile' | 'desktop' = 'mobile' // MVP single view
  const scanId = latest?.id ?? 0

  const matrix = scanId ? loadMatrix(scanId, strategy) : []
  const top = scanId ? loadTopIssues(scanId) : []
  const trendPerf = loadTrend('perf_score', strategy)
  const trendA11y = loadTrend('a11y_score', strategy)
  const trendBP   = loadTrend('best_practices_score', strategy)
  const trendSEO  = loadTrend('seo_score', strategy)

  return (
    <main>
      <Header title="Lighthouse Dashboard" right={<ScanNowButton />} />
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="text-sm text-text-tertiary">
          {latest
            ? <>Laatste scan: <span className="text-text-secondary">{new Date(latest.finished_at).toLocaleString('nl-NL')}</span></>
            : 'Nog geen afgeronde scan — draai er eerst één.'}
        </div>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ['Performance',   trendPerf, '#4aa3ff'],
            ['Accessibility', trendA11y, '#a855f7'],
            ['Best Practices',trendBP,   '#22c55e'],
            ['SEO',           trendSEO,  '#f59e0b'],
          ] as const).map(([label, data, color]) => {
            const last = data.length ? data[data.length - 1].value : null
            return (
              <div key={label} className="bg-surface-1 rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-tertiary">{label}</span>
                  <ScoreBadge score={last === null ? null : last / 100} />
                </div>
                <TrendChart data={data} height={40} stroke={color} />
              </div>
            )
          })}
        </section>

        <section>
          <h2 className="text-sm text-text-tertiary font-medium mb-2">URL-matrix (Performance, mobiel)</h2>
          <UrlMatrix rows={matrix} />
        </section>

        <section>
          <h2 className="text-sm text-text-tertiary font-medium mb-2">Top issues deze scan</h2>
          <TopIssuesList issues={top} />
        </section>
      </div>
    </main>
  )
}
```

- [ ] **Step 12.8: Verify**

Start dev server, log in, visit `/`. With a previously completed scan in the DB you should see the URL matrix populated + score cards. Click a cell → lands at `/url/1` → 404 (URL detail page is Task 13).

- [ ] **Step 12.9: Type-check and commit**

```bash
npx tsc --noEmit
git add components/ app/page.tsx
git commit -m "Add Overview page + Header, ScoreBadge, TrendChart, UrlMatrix, TopIssuesList"
```

---

## Task 13: URL detail page

**Files:**
- Create: `components/ScoreRing.tsx`, `components/IssueList.tsx`, `app/url/[id]/page.tsx`

- [ ] **Step 13.1: `components/ScoreRing.tsx`**

```tsx
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
```

- [ ] **Step 13.2: `components/IssueList.tsx`**

```tsx
import Link from 'next/link'

export interface IssueRow {
  auditId: string
  title: string
  category: string
  score: number | null
  displayValue: string | null
}

export function IssueList({ items }: { items: IssueRow[] }) {
  if (items.length === 0) {
    return <p className="text-text-tertiary text-sm">Geen issues voor deze URL in de laatste scan.</p>
  }
  return (
    <ul className="space-y-1">
      {items.map(it => (
        <li key={it.auditId} className="flex items-center gap-3 bg-surface-1 px-4 py-2 rounded-lg border border-border">
          <span className={`w-14 text-xs font-medium tabular-nums ${it.score === null ? 'text-text-tertiary' : it.score >= 0.9 ? 'text-good' : it.score >= 0.5 ? 'text-warn' : 'text-bad'}`}>
            {it.score === null ? '—' : Math.round(it.score * 100)}
          </span>
          <div className="flex-1">
            <div className="text-text-primary text-sm">{it.title}</div>
            <div className="text-text-tertiary text-xs">{it.category}{it.displayValue ? ` · ${it.displayValue}` : ''}</div>
          </div>
          <Link href={`/issue/${encodeURIComponent(it.auditId)}`} className="text-accent text-xs hover:underline">Open →</Link>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 13.3: URL-detail page**

`app/url/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getDb, type UrlRow, type LighthouseResultRow, type OpportunityRow } from '@/lib/db'
import { Header } from '@/components/Header'
import { ScoreRing } from '@/components/ScoreRing'
import { TrendChart, type TrendPoint } from '@/components/TrendChart'
import { IssueList, type IssueRow } from '@/components/IssueList'

export const dynamic = 'force-dynamic'

function loadUrl(id: number): UrlRow | null {
  return (getDb().prepare(`SELECT * FROM urls WHERE id = ?`).get(id) as UrlRow | undefined) ?? null
}

function loadLatestResult(urlId: number, strategy: 'mobile' | 'desktop'): LighthouseResultRow | null {
  return (getDb().prepare(`
    SELECT * FROM lighthouse_results WHERE url_id = ? AND strategy = ? ORDER BY id DESC LIMIT 1
  `).get(urlId, strategy) as LighthouseResultRow | undefined) ?? null
}

function loadTrend(urlId: number, strategy: 'mobile' | 'desktop', col: string, limit = 12): TrendPoint[] {
  const rows = getDb().prepare(`
    SELECT fetched_at AS t, ${col} AS v
    FROM lighthouse_results WHERE url_id = ? AND strategy = ? ORDER BY id DESC LIMIT ?
  `).all(urlId, strategy, limit) as Array<{ t: number; v: number | null }>
  return rows.reverse().map(r => ({ t: r.t, value: r.v === null ? null : Math.round(r.v * 100) }))
}

function loadIssues(resultId: number): IssueRow[] {
  const rows = getDb().prepare(`
    SELECT audit_id, title, category, score, display_value
    FROM opportunities WHERE lighthouse_result_id = ? ORDER BY score ASC
  `).all(resultId) as Array<{ audit_id: string; title: string; category: string; score: number | null; display_value: string | null }>
  return rows.map(r => ({ auditId: r.audit_id, title: r.title, category: r.category, score: r.score, displayValue: r.display_value }))
}

export default async function UrlDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const urlId = parseInt(id, 10)
  if (isNaN(urlId)) notFound()
  const url = loadUrl(urlId)
  if (!url) notFound()

  const mobile  = loadLatestResult(urlId, 'mobile')
  const desktop = loadLatestResult(urlId, 'desktop')
  const trendPerfMobile = loadTrend(urlId, 'mobile',  'perf_score')
  const trendPerfDesktop = loadTrend(urlId, 'desktop', 'perf_score')
  const issues = mobile ? loadIssues(mobile.id) : []

  return (
    <main>
      <Header title="Lighthouse Dashboard" />
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div>
          <div className="text-xs text-text-tertiary">{url.page_type} · {url.language.toUpperCase()}</div>
          <h1 className="text-lg text-text-primary mt-1">{url.label}</h1>
          <a href={url.url} target="_blank" rel="noopener" className="text-xs text-accent hover:underline">{url.url}</a>
        </div>

        <section className="grid grid-cols-2 gap-6">
          {(['mobile','desktop'] as const).map(strat => {
            const r = strat === 'mobile' ? mobile : desktop
            return (
              <div key={strat} className="bg-surface-1 border border-border rounded-xl p-4">
                <div className="text-xs text-text-tertiary mb-3 uppercase tracking-wide">{strat}</div>
                <div className="grid grid-cols-4 gap-3">
                  <ScoreRing label="Perf"  score={r?.perf_score ?? null} />
                  <ScoreRing label="A11y"  score={r?.a11y_score ?? null} />
                  <ScoreRing label="BP"    score={r?.best_practices_score ?? null} />
                  <ScoreRing label="SEO"   score={r?.seo_score ?? null} />
                </div>
              </div>
            )
          })}
        </section>

        <section>
          <h2 className="text-sm text-text-tertiary font-medium mb-2">Performance-trend</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-1 border border-border rounded-xl p-3">
              <div className="text-xs text-text-tertiary mb-1">Mobile</div>
              <TrendChart data={trendPerfMobile} stroke="#4aa3ff" height={100} />
            </div>
            <div className="bg-surface-1 border border-border rounded-xl p-3">
              <div className="text-xs text-text-tertiary mb-1">Desktop</div>
              <TrendChart data={trendPerfDesktop} stroke="#22c55e" height={100} />
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm text-text-tertiary font-medium mb-2">Issues (mobiel)</h2>
          <IssueList items={issues} />
        </section>
      </div>
    </main>
  )
}
```

- [ ] **Step 13.4: Verify**

Click a cell in the matrix on `/` → URL detail page loads with score rings + trend + issues list.

- [ ] **Step 13.5: Type-check and commit**

```bash
npx tsc --noEmit
git add components/ScoreRing.tsx components/IssueList.tsx app/url
git commit -m "Add URL detail page + ScoreRing + IssueList"
```

---

## Task 14: Issue detail page + advice + chat UI

**Files:**
- Create: `components/AdviceBody.tsx`, `components/OffendersList.tsx`, `components/ChatPanel.tsx`, `components/MessageBubble.tsx`, `components/ImageUploader.tsx`, `app/issue/[auditId]/page.tsx`

- [ ] **Step 14.1: `components/AdviceBody.tsx`**

```tsx
'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles, Loader2 } from 'lucide-react'

export function AdviceBody({
  auditId,
  initial,
  initialModel,
  initialGeneratedAt,
}: {
  auditId: string
  initial: string | null
  initialModel: string | null
  initialGeneratedAt: number | null
}) {
  const [body, setBody] = useState(initial)
  const [model, setModel] = useState(initialModel)
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function regenerate(mode: 'default' | 'escalated') {
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`/api/issues/${encodeURIComponent(auditId)}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: mode }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Fout')
      setBody(j.markdown)
      setModel(j.model)
      setGeneratedAt(Date.now())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-5 space-y-3">
      {body ? (
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-text-tertiary text-sm">Nog geen advies gegenereerd.</p>
      )}
      {err && <p className="text-bad text-xs">{err}</p>}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="text-xs text-text-tertiary">
          {model ? `${model}` : ''}{generatedAt ? ` · ${new Date(generatedAt).toLocaleString('nl-NL')}` : ''}
        </div>
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => regenerate('default')} className="text-xs px-2 py-1 rounded bg-surface-3 hover:bg-surface-2 text-text-primary flex items-center gap-1 disabled:opacity-50">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Regenereer
          </button>
          <button disabled={busy} onClick={() => regenerate('escalated')} className="text-xs px-2 py-1 rounded bg-accent hover:bg-accent-hover text-white flex items-center gap-1 disabled:opacity-50">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Met Opus
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 14.2: `components/OffendersList.tsx`**

```tsx
export interface Offender {
  label: string
  meta?: string
}

export function OffendersList({ items }: { items: Offender[] }) {
  if (items.length === 0) return null
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-2">
      <div className="text-xs text-text-tertiary uppercase tracking-wide">Top offenders</div>
      <ul className="text-sm space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="text-text-tertiary tabular-nums">{i + 1}.</span>
            <div className="flex-1 break-all">
              <div className="text-text-primary">{it.label}</div>
              {it.meta && <div className="text-text-tertiary text-xs">{it.meta}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 14.3: `components/ImageUploader.tsx`**

```tsx
'use client'

import { Paperclip, X } from 'lucide-react'
import { useRef } from 'react'

export interface PendingAttachment {
  id: number
  mime: string
  size: number
}

export function ImageUploader({
  pending,
  onPending,
  auditId,
}: {
  pending: { messageId: number | null; atts: PendingAttachment[] }
  onPending: (next: { messageId: number | null; atts: PendingAttachment[] }) => void
  auditId: string
}) {
  const fileInput = useRef<HTMLInputElement>(null)

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const fd = new FormData()
    fd.set('auditId', auditId)
    for (const f of Array.from(files)) fd.append('file', f)
    const r = await fetch('/api/attachments/upload', { method: 'POST', body: fd })
    const j = await r.json()
    if (!r.ok) {
      alert(j.error ?? 'Upload mislukt')
      return
    }
    onPending({ messageId: j.pendingMessageId, atts: [...pending.atts, ...j.attachments] })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className="text-text-tertiary hover:text-text-primary p-2"
        aria-label="Voeg afbeelding toe"
      >
        <Paperclip className="w-4 h-4" />
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={e => onFiles(e.target.files)}
      />
      {pending.atts.length > 0 && (
        <div className="flex gap-1">
          {pending.atts.map(a => (
            <div key={a.id} className="relative">
              <img src={`/api/attachments/${a.id}`} alt="" className="w-8 h-8 object-cover rounded border border-border" />
              <button
                onClick={() => onPending({ ...pending, atts: pending.atts.filter(x => x.id !== a.id) })}
                className="absolute -top-1 -right-1 bg-bad rounded-full w-3 h-3 flex items-center justify-center"
                aria-label="Verwijder"
              >
                <X className="w-2 h-2 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 14.4: `components/MessageBubble.tsx`**

```tsx
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
```

- [ ] **Step 14.5: `components/ChatPanel.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { MessageBubble, type ChatMsg } from './MessageBubble'
import { ImageUploader, type PendingAttachment } from './ImageUploader'

export function ChatPanel({ auditId }: { auditId: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [text, setText] = useState('')
  const [model, setModel] = useState<'default' | 'escalated'>('default')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ messageId: number | null; atts: PendingAttachment[] }>({ messageId: null, atts: [] })
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/issues/${encodeURIComponent(auditId)}/chat`).then(r => r.json()).then(j => {
      setMessages((j.messages ?? []).map((m: {
        id: number; role: 'user' | 'assistant'; content: string;
        attachments: Array<{ id: number; mime: string }>
      }) => ({
        id: m.id, role: m.role, content: m.content, attachments: m.attachments,
      })))
    })
  }, [auditId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send() {
    if (!text.trim() && pending.atts.length === 0) return
    setBusy(true)
    const userMsg: ChatMsg = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      attachments: pending.atts,
    }
    const assistantPlaceholder: ChatMsg = { id: `stream-${Date.now()}`, role: 'assistant', content: '' }
    setMessages(prev => [...prev, userMsg, assistantPlaceholder])
    const currentText = text
    const currentPendingId = pending.messageId
    setText('')
    setPending({ messageId: null, atts: [] })

    const res = await fetch(`/api/issues/${encodeURIComponent(auditId)}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userText: currentText, pendingMessageId: currentPendingId, model }),
    })
    if (!res.body) { setBusy(false); return }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n\n')
      buf = lines.pop() ?? ''
      for (const ln of lines) {
        if (!ln.startsWith('data:')) continue
        const payload = JSON.parse(ln.slice(5).trim()) as { chunk?: string; done?: boolean; error?: string }
        if (payload.chunk) {
          setMessages(prev => prev.map(m => m.id === assistantPlaceholder.id ? { ...m, content: m.content + payload.chunk } : m))
        }
        if (payload.error) {
          setMessages(prev => prev.map(m => m.id === assistantPlaceholder.id ? { ...m, content: `Fout: ${payload.error}` } : m))
        }
      }
    }
    setBusy(false)
  }

  return (
    <div className="bg-surface-1 border border-border rounded-xl flex flex-col min-h-[500px]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border text-xs text-text-tertiary">
        <span>Chat</span>
        <select value={model} onChange={e => setModel(e.target.value as 'default' | 'escalated')} className="bg-surface-2 text-text-primary text-xs px-2 py-1 rounded border border-border">
          <option value="default">Haiku (snel)</option>
          <option value="escalated">Opus (diepgaand)</option>
        </select>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(m => <MessageBubble key={m.id} m={m} />)}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-border p-3 flex items-start gap-2">
        <ImageUploader auditId={auditId} pending={pending} onPending={setPending} />
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          rows={2}
          className="flex-1 bg-surface-2 text-text-primary text-sm px-3 py-2 rounded-lg outline-none border border-border focus:border-accent resize-none"
          placeholder="Typ je vraag…"
        />
        <button disabled={busy} onClick={send} className="bg-accent hover:bg-accent-hover text-white text-sm px-3 py-2 rounded-lg flex items-center gap-1 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 14.6: Issue detail page**

`app/issue/[auditId]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getDb } from '@/lib/db'
import { getStoredProfile } from '@/lib/profile'
import { getAdvice } from '@/lib/advice'
import { Header } from '@/components/Header'
import { AdviceBody } from '@/components/AdviceBody'
import { OffendersList, type Offender } from '@/components/OffendersList'
import { ChatPanel } from '@/components/ChatPanel'

export const dynamic = 'force-dynamic'

interface IssueHeader {
  auditId: string
  title: string
  category: string
  displayValue: string | null
  urlCount: number
}

function loadIssueHeader(auditId: string): IssueHeader | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT o.audit_id, o.title, o.category, o.display_value,
           (SELECT COUNT(DISTINCT lr.url_id) FROM opportunities o2
            JOIN lighthouse_results lr ON lr.id = o2.lighthouse_result_id
            WHERE o2.audit_id = o.audit_id
              AND lr.scan_id = (SELECT MAX(scan_id) FROM lighthouse_results)) AS url_count
    FROM opportunities o
    WHERE o.audit_id = ?
    ORDER BY o.id DESC LIMIT 1
  `).get(auditId) as { audit_id: string; title: string; category: string; display_value: string | null; url_count: number } | undefined
  if (!row) return null
  return { auditId: row.audit_id, title: row.title, category: row.category, displayValue: row.display_value, urlCount: row.url_count }
}

function loadOffenders(auditId: string): Offender[] {
  const db = getDb()
  const row = db.prepare(`SELECT details_json FROM opportunities WHERE audit_id = ? ORDER BY id DESC LIMIT 1`).get(auditId) as { details_json: string | null } | undefined
  if (!row?.details_json) return []
  try {
    const d = JSON.parse(row.details_json) as { items?: Array<{ url?: string; wastedBytes?: number; totalBytes?: number; wastedMs?: number }> }
    return (d.items ?? []).slice(0, 5).map(it => ({
      label: it.url ?? JSON.stringify(it).slice(0, 120),
      meta: [
        it.wastedBytes ? `${Math.round(it.wastedBytes / 1024)} KiB besparing` : null,
        it.wastedMs ? `${Math.round(it.wastedMs)} ms` : null,
      ].filter(Boolean).join(' · ') || undefined,
    }))
  } catch { return [] }
}

export default async function IssueDetail({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId: raw } = await params
  const auditId = decodeURIComponent(raw)
  const header = loadIssueHeader(auditId)
  if (!header) notFound()
  const profile = getStoredProfile()
  const advice = profile ? getAdvice(auditId, profile.hash) : null
  const offenders = loadOffenders(auditId)

  return (
    <main>
      <Header title="Lighthouse Dashboard" />
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div>
          <div className="text-xs text-text-tertiary">{header.category} · raakt {header.urlCount} URL's</div>
          <h1 className="text-lg text-text-primary mt-1">{header.title}</h1>
          {header.displayValue && <div className="text-sm text-text-secondary">{header.displayValue}</div>}
        </div>

        <AdviceBody
          auditId={auditId}
          initial={advice?.markdown ?? null}
          initialModel={advice?.model ?? null}
          initialGeneratedAt={advice?.generatedAt ?? null}
        />

        <OffendersList items={offenders} />

        <ChatPanel auditId={auditId} />
      </div>
    </main>
  )
}
```

- [ ] **Step 14.7: Verify manually**

- Open an issue from the Overview → issue page loads with title, offenders, advice (or "Nog geen advies").
- Click "Regenereer" → advice appears.
- Type in chat, hit Enter → streaming response visible.
- Click paperclip → pick a PNG → thumbnail appears next to the input.
- Ask "wat zie je in deze screenshot?" with the image attached → Claude refers to its content.

- [ ] **Step 14.8: Type-check and commit**

```bash
npx tsc --noEmit
git add components/AdviceBody.tsx components/OffendersList.tsx components/ImageUploader.tsx components/MessageBubble.tsx components/ChatPanel.tsx app/issue
git commit -m "Add Issue detail page with advice, offenders, and chat panel"
```

---

## Task 15: Settings page + URL manager + site-profile view + API keys form

**Files:**
- Create: `components/UrlManager.tsx`, `components/SiteProfileView.tsx`, `components/ApiKeysForm.tsx`, `app/settings/page.tsx`, `app/api/settings/route.ts`

- [ ] **Step 15.1: Settings GET/POST API**

`app/api/settings/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSetting, setSetting } from '@/lib/settings'

const ALLOWED_KEYS = ['PSI_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_MODEL_DEFAULT', 'CLAUDE_MODEL_ESCALATED', 'PROFILE_BASE_URL'] as const

export async function GET() {
  const out: Record<string, string> = {}
  for (const k of ALLOWED_KEYS) out[k] = getSetting(k) ?? ''
  return NextResponse.json({ settings: out })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  for (const [k, v] of Object.entries(body)) {
    if (!(ALLOWED_KEYS as readonly string[]).includes(k)) continue
    if (typeof v === 'string') setSetting(k, v)
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 15.2: `components/UrlManager.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react'

interface Row { id: number; url: string; label: string; language: string; page_type: string; enabled: number }
const LANGS = ['nl','en','de','fr','es','it'] as const
const PAGES = ['home','product','category','cart','checkout'] as const

export function UrlManager() {
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ url: '', label: '', language: 'en', page_type: 'home' })

  async function load() {
    const r = await fetch('/api/urls'); const j = await r.json()
    setRows(j.urls ?? [])
  }
  useEffect(() => { load() }, [])

  async function add() {
    setBusy(true)
    const r = await fetch('/api/urls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    if (!r.ok) { const j = await r.json(); alert(j.error ?? 'Fout') }
    else { setForm({ url: '', label: '', language: 'en', page_type: 'home' }); await load() }
    setBusy(false)
  }

  async function toggle(id: number, enabled: number) {
    await fetch(`/api/urls/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: enabled ? 0 : 1 }) })
    await load()
  }

  async function remove(id: number) {
    if (!confirm('Verwijderen?')) return
    await fetch(`/api/urls/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="space-y-3">
      <div className="bg-surface-1 border border-border rounded-xl p-3 grid grid-cols-5 gap-2">
        <input className="bg-surface-2 text-sm px-2 py-1.5 rounded border border-border col-span-2" placeholder="https://..." value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} />
        <input className="bg-surface-2 text-sm px-2 py-1.5 rounded border border-border" placeholder="Label" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} />
        <select className="bg-surface-2 text-sm px-2 py-1.5 rounded border border-border" value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}>
          {LANGS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <div className="flex gap-2">
          <select className="flex-1 bg-surface-2 text-sm px-2 py-1.5 rounded border border-border" value={form.page_type} onChange={e => setForm({ ...form, page_type: e.target.value })}>
            {PAGES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button disabled={busy || !form.url || !form.label} onClick={add} className="bg-accent hover:bg-accent-hover text-white px-2 py-1.5 rounded text-sm disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-text-tertiary text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Label</th>
              <th className="text-left px-3 py-2">URL</th>
              <th className="px-3 py-2">Lang</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Actief</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-text-tertiary text-xs truncate max-w-xs">{r.url}</td>
                <td className="px-3 py-2 text-center uppercase">{r.language}</td>
                <td className="px-3 py-2 text-center">{r.page_type}</td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => toggle(r.id, r.enabled)} className={r.enabled ? 'text-good' : 'text-text-tertiary'}>
                    {r.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                </td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => remove(r.id)} className="text-text-tertiary hover:text-bad">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 15.3: `components/SiteProfileView.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'

interface Profile {
  detectedAt: number
  cdn: string | null
  cache: { plugin: string | null; edgeCache: boolean; ttlSeconds: number }
  pageBuilder: string | null
  theme: { slug: string | null; type: string | null }
  plugins: string[]
  wpml: { active: boolean; autoTranslate: boolean; languages: string[] }
  signals: { homepageHtmlBytes: number; inlineCssBytes: number; scriptCount: number; thirdPartyHosts: string[] }
}

export function SiteProfileView() {
  const [p, setP] = useState<Profile | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const r = await fetch('/api/site-profile'); const j = await r.json()
    if (j.profile) { setP(j.profile); setRefreshedAt(j.refreshedAt ?? j.refreshed_at ?? null) }
  }
  useEffect(() => { load() }, [])

  async function refresh() {
    setBusy(true)
    await fetch('/api/site-profile', { method: 'POST' })
    await load()
    setBusy(false)
  }

  if (!p) return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 text-sm text-text-tertiary flex items-center justify-between">
      <span>Nog geen site-profiel.</span>
      <button onClick={refresh} className="bg-accent hover:bg-accent-hover text-white text-xs px-3 py-1.5 rounded">Scan profiel</button>
    </div>
  )

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs text-text-tertiary">Ververst: {refreshedAt ? new Date(refreshedAt).toLocaleString('nl-NL') : '—'}</div>
        <button disabled={busy} onClick={refresh} className="text-xs flex items-center gap-1 bg-surface-3 hover:bg-surface-2 text-text-primary px-2 py-1 rounded disabled:opacity-50">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Verversen
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <dt className="text-text-tertiary">CDN</dt><dd>{p.cdn ?? '—'}</dd>
        <dt className="text-text-tertiary">Cache</dt><dd>{p.cache.plugin ?? '—'}{p.cache.edgeCache ? ` · edge (${p.cache.ttlSeconds}s)` : ''}</dd>
        <dt className="text-text-tertiary">Page builder</dt><dd>{p.pageBuilder ?? '—'}</dd>
        <dt className="text-text-tertiary">Thema</dt><dd>{p.theme.slug ?? '—'}{p.theme.type ? ` (${p.theme.type})` : ''}</dd>
        <dt className="text-text-tertiary">WPML</dt><dd>{p.wpml.active ? `actief${p.wpml.autoTranslate ? ' · auto' : ''} (${p.wpml.languages.join(', ')})` : '—'}</dd>
        <dt className="text-text-tertiary">Plugins</dt><dd className="break-words">{p.plugins.join(', ')}</dd>
        <dt className="text-text-tertiary">Homepage HTML</dt><dd>{Math.round(p.signals.homepageHtmlBytes / 1024)} KB</dd>
        <dt className="text-text-tertiary">Inline CSS</dt><dd>{Math.round(p.signals.inlineCssBytes / 1024)} KB</dd>
        <dt className="text-text-tertiary">Scripts</dt><dd>{p.signals.scriptCount}</dd>
        <dt className="text-text-tertiary">3rd-party hosts</dt><dd className="break-words">{p.signals.thirdPartyHosts.join(', ')}</dd>
      </dl>
    </div>
  )
}
```

- [ ] **Step 15.4: `components/ApiKeysForm.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

type S = { PSI_API_KEY: string; ANTHROPIC_API_KEY: string; CLAUDE_MODEL_DEFAULT: string; CLAUDE_MODEL_ESCALATED: string; PROFILE_BASE_URL: string }

export function ApiKeysForm() {
  const [s, setS] = useState<S>({ PSI_API_KEY: '', ANTHROPIC_API_KEY: '', CLAUDE_MODEL_DEFAULT: '', CLAUDE_MODEL_ESCALATED: '', PROFILE_BASE_URL: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { fetch('/api/settings').then(r => r.json()).then(j => setS(j.settings)) }, [])

  async function save() {
    setSaving(true); setSaved(false)
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const row = (label: string, key: keyof S, placeholder?: string, type: 'text' | 'password' = 'password') => (
    <label className="block space-y-1">
      <span className="text-text-tertiary text-xs">{label}</span>
      <input type={type} value={s[key]} onChange={e => setS({ ...s, [key]: e.target.value })}
             className="w-full bg-surface-2 text-sm px-3 py-2 rounded border border-border"
             placeholder={placeholder} />
    </label>
  )

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4 space-y-3">
      {row('PSI API key', 'PSI_API_KEY')}
      {row('Anthropic API key', 'ANTHROPIC_API_KEY')}
      {row('Claude default model', 'CLAUDE_MODEL_DEFAULT', 'claude-haiku-4-5-20251001', 'text')}
      {row('Claude escalated model', 'CLAUDE_MODEL_ESCALATED', 'claude-opus-4-7', 'text')}
      {row('Profiel base URL', 'PROFILE_BASE_URL', 'https://speedropeshop.com/', 'text')}
      <button onClick={save} disabled={saving} className="bg-accent hover:bg-accent-hover text-white text-sm px-3 py-1.5 rounded disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? '✓ Opgeslagen' : 'Opslaan'}
      </button>
    </div>
  )
}
```

- [ ] **Step 15.5: Settings page**

`app/settings/page.tsx`:

```tsx
import { Header } from '@/components/Header'
import { UrlManager } from '@/components/UrlManager'
import { SiteProfileView } from '@/components/SiteProfileView'
import { ApiKeysForm } from '@/components/ApiKeysForm'

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  return (
    <main>
      <Header title="Lighthouse Dashboard" />
      <div className="p-6 space-y-8 max-w-5xl mx-auto">
        <section className="space-y-2">
          <h2 className="text-sm text-text-tertiary font-medium">URL's</h2>
          <UrlManager />
        </section>
        <section className="space-y-2">
          <h2 className="text-sm text-text-tertiary font-medium">Site-profiel</h2>
          <SiteProfileView />
        </section>
        <section className="space-y-2">
          <h2 className="text-sm text-text-tertiary font-medium">API-sleutels</h2>
          <ApiKeysForm />
        </section>
      </div>
    </main>
  )
}
```

- [ ] **Step 15.6: Type-check and commit**

```bash
npx tsc --noEmit
git add components/UrlManager.tsx components/SiteProfileView.tsx components/ApiKeysForm.tsx app/settings app/api/settings
git commit -m "Add Settings page: URL manager, site-profile view, API keys form"
```

---

## Task 16: Dockerfile + docker-compose + deploy workflows

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.github/workflows/docker.yml`, `.github/workflows/deploy.yml`

- [ ] **Step 16.1: `Dockerfile`**

```dockerfile
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN mkdir -p /app/data /app/data/attachments

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_PATH=/app/data/lighthouse.db

CMD ["node", "server.js"]
```

- [ ] **Step 16.2: `.dockerignore`**

```
node_modules
.next
.git
.github
data
docs
.env*
!.env.example
tsconfig.tsbuildinfo
```

- [ ] **Step 16.3: `docker-compose.yml`**

```yaml
services:
  lighthouse-dashboard:
    image: ghcr.io/rvdbot/lighthouse-dashboard:latest
    pull_policy: always
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/app/data/lighthouse.db
      - BASE_URL=${BASE_URL}
      - APP_PASSWORD=${APP_PASSWORD}
      - COOKIE_SECRET=${COOKIE_SECRET}
      - PSI_API_KEY=${PSI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - CLAUDE_MODEL_DEFAULT=${CLAUDE_MODEL_DEFAULT}
      - CLAUDE_MODEL_ESCALATED=${CLAUDE_MODEL_ESCALATED}
      - PROFILE_BASE_URL=${PROFILE_BASE_URL}
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    ports:
      - 3011:3000
```

Port `3011` is chosen to not clash with the existing `cs-assistant` which uses `3010`. The reverse-proxy layer on the VPS routes a subdomain to this port.

- [ ] **Step 16.4: `.github/workflows/docker.yml`**

```yaml
name: Build & Push Docker Image

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Set up Buildx
        uses: docker/setup-buildx-action@v3
      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/rvdbot/lighthouse-dashboard:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            BUILDKIT_PROGRESS=plain
            GIT_HASH=${{ github.sha }}
```

- [ ] **Step 16.5: `.github/workflows/deploy.yml`**

```yaml
name: Deploy to Hostinger

on:
  workflow_run:
    workflows: ["Build & Push Docker Image"]
    types: [completed]
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    steps:
      - name: Deploy via SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.VPS_SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh -o StrictHostKeyChecking=no -i ~/.ssh/deploy_key ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} \
            'cd /docker/lighthouse-dashboard && docker compose pull && docker compose up -d'
```

- [ ] **Step 16.6: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml .github
git commit -m "Add Dockerfile, docker-compose, and GHA build+deploy workflows"
```

---

## Task 17: Create GitHub repo + first deploy

All commands run on the Mac; the VPS work is a one-off setup.

- [ ] **Step 17.1: Create the repo on GitHub and push**

(Uses the existing `github-rvdbot` SSH alias pattern; the user runs this in their own shell, not via the assistant's Bash.)

```bash
# Create repo (requires gh CLI; if missing, create manually in the browser at github.com/new and skip this command)
gh repo create RVDBot/lighthouse-dashboard --private --source=. --remote=origin --push=false

# Or set remote manually if created in the browser:
git remote add origin git@github-rvdbot:RVDBot/lighthouse-dashboard.git

git branch -M main
git push -u origin main
```

Confirm the two GHA workflows show up under `Actions` on GitHub. The first "Build & Push Docker Image" run starts automatically from the push.

- [ ] **Step 17.2: Verify the image lands on GHCR**

Visit `https://github.com/RVDBot/lighthouse-dashboard/pkgs/container/lighthouse-dashboard` — the `latest` tag should appear after the first build.

- [ ] **Step 17.3: One-off VPS setup**

SSH into the VPS and run:

```bash
mkdir -p /docker/lighthouse-dashboard && cd /docker/lighthouse-dashboard

# Pull the compose file from main
curl -o docker-compose.yml \
  https://raw.githubusercontent.com/RVDBot/lighthouse-dashboard/main/docker-compose.yml

# Create the .env file with real values (replace placeholders)
cat > .env <<'EOF'
BASE_URL=https://lighthouse.example.com
APP_PASSWORD=<choose-a-strong-password>
COOKIE_SECRET=<run: openssl rand -hex 32>
PSI_API_KEY=<from console.cloud.google.com>
ANTHROPIC_API_KEY=<from console.anthropic.com>
CLAUDE_MODEL_DEFAULT=claude-haiku-4-5-20251001
CLAUDE_MODEL_ESCALATED=claude-opus-4-7
PROFILE_BASE_URL=https://speedropeshop.com/
EOF

chmod 600 .env
mkdir -p data

# Start
docker compose pull && docker compose up -d
docker compose logs -f lighthouse-dashboard
```

Expect to see `✓ Ready in ...ms` and `Instrumentation registered (cron ticks)`.

- [ ] **Step 17.4: Add reverse-proxy entry**

In the existing `nginx-proxy-manager-pmmf` admin UI, create a Proxy Host:
- Domain: `lighthouse.<your-domain>`
- Forward to: `lighthouse-dashboard:3000` (on the shared internal Docker network) or `<vps-ip>:3011` (if using host ports).
- Enable SSL (Let's Encrypt) + Force SSL.

- [ ] **Step 17.5: First real scan end-to-end**

1. Visit `https://lighthouse.<your-domain>/` → redirects to `/login`.
2. Log in with `APP_PASSWORD`.
3. Settings → enter PSI + Anthropic keys (or confirm they're already loaded from `.env`).
4. Settings → URLs → seed all 54 URLs (6 langs × 9 page types). An "Import preset" button is future work — for now, add manually or run the curl seed loop from Task 5's doc against production.
5. Settings → Site-profiel → "Scan profiel" → confirm Cloudflare / WP Rocket / Elementor Pro / WPML are all detected.
6. Back to Overview → click "Scan nu" → wait ~5–10 min → scores populate.
7. Open a "Top issue" → confirm AI advice is generated and WordPress-specific.
8. Open the chat on that issue → attach a screenshot of a WP admin page → ask a question → confirm the response references the screenshot.

- [ ] **Step 17.6: Final cleanup commit (if needed)**

If any tweaks surface during the first real-world run (typos in prompts, layout issues, missing PSI fields), fix them and commit each one separately with a descriptive message. Auto-deploy ships every push to main.

---

## Implementation notes not tied to a single task

- **Prompt caching hit-rate**: the first advice call for a new `site_profile.hash` does not hit the cache; subsequent calls (and chat turns) for the same profile do. If cost is noticeable, check response `usage.cache_read_input_tokens` to confirm cache usage.
- **PSI rate limits**: the free tier is 25 000 queries/day with an API key. Our 54 URLs × 2 strategies = 108 per full scan, weekly = ~470/month. Very comfortable.
- **Claude cost estimate** for weekly routine: ~30 unique `audit_id` values per scan × Haiku advice generation (≈ 500 input + 800 output tokens after caching) ≈ cents per scan. Opus escalation is on-demand only.
- **Recharts SSR**: the `TrendChart` is a `'use client'` component. Do not import it into server components for direct rendering — it's used inside client components or inside pages where the chart is rendered in the tree (Next.js handles the boundary).
- **Next.js 15 params**: route-handler and page params are Promises (`{ params: Promise<{ id: string }> }`). Always `await params`. Shown in every route handler in this plan.
- **Attachments path**: `/app/data/attachments` is inside the mounted `./data` volume, so uploaded files survive container restarts.

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

    CREATE TABLE IF NOT EXISTS logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      level      TEXT NOT NULL,
      category   TEXT NOT NULL,
      message    TEXT NOT NULL,
      meta       TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_logs_created  ON logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_logs_level    ON logs(level);
    CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(category);

    CREATE TABLE IF NOT EXISTS external_configs (
      kind        TEXT PRIMARY KEY,
      json_data   TEXT NOT NULL,
      filename    TEXT,
      uploaded_at INTEGER NOT NULL
    );
  `)
}

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

export interface LogRow {
  id: number
  level: 'info' | 'warn' | 'error'
  category: string
  message: string
  meta: string | null
  created_at: number
}

export interface ExternalConfigRow {
  kind: string
  json_data: string
  filename: string | null
  uploaded_at: number
}

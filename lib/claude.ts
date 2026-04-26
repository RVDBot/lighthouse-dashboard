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

export type ModelKey = 'haiku' | 'sonnet' | 'opus'

const FALLBACKS: Record<ModelKey, string> = {
  haiku:  'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus:   'claude-opus-4-7',
}

export function modelByKey(key: ModelKey): string {
  if (key === 'haiku')  return getConfig('CLAUDE_MODEL_HAIKU')  ?? FALLBACKS.haiku
  if (key === 'sonnet') return getConfig('CLAUDE_MODEL_SONNET') ?? FALLBACKS.sonnet
  return getConfig('CLAUDE_MODEL_OPUS') ?? FALLBACKS.opus
}

/** The chat panel's default model when opening a new thread. Falls back to sonnet if not set. */
export function defaultChatModelKey(): ModelKey {
  const v = getConfig('CLAUDE_MODEL_DEFAULT_CHAT')
  if (v === 'haiku' || v === 'sonnet' || v === 'opus') return v
  return 'sonnet'
}

/** Backwards-compat helpers for callers that haven't migrated yet. */
export function defaultModel(): string  { return modelByKey('haiku') }
export function escalatedModel(): string { return modelByKey('opus') }

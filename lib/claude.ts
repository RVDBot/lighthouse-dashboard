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

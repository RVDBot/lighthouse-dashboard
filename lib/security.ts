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
  let diff = 0
  for (let i = 0; i < input.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

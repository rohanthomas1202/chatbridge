import { describe, expect, it, beforeEach } from 'vitest'
import { signAccessToken, signRefreshToken, verifyToken } from './jwt'
import { resetServerConfig } from '../config'

describe('JWT helpers', () => {
  beforeEach(() => {
    resetServerConfig()
  })

  it('signs and verifies an access token', async () => {
    const token = await signAccessToken({ sid: 'user-1', name: 'Alice' })
    const payload = await verifyToken(token)
    expect(payload.sid).toBe('user-1')
    expect(payload.name).toBe('Alice')
  })

  it('signs and verifies a refresh token', async () => {
    const token = await signRefreshToken({ sid: 'user-1' })
    const payload = await verifyToken(token)
    expect(payload.sid).toBe('user-1')
    expect(payload.type).toBe('refresh')
  })

  it('rejects a tampered token', async () => {
    const token = await signAccessToken({ sid: 'user-1' })
    const tampered = token.slice(0, -5) + 'XXXXX'
    await expect(verifyToken(tampered)).rejects.toThrow()
  })

  it('rejects an expired token', async () => {
    // Sign with 0 second TTL
    const token = await signAccessToken({ sid: 'user-1' }, '0s')
    // Small delay to ensure expiration
    await new Promise((r) => setTimeout(r, 50))
    await expect(verifyToken(token)).rejects.toThrow()
  })
})

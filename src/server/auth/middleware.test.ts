import { Hono } from 'hono'
import { describe, expect, it, beforeEach } from 'vitest'
import { signAccessToken } from './jwt'
import { authMiddleware } from './middleware'
import { resetServerConfig } from '../config'

function createTestApp() {
  const app = new Hono()
  app.use('/api/*', authMiddleware)
  app.get('/api/protected', (c) => {
    const session = c.get('session')
    return c.json({ sid: session.sid })
  })
  app.get('/health', (c) => c.json({ ok: true }))
  return app
}

describe('authMiddleware', () => {
  beforeEach(() => {
    resetServerConfig()
  })

  it('allows requests with a valid token', async () => {
    const app = createTestApp()
    const token = await signAccessToken({ sid: 'user-1' })
    const res = await app.request('/api/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sid).toBe('user-1')
  })

  it('rejects requests without a token', async () => {
    const app = createTestApp()
    const res = await app.request('/api/protected')
    expect(res.status).toBe(401)
  })

  it('rejects requests with an invalid token', async () => {
    const app = createTestApp()
    const res = await app.request('/api/protected', {
      headers: { Authorization: 'Bearer invalid.token.here' },
    })
    expect(res.status).toBe(401)
  })

  it('does not affect non-api routes', async () => {
    const app = createTestApp()
    const res = await app.request('/health')
    expect(res.status).toBe(200)
  })
})

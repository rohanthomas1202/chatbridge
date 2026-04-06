import { Hono } from 'hono'
import { describe, expect, it, beforeEach } from 'vitest'
import { verifyToken } from '../auth/jwt'
import { resetServerConfig } from '../config'
import { createAuthRoutes } from './auth'

function createTestApp() {
  const app = new Hono()
  app.route('/auth', createAuthRoutes())
  return app
}

describe('auth routes', () => {
  beforeEach(() => {
    resetServerConfig()
  })

  describe('POST /auth/login', () => {
    it('returns access and refresh tokens for valid credentials', async () => {
      const app = createTestApp()
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin' }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.accessToken).toBeDefined()
      expect(body.refreshToken).toBeDefined()
      expect(body.expiresIn).toBeGreaterThan(0)

      // Verify the access token is valid
      const payload = await verifyToken(body.accessToken)
      expect(payload.sid).toBeDefined()
      expect(payload.type).toBe('access')
    })

    it('rejects empty credentials', async () => {
      const app = createTestApp()
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: '', password: '' }),
      })
      expect(res.status).toBe(400)
    })

    it('rejects missing body', async () => {
      const app = createTestApp()
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /auth/refresh', () => {
    it('returns new tokens given a valid refresh token', async () => {
      const app = createTestApp()

      // First login to get tokens
      const loginRes = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin' }),
      })
      const loginBody = await loginRes.json()

      // Now refresh
      const refreshRes = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: loginBody.refreshToken }),
      })
      expect(refreshRes.status).toBe(200)
      const refreshBody = await refreshRes.json()
      expect(refreshBody.accessToken).toBeDefined()
      expect(refreshBody.refreshToken).toBeDefined()
    })

    it('rejects an invalid refresh token', async () => {
      const app = createTestApp()
      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'bogus' }),
      })
      expect(res.status).toBe(401)
    })
  })
})

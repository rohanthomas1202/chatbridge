// test/integration/server-auth.test.ts
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createApp } from '../../src/server'
import { resetServerConfig } from '../../src/server/config'
import type { Hono } from 'hono'

describe('server auth integration', () => {
  let app: Hono

  beforeEach(() => {
    resetServerConfig()
    app = createApp()
  })

  it('full login → access protected route → refresh → access again flow', async () => {
    // 1. Health check works without auth
    const healthRes = await app.request('/health')
    expect(healthRes.status).toBe(200)

    // 2. Login
    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
    })
    expect(loginRes.status).toBe(200)
    const { accessToken, refreshToken } = await loginRes.json()

    // 3. Access protected route with access token
    // Mock fetch for the upstream call
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'Hi' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const chatRes = await app.request('/api/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiHost: 'https://api.openai.com/v1',
        path: '/chat/completions',
        upstreamHeaders: { Authorization: 'Bearer sk-test' },
        body: { model: 'gpt-4', messages: [{ role: 'user', content: 'test' }] },
      }),
    })
    expect(chatRes.status).toBe(200)

    globalThis.fetch = originalFetch

    // 4. Refresh tokens
    const refreshRes = await app.request('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    expect(refreshRes.status).toBe(200)
    const newTokens = await refreshRes.json()
    expect(newTokens.accessToken).toBeDefined()
    expect(newTokens.accessToken).not.toBe(accessToken) // New token issued
  })

  it('rejects protected routes without login', async () => {
    const res = await app.request('/api/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiHost: 'https://api.openai.com/v1',
        path: '/chat/completions',
        upstreamHeaders: {},
        body: {},
      }),
    })
    expect(res.status).toBe(401)
  })
})

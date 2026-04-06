import { Hono } from 'hono'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { signAccessToken } from '../auth/jwt'
import { authMiddleware } from '../auth/middleware'
import { resetServerConfig } from '../config'
import { createChatRoutes } from './chat'

// Mock global fetch to simulate upstream LLM responses
const originalFetch = globalThis.fetch

function createTestApp() {
  const app = new Hono()
  app.use('/api/*', authMiddleware)
  app.route('/api/chat', createChatRoutes())
  return app
}

describe('chat proxy routes', () => {
  beforeEach(() => {
    resetServerConfig()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('proxies a chat completion request to upstream', async () => {
    const upstreamResponse = {
      id: 'chatcmpl-123',
      choices: [{ message: { role: 'assistant', content: 'Hello!' } }],
    }

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(upstreamResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const app = createTestApp()
    const token = await signAccessToken({ sid: 'user-1' })

    const res = await app.request('/api/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiHost: 'https://api.openai.com/v1',
        path: '/chat/completions',
        upstreamHeaders: { Authorization: 'Bearer sk-test-key' },
        body: { model: 'gpt-4', messages: [{ role: 'user', content: 'Hi' }] },
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('chatcmpl-123')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
      })
    )
  })

  it('rejects requests without auth', async () => {
    const app = createTestApp()
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

  it('returns upstream error status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Rate limited' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const app = createTestApp()
    const token = await signAccessToken({ sid: 'user-1' })

    const res = await app.request('/api/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiHost: 'https://api.openai.com/v1',
        path: '/chat/completions',
        upstreamHeaders: {},
        body: { model: 'gpt-4', messages: [] },
      }),
    })

    expect(res.status).toBe(429)
  })

  it('rejects requests with missing required fields', async () => {
    const app = createTestApp()
    const token = await signAccessToken({ sid: 'user-1' })

    const res = await app.request('/api/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: {} }),
    })

    expect(res.status).toBe(400)
  })
})

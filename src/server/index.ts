// src/server/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authMiddleware } from './auth/middleware'
import { createAuthRoutes } from './routes/auth'
import { createChatRoutes } from './routes/chat'
import { getServerConfig } from './config'

export function createApp(): Hono {
  const app = new Hono()

  // Allow requests from the Electron renderer
  app.use('*', cors({ origin: '*' }))

  // Health check — no auth required
  app.get('/health', (c) => c.json({ ok: true }))

  // Auth routes — no auth required (this is where you GET auth)
  app.route('/auth', createAuthRoutes())

  // Protected API routes
  app.use('/api/*', authMiddleware)
  app.route('/api/chat', createChatRoutes())

  return app
}

export function getServerUrl(): string {
  const config = getServerConfig()
  return `http://127.0.0.1:${config.port}`
}

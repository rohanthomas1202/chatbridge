import type { Context, Next } from 'hono'
import { verifyToken } from './jwt'
import type { SessionPayload } from '../types'

// Extend Hono's context variables to include session
declare module 'hono' {
  interface ContextVariableMap {
    session: SessionPayload
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or malformed Authorization header' }, 401)
  }

  const token = authHeader.slice(7)
  try {
    const payload = await verifyToken(token)
    c.set('session', payload)
    await next()
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
}

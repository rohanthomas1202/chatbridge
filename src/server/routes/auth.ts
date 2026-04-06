import { Hono } from 'hono'
import { z } from 'zod'
import { signAccessToken, signRefreshToken, verifyToken } from '../auth/jwt'
import type { LoginResponse } from '../types'

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export function createAuthRoutes(): Hono {
  const auth = new Hono()

  auth.post('/login', async (c) => {
    const parseResult = loginSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parseResult.success) {
      return c.json({ error: 'username and password are required' }, 400)
    }

    const { username, password } = parseResult.data

    // TODO: Replace with real credential verification.
    // For now, accept any non-empty username/password and generate a session.
    // This is the placeholder where a real user store (DB, LDAP, OAuth) plugs in.
    const sid = `session-${username}-${Date.now()}`

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken({ sid, name: username }),
      signRefreshToken({ sid }),
    ])

    const response: LoginResponse = {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    }

    return c.json(response)
  })

  auth.post('/refresh', async (c) => {
    const parseResult = refreshSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parseResult.success) {
      return c.json({ error: 'refreshToken is required' }, 400)
    }

    try {
      const payload = await verifyToken(parseResult.data.refreshToken)
      if (payload.type !== 'refresh') {
        return c.json({ error: 'Invalid token type' }, 401)
      }

      const [accessToken, refreshToken] = await Promise.all([
        signAccessToken({ sid: payload.sid, name: payload.name }),
        signRefreshToken({ sid: payload.sid }),
      ])

      const response: LoginResponse = {
        accessToken,
        refreshToken,
        expiresIn: 900,
      }

      return c.json(response)
    } catch {
      return c.json({ error: 'Invalid or expired refresh token' }, 401)
    }
  })

  return auth
}

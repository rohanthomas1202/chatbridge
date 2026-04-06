# Session Auth Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight Hono backend with JWT session auth that wraps all LLM proxying, creating the foundation for platform identity and trust controls.

**Architecture:** A Hono HTTP server runs inside the Electron main process (or as a standalone Node process for web builds). The renderer sends all LLM requests to this local backend instead of directly to provider APIs. The backend validates a JWT session token on every `/api/*` route, holds provider API keys server-side, and proxies chat completions to upstream providers. The renderer authenticates via `/auth/login` (local credentials) and `/auth/refresh`, storing only the JWT — never raw API keys.

**Tech Stack:** Hono (HTTP framework), jose (JWT signing/verification — Web Crypto API, no native deps), zod (validation, already in project), vitest (testing, already in project)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/server/index.ts` | Hono app factory — composes routes, exports `createApp()` |
| Create | `src/server/auth/jwt.ts` | JWT sign/verify helpers using `jose` |
| Create | `src/server/auth/middleware.ts` | Hono middleware — validates `Authorization: Bearer <jwt>` on `/api/*` |
| Create | `src/server/routes/auth.ts` | `POST /auth/login`, `POST /auth/refresh` routes |
| Create | `src/server/routes/chat.ts` | `POST /api/chat/completions` — proxies to upstream LLM provider |
| Create | `src/server/types.ts` | Shared types: `JWTPayload`, `LoginRequest`, `LoginResponse` |
| Create | `src/server/config.ts` | Server config: port, JWT secret, token TTLs |
| Modify | `src/main/main.ts` | Start Hono server on app ready |
| Modify | `src/renderer/utils/request.ts` | Route LLM calls through local backend |
| Modify | `src/renderer/stores/authInfoStore.ts` | Store session JWT instead of provider API keys |
| Create | `src/server/auth/jwt.test.ts` | Tests for JWT sign/verify |
| Create | `src/server/auth/middleware.test.ts` | Tests for auth middleware |
| Create | `src/server/routes/auth.test.ts` | Tests for login/refresh routes |
| Create | `src/server/routes/chat.test.ts` | Tests for chat proxy route |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install hono and jose**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && pnpm add hono jose
```

- [ ] **Step 2: Verify installation**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && node -e "require('hono'); require('jose'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add hono and jose dependencies for session auth backend"
```

---

### Task 2: Server Types and Config

**Files:**
- Create: `src/server/types.ts`
- Create: `src/server/config.ts`

- [ ] **Step 1: Create server types**

```typescript
// src/server/types.ts
import type { JWTPayload as JoseJWTPayload } from 'jose'

export interface SessionPayload extends JoseJWTPayload {
  /** Unique user/session identifier */
  sid: string
  /** Display name (optional) */
  name?: string
}

export interface LoginRequest {
  /** Username or email */
  username: string
  /** Password */
  password: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface RefreshRequest {
  refreshToken: string
}

export interface ChatProxyRequest {
  /** Upstream provider API host (e.g. "https://api.openai.com/v1") */
  apiHost: string
  /** The path to append (e.g. "/chat/completions") */
  path: string
  /** Headers to forward to upstream (Authorization, etc.) */
  upstreamHeaders: Record<string, string>
  /** The request body to forward */
  body: unknown
}
```

- [ ] **Step 2: Create server config**

```typescript
// src/server/config.ts
import { randomBytes } from 'node:crypto'

export interface ServerConfig {
  port: number
  jwtSecret: string
  accessTokenTTL: string  // jose duration format e.g. "15m"
  refreshTokenTTL: string // e.g. "7d"
}

let cachedConfig: ServerConfig | null = null

export function getServerConfig(): ServerConfig {
  if (cachedConfig) return cachedConfig

  cachedConfig = {
    port: parseInt(process.env.CHATBRIDGE_SERVER_PORT || '19418', 10),
    jwtSecret: process.env.CHATBRIDGE_JWT_SECRET || randomBytes(32).toString('hex'),
    accessTokenTTL: '15m',
    refreshTokenTTL: '7d',
  }

  return cachedConfig
}

/** Reset config — for testing only */
export function resetServerConfig(): void {
  cachedConfig = null
}
```

- [ ] **Step 3: Verify types compile**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && npx tsc --noEmit src/server/types.ts src/server/config.ts --skipLibCheck --esModuleInterop --module nodenext --target es2021 --moduleResolution nodenext --strict
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/server/types.ts src/server/config.ts
git commit -m "feat(server): add types and config for session auth backend"
```

---

### Task 3: JWT Sign/Verify Helpers

**Files:**
- Create: `src/server/auth/jwt.ts`
- Create: `src/server/auth/jwt.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/auth/jwt.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && pnpm vitest run src/server/auth/jwt.test.ts
```

Expected: FAIL — module `./jwt` not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/server/auth/jwt.ts
import { SignJWT, jwtVerify } from 'jose'
import { getServerConfig } from '../config'
import type { SessionPayload } from '../types'

function getSecret(): Uint8Array {
  return new TextEncoder().encode(getServerConfig().jwtSecret)
}

export async function signAccessToken(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
  ttlOverride?: string
): Promise<string> {
  const config = getServerConfig()
  return new SignJWT({ ...payload, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ttlOverride ?? config.accessTokenTTL)
    .sign(getSecret())
}

export async function signRefreshToken(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
  ttlOverride?: string
): Promise<string> {
  const config = getServerConfig()
  return new SignJWT({ ...payload, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ttlOverride ?? config.refreshTokenTTL)
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getSecret())
  return payload as SessionPayload
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && pnpm vitest run src/server/auth/jwt.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/jwt.ts src/server/auth/jwt.test.ts
git commit -m "feat(server): add JWT sign/verify helpers with jose"
```

---

### Task 4: Auth Middleware

**Files:**
- Create: `src/server/auth/middleware.ts`
- Create: `src/server/auth/middleware.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/auth/middleware.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && pnpm vitest run src/server/auth/middleware.test.ts
```

Expected: FAIL — module `./middleware` not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/server/auth/middleware.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && pnpm vitest run src/server/auth/middleware.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/middleware.ts src/server/auth/middleware.test.ts
git commit -m "feat(server): add JWT auth middleware for /api/* routes"
```

---

### Task 5: Auth Routes (Login & Refresh)

**Files:**
- Create: `src/server/routes/auth.ts`
- Create: `src/server/routes/auth.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/routes/auth.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && pnpm vitest run src/server/routes/auth.test.ts
```

Expected: FAIL — module `./auth` not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/server/routes/auth.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && pnpm vitest run src/server/routes/auth.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/auth.ts src/server/routes/auth.test.ts
git commit -m "feat(server): add login and refresh auth routes"
```

---

### Task 6: Chat Proxy Route

**Files:**
- Create: `src/server/routes/chat.ts`
- Create: `src/server/routes/chat.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/routes/chat.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && pnpm vitest run src/server/routes/chat.test.ts
```

Expected: FAIL — module `./chat` not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/server/routes/chat.ts
import { Hono } from 'hono'
import { z } from 'zod'

const chatProxySchema = z.object({
  apiHost: z.string().url(),
  path: z.string().startsWith('/'),
  upstreamHeaders: z.record(z.string()).default({}),
  body: z.unknown(),
})

export function createChatRoutes(): Hono {
  const chat = new Hono()

  chat.post('/completions', async (c) => {
    const parseResult = chatProxySchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parseResult.success) {
      return c.json({ error: 'Invalid request', details: parseResult.error.issues }, 400)
    }

    const { apiHost, path, upstreamHeaders, body } = parseResult.data
    const upstreamUrl = `${apiHost}${path}`

    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...upstreamHeaders,
      },
      body: JSON.stringify(body),
    })

    // Stream the response back with the same status and content-type
    const contentType = upstreamRes.headers.get('Content-Type') || 'application/json'

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: { 'Content-Type': contentType },
    })
  })

  return chat
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && pnpm vitest run src/server/routes/chat.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/chat.ts src/server/routes/chat.test.ts
git commit -m "feat(server): add authenticated chat proxy route"
```

---

### Task 7: Hono App Factory

**Files:**
- Create: `src/server/index.ts`

- [ ] **Step 1: Write the app factory**

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && npx tsc --noEmit src/server/index.ts --skipLibCheck --esModuleInterop --module nodenext --target es2021 --moduleResolution nodenext --strict
```

Expected: no errors (or only path-alias warnings which are expected outside the full build)

- [ ] **Step 3: Run all server tests to confirm nothing broke**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && pnpm vitest run src/server/
```

Expected: All tests pass (jwt: 4, middleware: 4, auth routes: 5, chat routes: 4 = 17 total)

- [ ] **Step 4: Commit**

```bash
git add src/server/index.ts
git commit -m "feat(server): add Hono app factory composing auth and chat routes"
```

---

### Task 8: Integrate Server into Electron Main Process

**Files:**
- Modify: `src/main/main.ts`

- [ ] **Step 1: Add server startup to main.ts**

Add the import at the top of `src/main/main.ts`, after the existing imports:

```typescript
import { serve } from '@hono/node-server'
import { createApp, getServerUrl } from '../server'
```

- [ ] **Step 2: Install @hono/node-server adapter**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && pnpm add @hono/node-server
```

- [ ] **Step 3: Start the server in the whenReady block**

In the `app.whenReady().then(async () => { ... })` block in `src/main/main.ts`, add server startup right before `await createWindow()`. Find this section (around line 432):

```typescript
// Existing code:
//   await knowledgeBaseInitPromise
//   await createWindow()

// Change to:
//   await knowledgeBaseInitPromise
//
//   // Start the auth backend server
//   const honoApp = createApp()
//   const config = (await import('../server/config')).getServerConfig()
//   serve({ fetch: honoApp.fetch, port: config.port })
//   log.info(`Auth backend started on http://127.0.0.1:${config.port}`)
//
//   await createWindow()
```

- [ ] **Step 4: Verify the app still builds**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && pnpm run build
```

Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/main/main.ts package.json pnpm-lock.yaml
git commit -m "feat(server): start Hono auth backend in Electron main process"
```

---

### Task 9: Wire Renderer to Use Local Backend

**Files:**
- Modify: `src/renderer/utils/request.ts`
- Modify: `src/renderer/stores/authInfoStore.ts`

- [ ] **Step 1: Add server URL helper to request utils**

Add at the top of `src/renderer/utils/request.ts`:

```typescript
function getLocalServerUrl(): string {
  return process.env.CHATBRIDGE_SERVER_URL || 'http://127.0.0.1:19418'
}
```

- [ ] **Step 2: Add a `proxiedApiRequest` function to `src/renderer/utils/request.ts`**

Add this after the existing `apiRequest` export:

```typescript
/**
 * Send an LLM API request through the local auth backend.
 * Falls back to direct request if no session token is available.
 */
export const proxiedApiRequest = {
  async post(
    url: string,
    headers: Record<string, string>,
    body: RequestInit['body'],
    options?: Partial<RequestOptions>
  ) {
    const sessionToken = authInfoStore.getState().accessToken
    if (!sessionToken) {
      // No session — fall back to direct request
      return apiRequest.post(url, headers, body, options)
    }

    const serverUrl = getLocalServerUrl()
    const parsedUrl = new URL(url)
    const apiHost = parsedUrl.origin
    const path = parsedUrl.pathname

    return doRequest(`${serverUrl}/api/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        apiHost,
        path,
        upstreamHeaders: headers,
        body: typeof body === 'string' ? JSON.parse(body) : body,
      }),
      signal: options?.signal,
      retry: options?.retry ?? 3,
    })
  },
}
```

- [ ] **Step 3: Add the authInfoStore import at the top of `src/renderer/utils/request.ts`**

```typescript
import { authInfoStore } from '@/stores/authInfoStore'
```

- [ ] **Step 4: Add session login/refresh methods to authInfoStore**

In `src/renderer/stores/authInfoStore.ts`, add a `login` and `refresh` action to the store interface and implementation. Add these to the `AuthTokensActions` interface:

```typescript
login: (username: string, password: string) => Promise<void>
refresh: () => Promise<void>
```

And implement them in the `immer((set, get) => ({...}))` block:

```typescript
login: async (username: string, password: string) => {
  const serverUrl = process.env.CHATBRIDGE_SERVER_URL || 'http://127.0.0.1:19418'
  const res = await fetch(`${serverUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error('Login failed')
  const data = await res.json()
  set((state) => {
    state.accessToken = data.accessToken
    state.refreshToken = data.refreshToken
  })
},

refresh: async () => {
  const refreshToken = get().refreshToken
  if (!refreshToken) throw new Error('No refresh token')
  const serverUrl = process.env.CHATBRIDGE_SERVER_URL || 'http://127.0.0.1:19418'
  const res = await fetch(`${serverUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
  if (!res.ok) {
    set((state) => {
      state.accessToken = null
      state.refreshToken = null
    })
    throw new Error('Refresh failed')
  }
  const data = await res.json()
  set((state) => {
    state.accessToken = data.accessToken
    state.refreshToken = data.refreshToken
  })
},
```

- [ ] **Step 5: Run existing tests to verify nothing is broken**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && pnpm vitest run src/server/ && pnpm vitest run src/renderer/stores/
```

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/renderer/utils/request.ts src/renderer/stores/authInfoStore.ts
git commit -m "feat(renderer): wire LLM requests through local auth backend"
```

---

### Task 10: End-to-End Integration Smoke Test

**Files:**
- Create: `test/integration/server-auth.test.ts`

- [ ] **Step 1: Write the integration test**

```typescript
// test/integration/server-auth.test.ts
import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from 'vitest'
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
```

- [ ] **Step 2: Run the integration test**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && pnpm vitest run test/integration/server-auth.test.ts
```

Expected: 2 tests PASS

- [ ] **Step 3: Run ALL tests to confirm nothing is broken**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge && pnpm vitest run src/server/ && pnpm vitest run test/integration/server-auth.test.ts
```

Expected: All 19 tests pass (17 unit + 2 integration)

- [ ] **Step 4: Commit**

```bash
git add test/integration/server-auth.test.ts
git commit -m "test: add end-to-end integration test for server auth flow"
```

import { Hono } from 'hono'
import { z } from 'zod'

const BLOCKED_HOST_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^localhost$/i,
]

function isBlockedHost(hostname: string): boolean {
  return BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
}

const chatProxySchema = z.object({
  apiHost: z.string().url(),
  path: z.string().refine((v) => v.startsWith('/'), { message: 'path must start with /' }),
  upstreamHeaders: z.record(z.string(), z.string()).default({}),
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

    // SSRF protection: block requests to private/internal networks
    const hostname = new URL(apiHost).hostname
    if (isBlockedHost(hostname)) {
      return c.json({ error: 'Upstream host is not allowed' }, 403)
    }

    const upstreamUrl = `${apiHost}${path}`

    let upstreamRes: Response
    try {
      upstreamRes = await globalThis.fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...upstreamHeaders,
        },
        body: JSON.stringify(body),
      })
    } catch (err) {
      return c.json({ error: 'Upstream request failed', message: (err as Error).message }, 502)
    }

    // Stream the response back with the same status and content-type
    const contentType = upstreamRes.headers.get('Content-Type') || 'application/json'

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: { 'Content-Type': contentType },
    })
  })

  return chat
}

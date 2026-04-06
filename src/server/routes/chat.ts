import { Hono } from 'hono'
import { z } from 'zod'

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
    const upstreamUrl = `${apiHost}${path}`

    const upstreamRes = await globalThis.fetch(upstreamUrl, {
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

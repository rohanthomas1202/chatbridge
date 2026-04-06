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

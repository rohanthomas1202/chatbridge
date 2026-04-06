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

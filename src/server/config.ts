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

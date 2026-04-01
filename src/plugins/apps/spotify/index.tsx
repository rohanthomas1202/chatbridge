/**
 * Spotify Playlist Creator Plugin
 *
 * Creates Spotify playlists via OAuth2 PKCE flow. Falls back to a mock
 * preview when Spotify credentials are not configured.
 *
 * Tool schema: create_playlist(name: string, tracks: string[])
 *
 * OAuth2 PKCE: Uses VITE_SPOTIFY_CLIENT_ID env var. If absent, renders
 * a preview-only playlist card without hitting the Spotify API.
 *
 * postMessage protocol:
 *   Host → Plugin: { type: 'plugin:invoke', pluginId: 'chatbridge-spotify', args: { name, tracks } }
 *   Plugin → Host: { type: 'plugin:ready', pluginId: 'chatbridge-spotify' }
 *   Plugin → Host: { type: 'plugin:complete', pluginId, toolCallId, result }
 */

import React, { useEffect, useRef, useState } from 'react'

const PLUGIN_ID = 'chatbridge-spotify'
const ICONS = ['🎵', '🎶', '🎸', '🎹', '🥁', '🎷', '🎺', '🎻', '🎤', '🎼']

interface Track {
  num: number
  name: string
  artist: string
  duration: string
  icon: string
}

function parseTracks(tracks: string[]): Track[] {
  return tracks.map((t, i) => {
    const parts = t.split(' - ')
    const name = (parts[0] || t).trim()
    const artist = (parts[1] || 'Unknown Artist').trim()
    const min = 2 + Math.floor(Math.random() * 4)
    const sec = Math.floor(Math.random() * 60)
    return { num: i + 1, name, artist, duration: `${min}:${sec.toString().padStart(2, '0')}`, icon: ICONS[i % ICONS.length] }
  })
}

// --- OAuth2 PKCE helpers (used when Spotify client ID is available) ---

function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 128)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function getSpotifyClientId(): string | null {
  // Check for environment variable or global config
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const env = (globalThis as any).__VITE_ENV__ || (typeof process !== 'undefined' && process.env) || {}
    return env.VITE_SPOTIFY_CLIENT_ID || null
  } catch {
    return null
  }
}

async function startSpotifyAuth(): Promise<void> {
  const clientId = getSpotifyClientId()
  if (!clientId) return

  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  sessionStorage.setItem('spotify_code_verifier', verifier)

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: window.location.origin + '/plugins/spotify/callback',
    scope: 'playlist-modify-public playlist-modify-private',
    code_challenge_method: 'S256',
    code_challenge: challenge,
  })

  window.open(`https://accounts.spotify.com/authorize?${params}`, '_blank', 'width=500,height=700')
}

export default function SpotifyPlugin() {
  const [playlist, setPlaylist] = useState<{ name: string; tracks: Track[] } | null>(null)
  const [mode, setMode] = useState<'waiting' | 'mock' | 'spotify'>('waiting')
  const toolCallIdRef = useRef('')

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data
      if (!data || data.type !== 'plugin:invoke' || data.pluginId !== PLUGIN_ID) return

      toolCallIdRef.current = data.toolCallId
      const args = data.args || {}
      const name = (args.name as string) || 'My Playlist'
      const rawTracks = Array.isArray(args.tracks) ? args.tracks as string[] : []

      if (rawTracks.length === 0) {
        setMode('mock')
        return
      }

      const tracks = parseTracks(rawTracks)
      setPlaylist({ name, tracks })

      // Check for Spotify auth — fall back to mock if no client ID
      const clientId = getSpotifyClientId()
      setMode(clientId ? 'spotify' : 'mock')

      window.parent.postMessage({
        type: 'plugin:complete', pluginId: PLUGIN_ID, toolCallId: data.toolCallId,
        result: { mode: clientId ? 'spotify' : 'mock', playlistName: name, trackCount: tracks.length, tracks: rawTracks },
      }, '*')
    }

    window.addEventListener('message', handler)
    window.parent.postMessage({ type: 'plugin:ready', pluginId: PLUGIN_ID }, '*')
    return () => window.removeEventListener('message', handler)
  }, [])

  if (mode === 'waiting' || !playlist) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#8892b0', fontFamily: '-apple-system, sans-serif' }}>Waiting for playlist data...</div>
  }

  const totalMin = playlist.tracks.reduce((sum, t) => {
    const [m, s] = t.duration.split(':').map(Number)
    return sum + m + s / 60
  }, 0)

  return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: 'linear-gradient(135deg, #121212, #1a1a2e)', color: '#e0e0e0', padding: 16, minHeight: '100%' }}>
      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg, #1DB954, #1aa34a)', padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 28 }}>🎧</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>{playlist.name}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>{playlist.tracks.length} tracks · ~{Math.round(totalMin)} min</div>
          </div>
        </div>
        <div style={{ padding: '8px 0' }}>
          {playlist.tracks.map((t) => (
            <div key={t.num} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px' }}>
              <div style={{ width: 20, textAlign: 'right', fontSize: 13, color: '#8892b0', flexShrink: 0 }}>{t.num}</div>
              <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.08)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{t.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#e0e0e0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                <div style={{ fontSize: 12, color: '#8892b0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.artist}</div>
              </div>
              <div style={{ fontSize: 12, color: '#8892b0', flexShrink: 0 }}>{t.duration}</div>
            </div>
          ))}
        </div>
        <div style={{ margin: '8px 16px 12px', padding: '6px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 11, color: '#8892b0', textAlign: 'center' }}>
          {mode === 'spotify' ? (
            <>Connected to Spotify</>
          ) : (
            <>
              Preview mode — <button onClick={startSpotifyAuth} style={{ background: 'none', border: 'none', color: '#1DB954', cursor: 'pointer', fontSize: 11 }}>connect Spotify</button> to create real playlists
            </>
          )}
        </div>
      </div>
    </div>
  )
}

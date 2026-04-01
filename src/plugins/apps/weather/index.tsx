/**
 * Weather Plugin — Shows current weather and 3-day forecast.
 *
 * Uses the free Open-Meteo API (no API key required).
 * Tool schema: show_weather(location: string)
 *
 * postMessage protocol:
 *   Host → Plugin: { type: 'plugin:invoke', pluginId: 'chatbridge-weather', args: { location } }
 *   Plugin → Host: { type: 'plugin:ready', pluginId: 'chatbridge-weather' }
 *   Plugin → Host: { type: 'plugin:complete', pluginId, toolCallId, result }
 *   Plugin → Host: { type: 'plugin:error', pluginId, toolCallId, error }
 */

import React, { useEffect, useRef, useState } from 'react'

const PLUGIN_ID = 'chatbridge-weather'

const WMO_CODES: Record<number, { desc: string; icon: string }> = {
  0: { desc: 'Clear sky', icon: '☀️' },
  1: { desc: 'Mainly clear', icon: '🌤️' },
  2: { desc: 'Partly cloudy', icon: '⛅' },
  3: { desc: 'Overcast', icon: '☁️' },
  45: { desc: 'Foggy', icon: '🌫️' },
  48: { desc: 'Rime fog', icon: '🌫️' },
  51: { desc: 'Light drizzle', icon: '🌦️' },
  53: { desc: 'Moderate drizzle', icon: '🌦️' },
  55: { desc: 'Dense drizzle', icon: '🌧️' },
  61: { desc: 'Slight rain', icon: '🌦️' },
  63: { desc: 'Moderate rain', icon: '🌧️' },
  65: { desc: 'Heavy rain', icon: '🌧️' },
  71: { desc: 'Slight snow', icon: '🌨️' },
  73: { desc: 'Moderate snow', icon: '❄️' },
  75: { desc: 'Heavy snow', icon: '❄️' },
  80: { desc: 'Rain showers', icon: '🌦️' },
  81: { desc: 'Moderate showers', icon: '🌧️' },
  82: { desc: 'Violent showers', icon: '⛈️' },
  95: { desc: 'Thunderstorm', icon: '⛈️' },
  96: { desc: 'Thunderstorm w/ hail', icon: '⛈️' },
  99: { desc: 'Thunderstorm w/ heavy hail', icon: '⛈️' },
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getWeatherInfo(code: number) {
  return WMO_CODES[code] || { desc: 'Unknown', icon: '🌡️' }
}

interface GeoResult {
  name: string
  country?: string
  latitude: number
  longitude: number
}

interface WeatherData {
  current: { temperature_2m: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number }
  daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[] }
}

async function geocode(location: string): Promise<GeoResult> {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en`)
  const data = await res.json()
  if (!data.results || data.results.length === 0) throw new Error('Location not found')
  return data.results[0]
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3`)
  return res.json()
}

export default function WeatherPlugin() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [location, setLocation] = useState('Waiting for location...')
  const [error, setError] = useState('')
  const [geo, setGeo] = useState<GeoResult | null>(null)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const toolCallIdRef = useRef('')

  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      const data = event.data
      if (!data || data.type !== 'plugin:invoke' || data.pluginId !== PLUGIN_ID) return

      toolCallIdRef.current = data.toolCallId
      const loc = data.args?.location || 'London'
      setLocation(loc)
      setState('loading')

      try {
        const g = await geocode(loc)
        const w = await fetchWeather(g.latitude, g.longitude)
        setGeo(g)
        setWeather(w)
        setState('ready')

        const info = getWeatherInfo(w.current.weather_code)
        window.parent.postMessage({
          type: 'plugin:complete', pluginId: PLUGIN_ID, toolCallId: data.toolCallId,
          result: { location: g.name, country: g.country, temperature: w.current.temperature_2m, conditions: info.desc, humidity: w.current.relative_humidity_2m, wind: w.current.wind_speed_10m },
        }, '*')
      } catch (err: any) {
        setError(err.message)
        setState('error')
        window.parent.postMessage({ type: 'plugin:error', pluginId: PLUGIN_ID, toolCallId: data.toolCallId, error: err.message }, '*')
      }
    }

    window.addEventListener('message', handler)
    window.parent.postMessage({ type: 'plugin:ready', pluginId: PLUGIN_ID }, '*')
    return () => window.removeEventListener('message', handler)
  }, [])

  if (state === 'loading') {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8892b0', fontFamily: '-apple-system, sans-serif' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #4a4a6a', borderTopColor: '#64ffda', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <div>Loading weather for {location}...</div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#ff6b6b', fontFamily: '-apple-system, sans-serif' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
        <div>Could not load weather for &quot;{location}&quot;</div>
        <div style={{ fontSize: 12, marginTop: 4, color: '#8892b0' }}>{error}</div>
      </div>
    )
  }

  if (!weather || !geo) return null

  const current = weather.current
  const daily = weather.daily
  const info = getWeatherInfo(current.weather_code)

  return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: 'linear-gradient(135deg, #1a1a2e, #16213e)', color: '#e0e0e0', padding: 16, minHeight: '100%' }}>
      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#ccd6f6' }}>{geo.name}{geo.country ? `, ${geo.country}` : ''}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '12px 0' }}>
          <div style={{ fontSize: 48 }}>{info.icon}</div>
          <div style={{ fontSize: 48, fontWeight: 300, color: '#64ffda', lineHeight: 1 }}>{Math.round(current.temperature_2m)}°C</div>
          <div style={{ fontSize: 14, color: '#a8b2d1', lineHeight: 1.5 }}>
            <span style={{ display: 'block' }}>{info.desc}</span>
            <span style={{ display: 'block' }}>Humidity: {current.relative_humidity_2m}%</span>
            <span style={{ display: 'block' }}>Wind: {current.wind_speed_10m} km/h</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
          {daily.time.map((t, i) => {
            const d = new Date(t)
            const dayInfo = getWeatherInfo(daily.weather_code[i])
            return (
              <div key={t} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 10, textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 12, color: '#8892b0', fontWeight: 600 }}>{i === 0 ? 'Today' : DAYS[d.getDay()]}</div>
                <div style={{ fontSize: 24, margin: '4px 0' }}>{dayInfo.icon}</div>
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: '#e0e0e0', fontWeight: 600 }}>{Math.round(daily.temperature_2m_max[i])}°</span>{' '}
                  <span style={{ color: '#8892b0' }}>{Math.round(daily.temperature_2m_min[i])}°</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 10, color: '#4a4a6a', marginTop: 10 }}>Powered by Open-Meteo API</div>
    </div>
  )
}

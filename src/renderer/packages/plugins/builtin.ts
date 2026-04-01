/**
 * Built-in plugin definitions for ChatBridge.
 * These are registered at startup.
 */

import type { PluginDefinition } from '@shared/types/plugin'

export const chessPlugin: PluginDefinition = {
  id: 'chatbridge-chess',
  name: 'Chess',
  description: 'Interactive chess board – the AI can suggest moves and play games',
  version: '1.0.0',
  iframeUrl: '/plugins/chess/index.html',
  icon: '♟',
  defaultWidth: 500,
  defaultHeight: 520,
  toolSchema: {
    name: 'suggest_chess_move',
    description:
      'Suggest the next chess move given the current board position in FEN notation. Returns the suggested move and renders an interactive chess board.',
    parameters: {
      type: 'object',
      properties: {
        position: {
          type: 'string',
          description:
            'The current board position in FEN notation. Use "startpos" for the starting position.',
        },
        suggested_move: {
          type: 'string',
          description:
            'The suggested move in UCI notation (e.g., "e2e4", "g1f3"). Include this when recommending a specific move.',
        },
        explanation: {
          type: 'string',
          description: 'Brief explanation of why this move is recommended.',
        },
      },
      required: ['position'],
    },
  },
}

export const weatherPlugin: PluginDefinition = {
  id: 'chatbridge-weather',
  name: 'Weather',
  description: 'Shows current weather and forecast for any location',
  version: '1.0.0',
  iframeUrl: '/plugins/weather/index.html',
  icon: '🌤',
  defaultWidth: 480,
  defaultHeight: 380,
  toolSchema: {
    name: 'show_weather',
    description:
      'Display current weather conditions and a 3-day forecast for a given location. Uses the free Open-Meteo API.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city or location name to show weather for (e.g. "London", "Tokyo, Japan").',
        },
      },
      required: ['location'],
    },
  },
}

export const spotifyPlugin: PluginDefinition = {
  id: 'chatbridge-spotify',
  name: 'Spotify Playlist Creator',
  description: 'Create Spotify playlists from the chat',
  version: '1.0.0',
  iframeUrl: '/plugins/spotify/index.html',
  icon: '🎵',
  defaultWidth: 500,
  defaultHeight: 450,
  toolSchema: {
    name: 'create_playlist',
    description:
      'Create a Spotify playlist with the given name and track list. If Spotify OAuth is not configured, shows a mock preview of the playlist.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name for the new playlist.',
        },
        tracks: {
          type: 'array',
          description:
            'Array of track search queries (e.g. ["Bohemian Rhapsody - Queen", "Imagine - John Lennon"]).',
        },
      },
      required: ['name', 'tracks'],
    },
  },
}

export const builtinPlugins: PluginDefinition[] = [chessPlugin, weatherPlugin, spotifyPlugin]

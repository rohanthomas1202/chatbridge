# ChatBridge

An AI chat platform with third-party app integration, built on top of [Chatbox](https://github.com/chatboxai/chatbox).

ChatBridge extends Chatbox with a plugin system that lets third-party apps live inside the chat experience. Students can play chess, check weather, or create Spotify playlists — all without leaving the conversation. The chatbot stays aware of what's happening inside each app and responds accordingly.

## Architecture

```
User message → AI model receives tool schemas → AI calls tool →
Tool returns plugin metadata → PluginIframeUI renders sandboxed iframe →
Iframe communicates via postMessage protocol (ready → invoke → state → complete)
```

**Key design decisions:**
- **Iframe sandboxing** for security isolation — plugins can't access the parent DOM or other plugins
- **Vercel AI SDK tool integration** — plugins register as AI-callable tools via Zod schema generation
- **PostMessage protocol** — structured lifecycle (ready/invoke/state/complete/error) for reliable communication
- **JWT session auth backend** — Hono server with SSRF protection wrapping all LLM proxying

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Mantine UI, Zustand |
| AI Integration | Vercel AI SDK with function calling |
| App Sandboxing | Iframes with postMessage |
| Auth Backend | Hono + jose (JWT) |
| Deployment | Vercel (static SPA) |
| Testing | Vitest |

## Plugins

### Chess (required)
- Interactive board with legal move validation
- Stockfish WASM AI opponent (4 difficulty levels)
- Bidirectional chat: user asks "what should I do here?" mid-game, AI analyzes the board
- Auth: None (internal app)

### Weather
- Current conditions + 3-day forecast via Open-Meteo API
- Geocoding for location resolution
- Auth: None (free public API)

### Spotify
- OAuth2 PKCE authentication flow
- Playlist creation with track metadata display
- Graceful fallback to preview mode without credentials
- Auth: OAuth2 (external authenticated)

## Setup

### Prerequisites
- Node.js >= 20
- pnpm >= 10.17

### Development

```bash
# Install dependencies
pnpm install

# Run Electron app (desktop)
pnpm dev

# Run web-only dev server
pnpm dev:web
```

### Web Build & Deploy

```bash
# Build for web
pnpm run build:web

# Deploy to Vercel
vercel --prod

# Or serve locally
npx serve release/app/dist/renderer
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SPOTIFY_CLIENT_ID` | No | Spotify app client ID for OAuth2 flow |
| `CHATBRIDGE_SERVER_PORT` | No | Auth backend port (default: 19418) |
| `CHATBRIDGE_JWT_SECRET` | No | JWT signing secret (auto-generated if not set) |

## Testing

```bash
# Run all tests
pnpm test

# Run server auth tests only
pnpm vitest run src/server/

# Run chess plugin tests
pnpm vitest run test/cases/chess-plugin/

# Run integration tests
pnpm test:integration
```

## Project Structure

```
src/
├── main/                  # Electron main process
├── server/                # Hono auth backend (JWT, chat proxy)
│   ├── auth/              # JWT helpers + middleware
│   └── routes/            # Login, refresh, chat proxy
├── renderer/              # React frontend
│   ├── packages/plugins/  # Plugin registry + tool generation
│   └── components/        # UI including PluginIframeUI
├── shared/                # Shared types and utilities
│   └── types/plugin.ts    # Plugin type definitions
└── plugins/               # Plugin source (React reference implementations)
    └── apps/              # Chess, Weather, Spotify

public/plugins/            # Standalone HTML plugin builds
├── chess/                 # Chess with Stockfish WASM
├── weather/               # Weather with Open-Meteo
└── spotify/               # Spotify with OAuth2 PKCE

test/
├── cases/                 # Unit tests (chess logic)
└── integration/           # Server auth integration tests
```

## Documentation

- [Pre-Search Document](./PRE_SEARCH.md) — Case study analysis and architectural decisions
- [Cost Analysis](./COST_ANALYSIS.md) — API costs, infrastructure, projections
- [Plugin Developer Guide](./docs/plugin-developer-guide.md) — How to build a third-party plugin
- [Error Handling](./ERROR_HANDLING.md) — Error boundary and recovery architecture

## License

GPLv3 — see [LICENSE](./LICENSE)

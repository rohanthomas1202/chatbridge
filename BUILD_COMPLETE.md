# ChatBridge Build — Complete

## What was built

ChatBridge extends the Chatbox AI chat app with a web-deployable plugin system that embeds interactive apps inline in AI conversations.

### Plugin System Architecture

```
User sends message → AI model receives tool schemas → AI calls tool →
Tool returns plugin result → PluginIframeUI renders iframe →
iframe communicates via postMessage
```

**Core files:**

| File | Purpose |
|------|---------|
| `src/shared/types/plugin.ts` | TypeScript interfaces: PluginDefinition, PluginToolSchema, postMessage types |
| `src/renderer/packages/plugins/registry.ts` | Plugin registration, Zod schema conversion, AI SDK tool generation |
| `src/renderer/packages/plugins/builtin.ts` | Three built-in plugin definitions (chess, weather, spotify) |
| `src/renderer/packages/plugins/index.ts` | Plugin system entry point and initialization |
| `src/renderer/components/message-parts/PluginIframeUI.tsx` | Iframe renderer with postMessage protocol |
| `src/plugins/types.ts` | Public type re-exports |
| `src/plugins/registry.ts` | Public API re-exports |

### Three Plugin Apps

**Chess** (`src/plugins/apps/chess/index.tsx` + `public/plugins/chess/index.html`)
- Interactive chess board with piece selection and move execution
- AI suggests moves in UCI notation, highlighted on the board
- Tool: `suggest_chess_move(position: FEN, suggested_move?: UCI, explanation?: string)`

**Weather** (`src/plugins/apps/weather/index.tsx` + `public/plugins/weather/index.html`)
- Current conditions + 3-day forecast using Open-Meteo API (free, no key)
- Geocoding to resolve city names to coordinates
- Tool: `show_weather(location: string)`

**Spotify** (`src/plugins/apps/spotify/index.tsx` + `public/plugins/spotify/index.html`)
- Playlist preview with track list, durations, icons
- OAuth2 PKCE flow ready (needs `VITE_SPOTIFY_CLIENT_ID`)
- Graceful fallback to mock preview when not configured
- Tool: `create_playlist(name: string, tracks: string[])`

### Chat Integration

Modified files to inject plugins into the AI pipeline:
- `src/renderer/packages/model-calls/stream-text.ts` — calls `initPlugins()` and merges `getPluginToolSet()` into the tool set
- `src/renderer/packages/tools/index.ts` — added tool display names
- `src/renderer/components/message-parts/ToolCallPartUI.tsx` — routes plugin results to PluginIframeUI

### Build Configuration

- `vite.web.config.ts` — standalone web build (no Electron main/preload)
- `package.json` — `build:web` script uses vite directly with 4GB heap
- `vercel.json` — SPA rewrites, plugin caching headers
- `.env.example` — documented environment variables

### Documentation

- `COST_ANALYSIS.md` — API cost estimates, infrastructure costs, optimization tips

## How to build

```bash
pnpm install
pnpm run build:web
```

Requires Node 20+ and ~4GB RAM for the production build.

## How to deploy

```bash
# Vercel
vercel --prod

# Or serve the static output
npx serve release/app/dist/renderer
```

## Plugin TypeScript status

All plugin-related code passes TypeScript checking with zero errors. The 245 pre-existing errors in the Chatbox base codebase are unrelated to the plugin system (provider definitions, router types, etc.).

## How to add a new plugin

1. Define a `PluginDefinition` in `src/renderer/packages/plugins/builtin.ts`
2. Create an HTML file in `public/plugins/<name>/index.html`
3. Implement the postMessage protocol: listen for `plugin:invoke`, post `plugin:ready` and `plugin:complete`
4. The plugin iframe renders automatically when the AI calls the matching tool

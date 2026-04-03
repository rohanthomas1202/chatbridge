# ChatBridge Pre-Search Document

## Case Study Analysis

TutorMeAI serves over 200,000 students and teachers across 10,000 school districts, and their next competitive move is to let third-party applications live inside the chat experience. On the surface this sounds like a feature request — embed some apps, let teachers pick which ones to enable, move on. But underneath it sits a set of genuinely hard problems that forced us to make deliberate trade-offs between openness and control, speed and safety, flexibility and predictability.

The central tension is trust. TutorMeAI's users are children. Every technical decision about how third-party code enters the platform carries an ethical dimension that most app-integration projects never have to consider. A malicious or poorly written app could expose student data, display harmful content, or simply break the learning experience in ways a child cannot diagnose. We chose iframe-based sandboxing as our isolation boundary — not because it is the most powerful option, but because it is the most honest one. Iframes enforce a real process-level boundary between the host and the third-party code. The app cannot touch the parent DOM, cannot read chat history, and cannot access other apps' state. We restrict the sandbox to `allow-scripts allow-same-origin allow-popups allow-forms` — enough for rich interactivity, but no access to top-level navigation or arbitrary code execution in the host context. We considered Web Components and server-side rendering as alternatives, but Web Components share the same JavaScript execution context as the host (one prototype pollution away from a full compromise), and server-side rendering introduces latency and cost that scale poorly for interactive apps like chess boards or physics simulators. The trade-off is clear: iframes add complexity to communication, but they provide a security boundary that is structurally enforceable rather than policy-dependent.

The second hard problem is communication. The chatbot must know what tools an app provides, invoke them at the right time, render the app's response, and understand when the app is done — all without prior knowledge of what any given third-party will build. We designed a postMessage-based protocol with four lifecycle events: `ready`, `invoke`, `state`, and `complete`. This creates a clean contract — the platform never reaches into the app, and the app never reaches into the platform. State updates flow through narrow, typed channels. We chose this over WebSocket-based communication because postMessage is synchronous to the browser's event loop, requires no server infrastructure, and works identically in development and production. The cost is that postMessage is origin-scoped and untyped at the transport layer, so we enforce structure through TypeScript interfaces on both sides.

The ethical decision we wrestled with most was how much control to give teachers versus how much to enforce at the platform level. We landed on a two-layer model: the platform enforces structural safety (sandboxing, protocol compliance, timeout enforcement), while teachers control policy (which apps are available, which students can access them). This means a teacher cannot accidentally enable an app that bypasses the sandbox, but they can choose to enable or disable any app that passes the structural checks. We deliberately chose not to implement content filtering at the iframe level — that responsibility belongs to the app developer and the review process, not to runtime interception that would be brittle and easy to circumvent.

Finally, we had to decide how to handle the cost implications of tool-calling at scale. Every plugin adds token overhead to every API call — tool schemas are injected into the system prompt. With three plugins active, that is roughly 260 extra input tokens per request. At 200,000 daily users, this is real money. We chose to make plugin loading lazy and session-scoped: tools are only injected when a user's conversation context suggests they might be needed, and teachers can disable plugins they do not use. This is a pragmatic trade-off between AI capability and cost control that respects TutorMeAI's position as education infrastructure where budgets are tight and waste is unacceptable.

---

## Phase 1: Define Your Constraints

### 1. Scale and Load Profile

- **Users at launch**: ~500 beta users (single school district pilot); targeting 10,000+ within 6 months as TutorMeAI rolls out to existing districts
- **Traffic pattern**: Spiky — heavy usage during school hours (8 AM–3 PM local time), near-zero overnight. Monday–Friday dominant with exam-period surges
- **Concurrent app sessions per user**: Typically 1 active app at a time, but users may switch between 2–3 apps within a single conversation session
- **Cold start tolerance**: Under 2 seconds for app iframe loading. Students lose focus quickly — anything over 3 seconds and they will assume it is broken

### 2. Budget and Cost Ceiling

- **Monthly spend limit**: $50/month for development and testing; production costs scale with TutorMeAI's existing per-district pricing model
- **Pay-per-use**: Acceptable — users supply their own API keys (BYOK model), so LLM costs pass through to the district
- **LLM cost per tool invocation**: Under $0.005 per invocation on mid-tier models (GPT-4o-mini, Claude Haiku). Tool schema overhead adds ~260 tokens per request with all 3 plugins active (~$0.001 on GPT-4o)
- **Time vs money trade-off**: Forking Chatbox saves weeks of chat infrastructure work; invest time in the plugin system instead of rebuilding what exists

### 3. Time to Ship

- **MVP timeline**: 24 hours (pre-search + basic architecture)
- **Early submission**: 4 days (full plugin system + 3 working apps)
- **Final**: 7 days (polish, OAuth flows, deployment, documentation)
- **Priority**: Speed-to-market for the sprint, but architecture decisions should not create tech debt that blocks future plugin developers
- **Iteration cadence**: Daily — ship vertical slices (one complete plugin integration per day)

### 4. Security and Sandboxing

- **Isolation method**: Iframe sandbox with restricted attribute set (`allow-scripts allow-same-origin allow-popups allow-forms`). No `allow-top-navigation`, no `allow-modals` for untrusted content
- **Malicious app registration**: Structural enforcement — plugins must conform to the typed `PluginDefinition` interface and pass schema validation. Built-in plugins are bundled; third-party plugins would go through a review/approval process before being added to the registry
- **CSP requirements**: `X-Frame-Options: SAMEORIGIN` on the host; plugin iframes served from `/plugins/` path with 1-hour cache. `X-Content-Type-Options: nosniff` on all responses
- **Data privacy**: Plugins receive only the arguments explicitly passed via `plugin:invoke`. No chat history, no user identity, no session tokens are exposed to the iframe. The postMessage protocol is the only communication channel

### 5. Team and Skill Constraints

- **Team**: Solo developer
- **Strong skills**: TypeScript, React, Node.js, Vite/build tooling
- **iframe/postMessage**: Moderate experience — the protocol is straightforward but edge cases (origin validation, message ordering) require care
- **OAuth2**: Familiar with PKCE flows — implementing for Spotify plugin

---

## Phase 2: Architecture Discovery

### 6. Plugin Architecture

**Decision: Iframe-based isolation with postMessage protocol**

| Approach | Security | DX Complexity | Performance | Chosen? |
|----------|----------|---------------|-------------|---------|
| Iframes + postMessage | Strong (process isolation) | Medium | Good (parallel loading) | Yes |
| Web Components | Weak (shared JS context) | Low | Excellent | No |
| Server-side rendering | Strong (no client code) | High | Poor (latency per render) | No |

**How apps register tool schemas**: Each plugin defines a `PluginDefinition` object with a `toolSchema` field that follows the OpenAI function calling format. The registry converts these to Zod schemas at startup and generates AI SDK tool objects.

```
PluginDefinition.toolSchema → paramToZod() → z.object() → ai.tool() → injected into streamText()
```

**Message passing protocol**: Four-event postMessage lifecycle:
1. `plugin:ready` — iframe loaded, ready to receive invocations
2. `plugin:invoke` — host sends tool call arguments to the plugin
3. `plugin:state` — plugin reports intermediate state updates (e.g., chess board position changes)
4. `plugin:complete` — plugin signals task completion with result data
5. `plugin:error` — plugin reports an error

**Runtime tool discovery**: The plugin registry (`getPluginToolSet()`) is called at the start of each `streamText()` call. It iterates all registered plugins and returns a merged tool set. The AI model receives all available tool schemas in its system prompt and decides which to invoke based on user intent.

### 7. LLM and Function Calling

**Provider**: Multi-provider support (OpenAI, Anthropic, Google, + 20 others). The platform uses the Vercel AI SDK which normalizes function calling across providers. Any model with tool-use capability works.

**Dynamic schema injection**: Plugin tool schemas are merged into the tool set parameter of `streamText()`. This happens per-request, so the schema set can change between messages if plugins are enabled/disabled mid-session.

**Context window management**: Three mitigation strategies:
1. Each plugin tool schema adds only 60–120 tokens — lightweight by design
2. Automatic message compaction reduces conversation history when approaching context limits (configurable threshold: 40–90% of context window)
3. Teachers can disable unused plugins to reduce per-request token overhead

**Streaming with tool results**: The AI SDK handles streaming natively. When the model emits a tool call, the stream pauses, the tool executes (returning the plugin metadata), and the `PluginIframeUI` component renders the iframe. The conversation continues when the model receives the tool result.

### 8. Real-Time Communication

**Decision: No WebSocket needed**

| Layer | Protocol | Reason |
|-------|----------|--------|
| Chat streaming | Server-Sent Events (via AI SDK) | One-directional stream from LLM to client |
| App ↔ Platform | postMessage | Browser-native, zero infrastructure, synchronous |
| State persistence | Local storage (IndexedDB) | No server-side session state needed |

**Bidirectional state updates**: The `plugin:state` message type lets apps push state changes to the host. The host stores these in React state (`useState` in `PluginFrame`) and can pass them back to the AI in subsequent turns.

**Reconnection**: Not applicable for postMessage (in-process). For chat streaming, the AI SDK handles reconnection. If an iframe fails to send `plugin:ready` within the timeout window, the host shows an error state.

### 9. State Management

**Chat state**: Zustand + Jotai stores, persisted to IndexedDB (web) or electron-store (desktop). Session list, messages, and settings are separate stores with independent persistence.

**App state**: Owned entirely by the plugin iframe. The platform never stores or manages app-internal state — this is a deliberate design choice to maintain the isolation boundary. The only app state the platform sees is what flows through `plugin:state` and `plugin:complete` messages.

**Session state**: Tool invocation results are stored as part of the message history (as `MessageToolCallPart` objects). When the user asks the chatbot about a previous app interaction, the tool result is in the conversation context and the AI can reference it.

**Page refresh**: Chat history persists in IndexedDB. Plugin iframes will re-render from scratch (they are stateless from the platform's perspective). The tool result in the message history acts as the "last known state" for the AI to reference.

### 10. Authentication Architecture

**Platform auth**: The base Chatbox platform supports user settings and API key management. Users supply their own API keys (BYOK model). For the web deployment, API keys are stored in IndexedDB.

**Per-app auth**: Three tiers as required by the case study:

| App Type | Auth Pattern | Implementation | Example |
|----------|-------------|----------------|---------|
| Internal | None | Bundled with platform | Chess |
| External (Public) | API key or none | Key passed via env vars at build time | Weather (Open-Meteo, free) |
| External (Authenticated) | OAuth2 PKCE | Plugin initiates OAuth flow via `allow-popups` | Spotify |

**Token storage**: OAuth tokens for authenticated plugins are managed within the plugin iframe's own storage context (localStorage scoped to the iframe origin). The platform does not handle or store third-party OAuth tokens — this maintains the isolation boundary.

**OAuth redirect handling**: The iframe has `allow-popups` in its sandbox, so OAuth flows open in a new window. The redirect URL points back to the plugin's origin. The plugin handles the token exchange internally and reports success/failure via `plugin:complete`.

### 11. Database and Persistence

**No traditional database required for the MVP.** All persistence uses client-side storage:

| Data | Storage | Format |
|------|---------|--------|
| Conversation history | IndexedDB (via localforage) | JSON sessions with message arrays |
| User settings | IndexedDB (web) / config.json (desktop) | Key-value pairs |
| Plugin registrations | In-memory Map | Populated at app startup from `builtinPlugins` |
| Tool invocation history | Embedded in messages | `MessageToolCallPart` within session messages |

**Schema for conversations**: Each session contains a message array. Messages with tool calls include the tool name, arguments, and result (which contains the plugin metadata). This naturally captures the full invocation history.

**Read/write patterns**: Write-heavy during active conversations (new messages appended). Read-heavy on session load (full history retrieved). IndexedDB handles both patterns well for the expected data volumes.

---

## Phase 3: Post-Stack Refinement

### 12. Security and Sandboxing Deep Dive

**Iframe sandbox attributes**:
```html
<iframe sandbox="allow-scripts allow-same-origin allow-popups allow-forms" />
```

| Attribute | Purpose | Risk Mitigation |
|-----------|---------|-----------------|
| `allow-scripts` | Plugin JS execution | Required for any interactive app |
| `allow-same-origin` | Plugin can access its own localStorage | Scoped to plugin origin, cannot access host |
| `allow-popups` | OAuth flows open in new window | Popups blocked by default; only used for auth |
| `allow-forms` | Form submission within plugin | Scoped to plugin iframe |
| ~~`allow-top-navigation`~~ | **Not included** | Prevents plugin from redirecting the host page |

**CSP headers** (configured in `vercel.json`):
- `X-Frame-Options: SAMEORIGIN` — prevents the host from being embedded elsewhere
- `X-Content-Type-Options: nosniff` — prevents MIME-type sniffing attacks
- Plugin assets served with `Cache-Control: public, max-age=3600`

**Preventing parent DOM access**: The iframe sandbox enforces cross-origin restrictions. Even with `allow-same-origin`, the plugin iframe is served from a `/plugins/` subpath, and postMessage is the only communication channel. The host validates `event.data.type` before processing any message.

**Rate limiting**: Not implemented at the iframe level for MVP. For production, rate limiting would be applied at the AI API layer (limiting tool invocations per session) and at the plugin registry level (limiting how many plugins can be active simultaneously).

### 13. Error Handling and Resilience

**Iframe load failure**: If the iframe `src` fails to load (404, network error), the browser renders a blank frame. The `plugin:ready` message never arrives, so the host can detect the timeout and show a user-friendly error message.

**Timeout strategy**: Plugin invocations should complete within 30 seconds. If `plugin:complete` is not received within the timeout, the host reports a timeout error to the AI and the conversation continues without the plugin result.

**Chatbot recovery from failed interactions**: The AI receives an error result for the tool call (e.g., `{ error: "Plugin timed out" }`). The AI's next response can acknowledge the failure and suggest alternatives (e.g., "The weather service is not responding right now — try again later").

**Circuit breaker**: For MVP, a simple failure counter per plugin. After 3 consecutive failures in a session, the plugin is temporarily disabled for that session with a user-visible notification.

### 14. Testing Strategy

**Unit tests**: Vitest with `@ai-sdk/provider-utils/test` for mock AI server testing. Existing coverage on AI provider adapters, message processing, content rendering.

**Plugin interface testing in isolation**:
- Mock plugins that implement the postMessage protocol with predictable responses
- Test the full lifecycle: `ready` → `invoke` → `state` → `complete`
- Test error paths: iframe load failure, timeout, malformed messages

**Integration testing**:
- End-to-end invocation lifecycle: user message → AI tool call → plugin render → user interaction → completion → follow-up
- Multi-app switching: start chess, switch to weather, return to chess
- Context retention: ask about a previous plugin interaction

**Load testing**: Not prioritized for the sprint. The architecture is client-side, so load scales horizontally by user count (each user has their own AI connection and plugin instances).

**Testing commands**:
```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # Coverage report
pnpm test:integration  # Integration tests (300s timeout)
```

### 15. Developer Experience

**Building a third-party app requires**:
1. Define a `PluginDefinition` with tool schema (JSON-like structure)
2. Create an HTML file that implements the postMessage protocol
3. Listen for `plugin:invoke`, post `plugin:ready` on load, post `plugin:complete` when done

**Minimal plugin example** (complete working plugin in ~30 lines of HTML):
```html
<script>
  window.addEventListener('message', (e) => {
    if (e.data.type === 'plugin:invoke') {
      // Do work with e.data.args
      window.parent.postMessage({
        type: 'plugin:complete',
        pluginId: e.data.pluginId,
        toolCallId: e.data.toolCallId,
        result: { success: true }
      }, '*');
    }
  });
  window.parent.postMessage({ type: 'plugin:ready', pluginId: 'my-plugin' }, '*');
</script>
```

**Local development**: Run `pnpm dev:web` for hot reload. Plugin HTML files in `public/plugins/` are served directly by Vite. Changes to plugin files are reflected immediately.

**Debugging**: Browser DevTools can inspect the iframe independently. PostMessage events appear in the console. Plugin errors flow back through `plugin:error` and are visible in the chat UI.

### 16. Deployment and Operations

**Platform deployment**: Static SPA deployed to Vercel. Build command: `pnpm run build:web`. Output: `release/app/dist/renderer/`. SPA routing handled by `vercel.json` rewrites.

**Third-party app hosting**: Built-in plugins are bundled in `public/plugins/` and deployed with the platform. External third-party plugins would be hosted at their own URLs — the `iframeUrl` field in `PluginDefinition` supports absolute URLs.

**CI/CD**: GitLab CI for automated builds. Pipeline stages:
1. Lint (`pnpm lint`)
2. Type check (`pnpm check`)
3. Test (`pnpm test`)
4. Build (`pnpm build:web`)
5. Deploy to Vercel

**Monitoring**: Sentry integration for error tracking (opt-in via `allowReportingAndTracking` setting). Error boundary at the React component tree root captures rendering failures. Plugin-specific errors captured via `plugin:error` postMessage.

**App updates without breaking sessions**: Plugin iframes are loaded by URL. Updating a plugin's HTML file is an atomic operation — the next invocation loads the new version. Active iframes are not affected until they are re-rendered. Plugin versioning (`version` field in `PluginDefinition`) enables future version-pinning if needed.

---

## Technical Stack Summary

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Base Platform | Chatbox CE (fork) | Mature AI chat app with streaming, history, multi-provider support |
| Frontend | React + TypeScript + Mantine UI | Existing Chatbox stack, well-tested |
| State | Zustand + Jotai + IndexedDB | Client-side persistence, no server needed |
| Build | Vite + electron-vite | Fast builds, web + desktop from single codebase |
| AI Integration | Vercel AI SDK with function calling | Provider-agnostic, native streaming + tool use |
| App Sandboxing | Iframes + postMessage | Process-level isolation, zero server infrastructure |
| Auth (Platform) | BYOK (Bring Your Own Key) | Users supply API keys, no platform auth server needed |
| Auth (Plugins) | OAuth2 PKCE (per-plugin) | Spotify plugin demonstrates authenticated flow |
| Testing | Vitest + Testing Library | Fast, ESM-native, TypeScript-first |
| Deployment | Vercel (static SPA) | Free tier sufficient, global CDN, zero-config |

---

## Build Priority Order

| Priority | Feature | Status |
|----------|---------|--------|
| 1 | Basic chat (streaming, history, context) | Done (from Chatbox fork) |
| 2 | Plugin registration + tool schema contract | Done |
| 3 | Tool invocation (AI discovers and calls plugin tools) | Done |
| 4 | UI embedding (iframe renders inline in chat) | Done |
| 5 | Completion signaling (plugin → chatbot lifecycle) | Done |
| 6 | Context retention (chatbot remembers plugin results) | Done |
| 7 | Multiple apps (Chess + Weather + Spotify) | Done |
| 8 | Auth flows (Spotify OAuth2 PKCE) | Done |
| 9 | Error handling (timeouts, crashes, invalid calls) | In progress |
| 10 | Developer docs (API documentation for third-party devs) | In progress |

# ChatBridge Plugin Developer Guide

This guide explains how to build a third-party plugin for ChatBridge. Plugins are iframe-based apps that render inline in AI chat conversations.

## How Plugins Work

1. You define a **tool schema** (what the AI can call) and an **iframe URL** (your app's UI)
2. When a user's message matches your tool's purpose, the AI calls it
3. ChatBridge renders your iframe inline in the chat
4. Your app communicates with ChatBridge via the **postMessage protocol**
5. When your app finishes, it signals completion and the conversation continues

## Quick Start: Build a Plugin in 5 Minutes

### 1. Create the HTML file

Create `public/plugins/my-app/index.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>My Plugin</title>
  <style>
    body { font-family: system-ui; margin: 16px; }
  </style>
</head>
<body>
  <div id="app">Loading...</div>

  <script>
    const PLUGIN_ID = 'my-plugin'

    // Listen for invocations from ChatBridge
    window.addEventListener('message', (event) => {
      const { type, pluginId, toolCallId, args } = event.data
      if (type !== 'plugin:invoke' || pluginId !== PLUGIN_ID) return

      // Your app logic here
      document.getElementById('app').textContent = `Hello, ${args.name}!`

      // Signal completion
      window.parent.postMessage({
        type: 'plugin:complete',
        pluginId: PLUGIN_ID,
        toolCallId: toolCallId,
        result: { greeting: `Hello, ${args.name}!` }
      }, '*')
    })

    // Signal ready
    window.parent.postMessage({
      type: 'plugin:ready',
      pluginId: PLUGIN_ID
    }, '*')
  </script>
</body>
</html>
```

### 2. Register the plugin

Add to `src/renderer/packages/plugins/builtin.ts`:

```typescript
{
  id: 'my-plugin',
  name: 'My Plugin',
  description: 'A greeting plugin that says hello',
  version: '1.0.0',
  iframeUrl: '/plugins/my-app/index.html',
  toolSchema: {
    name: 'greet_user',
    description: 'Greet a user by name',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name to greet',
        },
      },
      required: ['name'],
    },
  },
  defaultWidth: 400,
  defaultHeight: 200,
}
```

### 3. Test it

Run `pnpm dev` and type "greet Alice" in the chat. The AI will call your tool and your iframe appears inline.

## PostMessage Protocol

All communication between ChatBridge and your plugin uses `window.postMessage`.

### Messages FROM ChatBridge TO your plugin

#### `plugin:invoke`

Sent after your plugin signals `plugin:ready`. Contains the tool call arguments.

```typescript
{
  type: 'plugin:invoke'
  pluginId: string       // Your plugin's ID
  toolCallId: string     // Unique ID for this tool call
  args: Record<string, unknown>  // Arguments from the AI
}
```

### Messages FROM your plugin TO ChatBridge

#### `plugin:ready`

Send this immediately when your iframe loads. ChatBridge waits for this before sending `plugin:invoke`.

```typescript
window.parent.postMessage({
  type: 'plugin:ready',
  pluginId: 'your-plugin-id'
}, '*')
```

#### `plugin:state`

Send intermediate state updates. Optional — use this if your plugin has multi-step interactions.

```typescript
window.parent.postMessage({
  type: 'plugin:state',
  pluginId: 'your-plugin-id',
  toolCallId: toolCallId,
  state: { currentStep: 2, totalSteps: 5 }
}, '*')
```

#### `plugin:complete`

Send when your plugin has finished its work. The AI receives the result and the conversation continues.

```typescript
window.parent.postMessage({
  type: 'plugin:complete',
  pluginId: 'your-plugin-id',
  toolCallId: toolCallId,
  result: { /* your result data */ }
}, '*')
```

#### `plugin:error`

Send if something goes wrong. ChatBridge displays an error state.

```typescript
window.parent.postMessage({
  type: 'plugin:error',
  pluginId: 'your-plugin-id',
  toolCallId: toolCallId,
  error: 'Failed to load data from API'
}, '*')
```

## Tool Schema Reference

Tool schemas follow the OpenAI function calling format:

```typescript
interface PluginToolSchema {
  name: string           // Tool name (snake_case, unique)
  description: string    // What the tool does (shown to AI)
  parameters: {
    type: 'object'
    properties: Record<string, PluginToolParameter>
    required?: string[]
  }
}

interface PluginToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  enum?: string[]        // For string parameters with fixed options
}
```

**Tips for good tool descriptions:**
- Be specific: "Show current weather and 3-day forecast for a location" > "Show weather"
- The AI uses the description to decide when to call your tool
- Parameter descriptions help the AI extract the right values from user messages

## Plugin Definition

```typescript
interface PluginDefinition {
  id: string             // Unique identifier (kebab-case)
  name: string           // Display name shown in chat
  description: string    // Shown in plugin header
  version: string        // Semver version
  iframeUrl: string      // Path to your HTML file
  toolSchema: PluginToolSchema
  icon?: string          // Optional icon URL
  defaultWidth?: number  // Iframe width in pixels (default: 500)
  defaultHeight?: number // Iframe height in pixels (default: 400)
}
```

## Authentication Patterns

### No auth (internal apps)
Use for tools that don't need external APIs. Example: Chess.

### API key (external public)
Fetch from a free/public API directly in your iframe. Example: Weather uses Open-Meteo (no key required).

### OAuth2 (external authenticated)
Implement the OAuth flow inside your iframe. Example: Spotify uses PKCE flow.

```javascript
// Generate PKCE verifier and challenge
function generateCodeVerifier() {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
```

## Security

Plugins run in sandboxed iframes with these attributes:

```
sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
```

**What this means:**
- Your plugin CAN run JavaScript, make API calls, open popups, and submit forms
- Your plugin CANNOT access the parent page's DOM, cookies, or other plugins
- All communication goes through postMessage

## Lifecycle Diagram

```
User sends message
    ↓
AI receives tool schemas for all registered plugins
    ↓
AI decides to call your tool (e.g., show_weather)
    ↓
ChatBridge renders your iframe
    ↓
Your iframe loads → sends plugin:ready
    ↓
ChatBridge sends plugin:invoke with args
    ↓
Your plugin runs (optionally sends plugin:state updates)
    ↓
Your plugin sends plugin:complete with result
    ↓
AI receives result → conversation continues
    ↓
User can ask follow-up questions about the result
```

## Examples

See the built-in plugins for reference implementations:

| Plugin | Complexity | Auth | Source |
|--------|-----------|------|--------|
| Chess | High (bidirectional state) | None | `public/plugins/chess/index.html` |
| Weather | Medium (external API) | None | `public/plugins/weather/index.html` |
| Spotify | Medium (OAuth2 PKCE) | OAuth2 | `public/plugins/spotify/index.html` |

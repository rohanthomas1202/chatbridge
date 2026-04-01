/**
 * ChatBridge Plugin System Types
 *
 * Plugins are iframe-based apps that can be invoked by AI tool calls.
 * Each plugin registers a tool schema (OpenAI function calling format)
 * and an iframe URL. When the AI calls the tool, the plugin iframe
 * renders inline in the chat message thread.
 */

export interface PluginToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  enum?: string[]
  items?: { type: string }
}

export interface PluginToolSchema {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, PluginToolParameter>
    required?: string[]
  }
}

export interface PluginDefinition {
  id: string
  name: string
  description: string
  version: string
  iframeUrl: string
  toolSchema: PluginToolSchema
  icon?: string
  /** Default iframe dimensions */
  defaultWidth?: number
  defaultHeight?: number
}

/**
 * Messages sent from the host (ChatBridge) to the plugin iframe via postMessage
 */
export interface PluginHostMessage {
  type: 'plugin:invoke'
  pluginId: string
  toolCallId: string
  args: Record<string, unknown>
}

/**
 * Messages sent from the plugin iframe back to the host via postMessage
 */
export type PluginIframeMessage =
  | {
      type: 'plugin:ready'
      pluginId: string
    }
  | {
      type: 'plugin:state'
      pluginId: string
      toolCallId: string
      state: Record<string, unknown>
    }
  | {
      type: 'plugin:complete'
      pluginId: string
      toolCallId: string
      result: unknown
    }
  | {
      type: 'plugin:error'
      pluginId: string
      toolCallId: string
      error: string
    }

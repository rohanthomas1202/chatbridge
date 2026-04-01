/**
 * ChatBridge Plugin System Types
 *
 * Re-exports the canonical plugin types from shared/types/plugin.
 * Import from here for convenience when building plugins.
 */

export type {
  PluginDefinition,
  PluginToolSchema,
  PluginToolParameter,
  PluginHostMessage,
  PluginIframeMessage,
} from '../shared/types/plugin'

/**
 * Plugin system entry point.
 * Registers built-in plugins and exports the public API.
 */

export { registerPlugin, unregisterPlugin, getPlugin, getAllPlugins, getPluginByToolName, getPluginToolSet } from './registry'
export { builtinPlugins, chessPlugin, weatherPlugin, spotifyPlugin } from './builtin'

import { builtinPlugins } from './builtin'
import { registerPlugin } from './registry'

let initialized = false

export function initPlugins(): void {
  if (initialized) return
  for (const plugin of builtinPlugins) {
    registerPlugin(plugin)
  }
  initialized = true
}

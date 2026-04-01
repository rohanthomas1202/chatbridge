/**
 * ChatBridge Plugin Registry
 *
 * Re-exports the plugin registry and initialization functions.
 * Import from here as the public API for the plugin system.
 */

export {
  registerPlugin,
  unregisterPlugin,
  getPlugin,
  getAllPlugins,
  getPluginByToolName,
  getPluginToolSet,
} from '../renderer/packages/plugins/registry'

export { initPlugins } from '../renderer/packages/plugins'
export { builtinPlugins } from '../renderer/packages/plugins/builtin'

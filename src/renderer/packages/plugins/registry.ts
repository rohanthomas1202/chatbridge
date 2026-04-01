/**
 * Plugin Registry — registers plugins and exposes them as AI-callable tools.
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { PluginDefinition, PluginToolParameter } from '@shared/types/plugin'

const plugins = new Map<string, PluginDefinition>()

export function registerPlugin(plugin: PluginDefinition): void {
  plugins.set(plugin.id, plugin)
}

export function unregisterPlugin(id: string): void {
  plugins.delete(id)
}

export function getPlugin(id: string): PluginDefinition | undefined {
  return plugins.get(id)
}

export function getAllPlugins(): PluginDefinition[] {
  return Array.from(plugins.values())
}

export function getPluginByToolName(toolName: string): PluginDefinition | undefined {
  return Array.from(plugins.values()).find((p) => p.toolSchema.name === toolName)
}

/**
 * Convert a plugin parameter spec to a Zod schema
 */
function paramToZod(param: PluginToolParameter): z.ZodTypeAny {
  switch (param.type) {
    case 'string':
      if (param.enum) return z.enum(param.enum as [string, ...string[]]).describe(param.description)
      return z.string().describe(param.description)
    case 'number':
      return z.number().describe(param.description)
    case 'boolean':
      return z.boolean().describe(param.description)
    case 'array':
      return z.array(z.string()).describe(param.description)
    case 'object':
      return z.record(z.string(), z.unknown()).describe(param.description)
    default:
      return z.string().describe(param.description)
  }
}

/**
 * Build an AI SDK ToolSet from all registered plugins.
 * These tools return a JSON result that the message renderer
 * uses to decide whether to show a plugin iframe.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPluginToolSet(): Record<string, any> {
  const toolSet: Record<string, any> = {}

  for (const plugin of plugins.values()) {
    const schema = plugin.toolSchema
    const shape: Record<string, z.ZodTypeAny> = {}
    for (const [key, param] of Object.entries(schema.parameters.properties)) {
      shape[key] = paramToZod(param)
    }

    const zodSchema = z.object(shape)

    toolSet[schema.name] = tool({
      description: schema.description,
      inputSchema: zodSchema,
      execute: async (args: Record<string, unknown>) => {
        // The tool result carries the plugin id and args so the UI
        // can render the iframe. The actual plugin logic runs client-side.
        return {
          __plugin: true,
          pluginId: plugin.id,
          pluginName: plugin.name,
          iframeUrl: plugin.iframeUrl,
          args,
          width: plugin.defaultWidth ?? 500,
          height: plugin.defaultHeight ?? 400,
        }
      },
    })
  }

  return toolSet
}

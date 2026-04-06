/**
 * Renders a plugin iframe inline in the chat when an AI tool call
 * returns a plugin result (identified by __plugin: true).
 */

import { Box, Group, Paper, Text } from '@mantine/core'
import type { MessageToolCallPart } from '@shared/types'
import type { PluginHostMessage, PluginIframeMessage } from '@shared/types/plugin'
import { IconAppWindow } from '@tabler/icons-react'
import { type FC, useCallback, useEffect, useRef, useState } from 'react'

interface PluginResult {
  __plugin: true
  pluginId: string
  pluginName: string
  iframeUrl: string
  args: Record<string, unknown>
  width: number
  height: number
}

export function isPluginResult(result: unknown): result is PluginResult {
  return typeof result === 'object' && result !== null && (result as any).__plugin === true
}

export const PluginIframeUI: FC<{ part: MessageToolCallPart }> = ({ part }) => {
  const result = part.result as PluginResult | undefined
  if (!result || !isPluginResult(result)) return null

  return <PluginFrame part={part} result={result} />
}

const PluginFrame: FC<{ part: MessageToolCallPart; result: PluginResult }> = ({ part, result }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const [pluginState, setPluginState] = useState<Record<string, unknown> | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)

  const handleMessage = useCallback(
    (event: MessageEvent<PluginIframeMessage>) => {
      const data = event.data
      if (!data || typeof data !== 'object' || !('type' in data)) return
      if (!String(data.type).startsWith('plugin:')) return

      const msg = data as PluginIframeMessage
      switch (msg.type) {
        case 'plugin:ready':
          if (msg.pluginId === result.pluginId) {
            setReady(true)
            // Send the invocation to the iframe
            const invoke: PluginHostMessage = {
              type: 'plugin:invoke',
              pluginId: result.pluginId,
              toolCallId: part.toolCallId,
              args: result.args,
            }
            iframeRef.current?.contentWindow?.postMessage(invoke, '*')
          }
          break
        case 'plugin:state':
          if (msg.pluginId === result.pluginId) {
            setPluginState(msg.state)
          }
          break
        case 'plugin:complete':
        case 'plugin:error':
          // Could update part state, but that's managed by the streaming layer
          break
      }
    },
    [result.pluginId, result.args, part.toolCallId]
  )

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  useEffect(() => {
    if (ready) return
    const timer = setTimeout(() => setTimedOut(true), 30_000)
    return () => clearTimeout(timer)
  }, [ready, iframeKey])

  return (
    <Paper radius="md" withBorder p={0} mb="xs" style={{ overflow: 'hidden', maxWidth: result.width + 2 }}>
      <Group gap={6} px={10} py={6} bg="var(--chatbox-background-gray-secondary)">
        <IconAppWindow size={14} color="var(--chatbox-tint-brand)" />
        <Text size="xs" fw={600}>
          {result.pluginName}
        </Text>
      </Group>
      <Box style={{ position: 'relative' }}>
        <iframe
          key={iframeKey}
          ref={iframeRef}
          src={result.iframeUrl}
          title={result.pluginName}
          width={result.width}
          height={result.height}
          style={{ border: 'none', display: 'block' }}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
        {timedOut && (
          <Box
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              backgroundColor: 'rgba(200, 0, 0, 0.08)',
              border: '1px solid rgba(200, 0, 0, 0.3)',
            }}
          >
            <Text size="sm" c="red" fw={500}>
              Plugin timed out — no response received
            </Text>
            <button
              type="button"
              onClick={() => {
                setTimedOut(false)
                setReady(false)
                setIframeKey((k) => k + 1)
              }}
              style={{
                padding: '4px 14px',
                borderRadius: 4,
                border: '1px solid rgba(200, 0, 0, 0.5)',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Retry
            </button>
          </Box>
        )}
      </Box>
    </Paper>
  )
}

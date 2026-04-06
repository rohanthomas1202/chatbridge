/**
 * Chess Plugin — Reference React source.
 *
 * NOTE: The actual plugin served to iframes is the standalone HTML at
 * public/plugins/chess/index.html. This React component is kept as a
 * reference but is NOT compiled into the iframe build.
 *
 * The live plugin uses:
 * - chess.js (inlined) for full rule enforcement
 * - Stockfish WASM (Web Worker) for AI opponent
 * - Setup screen for color/mode/difficulty selection
 *
 * Tool schema: suggest_chess_move(position, difficulty?, suggested_move?, explanation?)
 *
 * postMessage protocol:
 *   Host → Plugin: { type: 'plugin:invoke', pluginId: 'chatbridge-chess', args }
 *   Plugin → Host: { type: 'plugin:ready', pluginId: 'chatbridge-chess' }
 *   Plugin → Host: { type: 'plugin:state', pluginId, toolCallId, state: { type: 'move', uci } }
 *   Plugin → Host: { type: 'plugin:state', pluginId, toolCallId, state: { type: 'gameOver', reason, winner } }
 *   Plugin → Host: { type: 'plugin:complete', pluginId, toolCallId, result }
 *
 * See public/plugins/chess/index.html for the live implementation.
 */

import React from 'react'

export default function ChessPlugin() {
  return (
    <div style={{ padding: 20, color: '#a8b2d1', textAlign: 'center' }}>
      <p>Chess plugin renders from public/plugins/chess/index.html</p>
      <p>This React component is a reference only.</p>
    </div>
  )
}

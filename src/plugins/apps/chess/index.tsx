/**
 * Chess Plugin — Interactive chess board for AI-suggested moves.
 *
 * This React component is the source for the chess plugin iframe app.
 * It renders a chessboard, accepts moves via postMessage, and lets
 * users play interactively. The compiled version lives at
 * public/plugins/chess/index.html as a self-contained file.
 *
 * Tool schema: suggest_chess_move(position: string, suggested_move?: string, explanation?: string)
 *
 * postMessage protocol:
 *   Host → Plugin: { type: 'plugin:invoke', pluginId: 'chatbridge-chess', args: { position, suggested_move, explanation } }
 *   Plugin → Host: { type: 'plugin:ready', pluginId: 'chatbridge-chess' }
 *   Plugin → Host: { type: 'plugin:state', pluginId, toolCallId, state: { type: 'move', uci } }
 *   Plugin → Host: { type: 'plugin:complete', pluginId, toolCallId, result }
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'

const PLUGIN_ID = 'chatbridge-chess'
const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const PIECES: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
}

type Square = string | null
type Board = Square[][]

function fenToBoard(fen: string): { board: Board; turn: 'w' | 'b' } {
  const parts = fen.split(' ')
  const rows = parts[0].split('/')
  const board: Board = []
  for (let r = 0; r < 8; r++) {
    board[r] = []
    let c = 0
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < parseInt(ch); i++) board[r][c++] = null
      } else {
        board[r][c++] = ch
      }
    }
  }
  return { board, turn: (parts[1] || 'w') as 'w' | 'b' }
}

function isOwnPiece(piece: string | null, turn: 'w' | 'b'): boolean {
  if (!piece) return false
  return turn === 'w' ? piece === piece.toUpperCase() : piece === piece.toLowerCase()
}

function uciToCoords(uci: string) {
  if (!uci || uci.length < 4) return null
  return {
    fromRow: 8 - parseInt(uci[1]),
    fromCol: uci.charCodeAt(0) - 97,
    toRow: 8 - parseInt(uci[3]),
    toCol: uci.charCodeAt(2) - 97,
  }
}

function coordsToUci(fr: number, fc: number, tr: number, tc: number) {
  return String.fromCharCode(97 + fc) + (8 - fr) + String.fromCharCode(97 + tc) + (8 - tr)
}

function postToParent(data: Record<string, unknown>) {
  window.parent.postMessage(data, '*')
}

export default function ChessPlugin() {
  const [board, setBoard] = useState<Board>(() => fenToBoard(INITIAL_FEN).board)
  const [turn, setTurn] = useState<'w' | 'b'>('w')
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null)
  const [suggestedFrom, setSuggestedFrom] = useState<{ r: number; c: number } | null>(null)
  const [suggestedTo, setSuggestedTo] = useState<{ r: number; c: number } | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [suggestedMove, setSuggestedMove] = useState<string | null>(null)
  const [status, setStatus] = useState("White's turn")
  const [gameOver, setGameOver] = useState(false)
  const toolCallIdRef = useRef('')

  const handleSquareClick = useCallback(
    (r: number, c: number) => {
      if (gameOver) return
      const piece = board[r][c]

      if (selected) {
        if (selected.r === r && selected.c === c) {
          setSelected(null)
          return
        }
        const target = board[r][c]
        if (target && isOwnPiece(target, turn)) {
          setSelected({ r, c })
          return
        }
        // Execute move
        const newBoard = board.map((row) => [...row])
        const movingPiece = newBoard[selected.r][selected.c]
        newBoard[r][c] = movingPiece
        newBoard[selected.r][selected.c] = null
        if (movingPiece === 'P' && r === 0) newBoard[r][c] = 'Q'
        if (movingPiece === 'p' && r === 7) newBoard[r][c] = 'q'

        const uci = coordsToUci(selected.r, selected.c, r, c)
        const nextTurn = turn === 'w' ? 'b' : 'w'

        // Check king capture
        let whiteKing = false, blackKing = false
        for (const row of newBoard) for (const p of row) {
          if (p === 'K') whiteKing = true
          if (p === 'k') blackKing = true
        }

        setBoard(newBoard)
        setTurn(nextTurn as 'w' | 'b')
        setSelected(null)
        setSuggestedFrom(null)
        setSuggestedTo(null)

        if (!whiteKing || !blackKing) {
          const winner = !whiteKing ? 'black' : 'white'
          setGameOver(true)
          setStatus(`Game Over — ${winner} wins!`)
          postToParent({ type: 'plugin:state', pluginId: PLUGIN_ID, toolCallId: toolCallIdRef.current, state: { type: 'gameOver', winner } })
        } else {
          setStatus(nextTurn === 'w' ? "White's turn" : "Black's turn")
          postToParent({ type: 'plugin:state', pluginId: PLUGIN_ID, toolCallId: toolCallIdRef.current, state: { type: 'move', uci } })
        }
      } else if (piece && isOwnPiece(piece, turn)) {
        setSelected({ r, c })
      }
    },
    [board, turn, selected, gameOver]
  )

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data
      if (!data || data.type !== 'plugin:invoke' || data.pluginId !== PLUGIN_ID) return

      toolCallIdRef.current = data.toolCallId
      const args = data.args || {}
      const fen = args.position === 'startpos' || !args.position ? INITIAL_FEN : args.position
      const { board: newBoard, turn: newTurn } = fenToBoard(fen)

      setBoard(newBoard)
      setTurn(newTurn)
      setSelected(null)
      setGameOver(false)
      setStatus(newTurn === 'w' ? "White's turn" : "Black's turn")

      if (args.suggested_move) {
        const coords = uciToCoords(args.suggested_move)
        if (coords) {
          setSuggestedFrom({ r: coords.fromRow, c: coords.fromCol })
          setSuggestedTo({ r: coords.toRow, c: coords.toCol })
        }
        setSuggestedMove(args.suggested_move)
      }
      if (args.explanation) setExplanation(args.explanation)

      postToParent({ type: 'plugin:complete', pluginId: PLUGIN_ID, toolCallId: data.toolCallId, result: { position: fen, suggestedMove: args.suggested_move || null } })
    }

    window.addEventListener('message', handler)
    postToParent({ type: 'plugin:ready', pluginId: PLUGIN_ID })
    return () => window.removeEventListener('message', handler)
  }, [])

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', background: '#1a1a2e', color: '#e0e0e0', padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h3 style={{ fontSize: 14, marginBottom: 8, color: '#a8b2d1' }}>♟ Chess Board</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 45px)', gridTemplateRows: 'repeat(8, 45px)', border: '2px solid #4a4a6a', borderRadius: 4, overflow: 'hidden' }}>
        {board.flatMap((row, r) =>
          row.map((piece, c) => {
            const isLight = (r + c) % 2 === 0
            const isSelected = selected?.r === r && selected?.c === c
            const isSugFrom = suggestedFrom?.r === r && suggestedFrom?.c === c
            const isSugTo = suggestedTo?.r === r && suggestedTo?.c === c
            let bg = isLight ? '#e8dcc8' : '#a87d5a'
            if (isSelected) bg = '#7fb069'

            return (
              <div
                key={`${r}-${c}`}
                onClick={() => handleSquareClick(r, c)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 32, cursor: 'pointer', userSelect: 'none',
                  background: bg,
                  boxShadow: isSugFrom || isSugTo ? 'inset 0 0 0 3px #4fc3f7' : undefined,
                }}
              >
                {piece ? PIECES[piece] || piece : ''}
              </div>
            )
          })
        )}
      </div>
      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: '#64ffda' }}>{status}</div>
      <div style={{ marginTop: 4, fontSize: 12, color: '#8892b0', textAlign: 'center', maxWidth: 360 }}>
        Click a piece to select, then click a destination to move.
      </div>
      {(suggestedMove || explanation) && (
        <div style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(100,255,218,0.1)', borderRadius: 6, border: '1px solid rgba(100,255,218,0.2)', fontSize: 12, color: '#a8b2d1', maxWidth: 360 }}>
          {suggestedMove ? `Suggested: ${suggestedMove}` : ''}{explanation ? ` — ${explanation}` : ''}
        </div>
      )}
    </div>
  )
}

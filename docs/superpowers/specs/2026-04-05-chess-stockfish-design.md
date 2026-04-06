# Chess Plugin: Stockfish Integration Design

## Overview

Replace the chess plugin's custom simplified move logic with chess.js (full rule engine) and add Stockfish WASM as a bundled AI opponent. The plugin runs entirely inside the sandboxed iframe — no external network calls.

## Architecture

Three layers inside `public/plugins/chess/`:

1. **chess.js** (inlined in index.html) — Legal move generation, check/checkmate/stalemate/draw detection, FEN/PGN support, castling, en passant, promotion with piece choice.

2. **Stockfish WASM** (Web Worker) — Bundled as `stockfish.js` + `stockfish.wasm` in the same directory. The main thread communicates via UCI protocol strings (`position fen <fen>\ngo depth <N>`). Worker responds with `bestmove <uci>`.

3. **UI layer** — Setup panel + board + status. Board highlights legal moves on piece select. Setup panel shown before game starts.

## Game Modes

### Setup Screen

Shown on plugin invoke before the game begins:

- **Pick your color:** White / Black (default: White)
- **Mode:** vs Stockfish / Pass-and-Play (default: vs Stockfish)
- **Difficulty slider** (only in vs Stockfish mode):
  - Beginner — Stockfish depth 1
  - Intermediate — Stockfish depth 5
  - Advanced — Stockfish depth 10
  - Expert — Stockfish depth 18

The setup screen uses the same dark theme as the board. Clicking "Start Game" transitions to the board view.

### vs Stockfish Flow

1. User selects a piece — legal destination squares are highlighted (green dots or colored squares).
2. User clicks a destination — chess.js validates and applies the move.
3. Board updates. Status shows "Stockfish is thinking..."
4. Main thread sends position to Stockfish Worker: `position fen <current_fen>\ngo depth <configured_depth>`
5. Worker responds with `bestmove <uci>`. Main thread applies via chess.js.
6. Board updates with AI move. Turn returns to user.
7. Loop until chess.js detects game over (checkmate, stalemate, insufficient material, threefold repetition, 50-move rule).

If user chose Black, Stockfish makes the first move immediately after setup.

### Pass-and-Play Flow

Standard alternating turns with full chess.js rule enforcement. No Stockfish involvement. Both players use the same board.

### Pawn Promotion

When a pawn reaches the last rank, show a small overlay with piece choices (Queen, Rook, Bishop, Knight). Apply the selected promotion via chess.js.

## Chatbot Integration

### Tool Schema Update

```json
{
  "name": "suggest_chess_move",
  "parameters": {
    "type": "object",
    "properties": {
      "position": {
        "type": "string",
        "description": "Board position in FEN notation. Use 'startpos' for starting position."
      },
      "difficulty": {
        "type": "string",
        "enum": ["beginner", "intermediate", "advanced", "expert"],
        "description": "Stockfish difficulty level for AI suggestions. Defaults to intermediate."
      },
      "suggested_move": {
        "type": "string",
        "description": "Suggested move in UCI notation (e.g., 'e2e4'). If omitted and difficulty is set, Stockfish computes the suggestion."
      },
      "explanation": {
        "type": "string",
        "description": "Brief explanation of why this move is recommended."
      }
    },
    "required": ["position"]
  }
}
```

When the chatbot invokes with `difficulty` but no `suggested_move`, the plugin runs Stockfish internally at the corresponding depth and displays the computed best move as the suggestion. The chatbot provides the `explanation` — its role is orchestration and pedagogy, not chess computation.

### postMessage Protocol

Unchanged structure. Message types: `plugin:ready`, `plugin:invoke`, `plugin:state`, `plugin:complete`.

The `plugin:state` messages now include richer game-over data:

```json
{
  "type": "plugin:state",
  "state": {
    "type": "gameOver",
    "reason": "checkmate" | "stalemate" | "draw-repetition" | "draw-50-move" | "draw-insufficient",
    "winner": "white" | "black" | "draw"
  }
}
```

Move state messages remain: `{ type: "move", uci: "e2e4" }`.

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `public/plugins/chess/index.html` | Rewrite | chess.js inlined, Stockfish worker setup, setup panel, legal move highlighting, promotion UI |
| `public/plugins/chess/stockfish.js` | Add | Bundled Stockfish WASM loader (from stockfish.wasm npm package) |
| `public/plugins/chess/stockfish.wasm` | Add | WASM binary (~2MB) |
| `src/plugins/apps/chess/index.tsx` | Update | Match new logic for React source |
| `src/renderer/packages/plugins/builtin.ts` | Update | Add `difficulty` param, bump `defaultHeight` to 580 |

## Stockfish Worker Communication

```
Main thread                          Worker
    |                                   |
    |-- "uci"  -----------------------> |
    |<-- "uciok" ---------------------- |
    |-- "isready" --------------------> |
    |<-- "readyok" -------------------- |
    |-- "position fen <fen>" ---------> |
    |-- "go depth <N>" ---------------> |
    |<-- "bestmove <uci>" ------------- |
    |                                   |
```

The worker is initialized once on page load. Each move request sends `position` + `go depth`. A timeout of 10 seconds is set per move — if Stockfish doesn't respond, fall back to a random legal move.

## UI Details

- **Legal move indicators:** Small green circles on empty legal squares, green ring on capturable pieces.
- **Last move highlight:** Light yellow background on the from/to squares of the most recent move.
- **Stockfish thinking indicator:** Pulsing border or status text "Thinking..." while waiting for worker response.
- **Board dimensions:** 360x360px board (unchanged). Setup panel adds ~60px height. Total iframe height: 580px.
- **Theme:** Unchanged dark theme (#1a1a2e background).

## Difficulty Mapping

| Level | Depth | Approximate ELO | Target Audience |
|-------|-------|-----------------|-----------------|
| Beginner | 1 | ~800 | New players |
| Intermediate | 5 | ~1400 | Casual players |
| Advanced | 10 | ~2000 | Club players |
| Expert | 18 | ~2800 | Strong players |

## Error Handling

- **Stockfish worker fails to load:** Fall back to Pass-and-Play mode. Show a notice: "AI opponent unavailable — playing in two-player mode."
- **Stockfish timeout (>10s):** Apply a random legal move. Show notice: "AI timed out — random move played."
- **Invalid FEN from chatbot:** Fall back to starting position. Log warning.
- **chess.js detects illegal move attempt:** Ignore the click (already handled by only showing legal destinations).

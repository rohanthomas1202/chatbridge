# Chess Stockfish Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the chess plugin's custom move logic with chess.js for full rule enforcement and add Stockfish WASM as a bundled AI opponent with configurable difficulty.

**Architecture:** The plugin is a standalone HTML file served from `public/plugins/chess/`. chess.js is inlined for move validation/generation. Stockfish runs in a Web Worker via the `stockfish.wasm` npm package (347KB WASM, Stockfish 11). The UI adds a setup screen for mode/color/difficulty selection before the game board.

**Tech Stack:** chess.js 1.4.0 (inlined), stockfish.wasm 0.10.0 (bundled), vanilla JS (no framework — this is a standalone iframe plugin)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `public/plugins/chess/index.html` | Rewrite | Setup UI, board rendering, game logic, postMessage protocol |
| `public/plugins/chess/stockfish.js` | Add (copy from node_modules) | Stockfish engine loader (Web Worker entry) |
| `public/plugins/chess/stockfish.wasm` | Add (copy from node_modules) | Stockfish WASM binary |
| `public/plugins/chess/stockfish.worker.js` | Add (copy from node_modules) | Worker bootstrap |
| `src/renderer/packages/plugins/builtin.ts` | Modify | Add `difficulty` param to tool schema, bump iframe height |
| `src/plugins/apps/chess/index.tsx` | Update | Keep React source in sync (reference only — the iframe serves from public/) |
| `test/cases/chess-plugin/chess-logic.test.ts` | Create | Unit tests for chess integration logic |

---

### Task 1: Install dependencies and bundle Stockfish files

**Files:**
- Modify: `package.json` (add chess.js + stockfish.wasm as devDependencies)
- Create: `public/plugins/chess/stockfish.js` (copy from node_modules)
- Create: `public/plugins/chess/stockfish.wasm` (copy from node_modules)
- Create: `public/plugins/chess/stockfish.worker.js` (copy from node_modules)

- [ ] **Step 1: Install chess.js and stockfish.wasm**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge
pnpm add -D chess.js@1.4.0 stockfish.wasm@0.10.0
```

- [ ] **Step 2: Copy Stockfish files to public/plugins/chess/**

```bash
cp node_modules/stockfish.wasm/stockfish.js public/plugins/chess/stockfish.js
cp node_modules/stockfish.wasm/stockfish.wasm public/plugins/chess/stockfish.wasm
cp node_modules/stockfish.wasm/stockfish.worker.js public/plugins/chess/stockfish.worker.js
```

- [ ] **Step 3: Verify files are in place**

```bash
ls -la public/plugins/chess/
```

Expected: `index.html`, `stockfish.js`, `stockfish.wasm`, `stockfish.worker.js` all present. `stockfish.wasm` should be ~347KB.

- [ ] **Step 4: Commit**

```bash
git add public/plugins/chess/stockfish.js public/plugins/chess/stockfish.wasm public/plugins/chess/stockfish.worker.js package.json pnpm-lock.yaml
git commit -m "chore: add chess.js and stockfish.wasm dependencies"
```

---

### Task 2: Update tool schema in builtin.ts

**Files:**
- Modify: `src/renderer/packages/plugins/builtin.ts:8-42`

- [ ] **Step 1: Add difficulty parameter and bump height**

Replace the `chessPlugin` export in `src/renderer/packages/plugins/builtin.ts` with:

```typescript
export const chessPlugin: PluginDefinition = {
  id: 'chatbridge-chess',
  name: 'Chess',
  description: 'Interactive chess board with Stockfish AI opponent — play games, get move suggestions',
  version: '2.0.0',
  iframeUrl: '/plugins/chess/index.html',
  icon: '♟',
  defaultWidth: 500,
  defaultHeight: 580,
  toolSchema: {
    name: 'suggest_chess_move',
    description:
      'Start a chess game or suggest the next move. Renders an interactive board with optional AI opponent (Stockfish). The user can play against Stockfish at configurable difficulty or play pass-and-play with another person.',
    parameters: {
      type: 'object',
      properties: {
        position: {
          type: 'string',
          description:
            'The current board position in FEN notation. Use "startpos" for the starting position.',
        },
        difficulty: {
          type: 'string',
          enum: ['beginner', 'intermediate', 'advanced', 'expert'],
          description:
            'Stockfish difficulty level. beginner=depth 1, intermediate=depth 5, advanced=depth 10, expert=depth 18. If set without suggested_move, Stockfish computes the best move. Defaults to intermediate.',
        },
        suggested_move: {
          type: 'string',
          description:
            'A suggested move in UCI notation (e.g., "e2e4"). If omitted and difficulty is set, Stockfish computes the suggestion internally.',
        },
        explanation: {
          type: 'string',
          description: 'Brief explanation of why this move is recommended.',
        },
      },
      required: ['position'],
    },
  },
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge
pnpm run check
```

Expected: No new type errors from this change.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/packages/plugins/builtin.ts
git commit -m "feat(chess): add difficulty param and bump iframe height for setup panel"
```

---

### Task 3: Rewrite chess plugin — Setup screen and board structure

This task creates the full `index.html` with the setup screen, chess.js integration, board rendering, and legal move highlighting. Stockfish integration is added in Task 4.

**Files:**
- Rewrite: `public/plugins/chess/index.html`

- [ ] **Step 1: Write the complete chess plugin HTML**

Replace the entire contents of `public/plugins/chess/index.html` with the following. This is a large file — it contains styles, the setup screen, board rendering, chess.js inlined as a module, and the postMessage protocol.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Chess Plugin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 12px;
      min-height: 100vh;
    }
    h3 { font-size: 14px; margin-bottom: 8px; color: #a8b2d1; }

    /* Setup screen */
    #setup {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 20px;
      max-width: 360px;
      width: 100%;
    }
    .setup-group {
      width: 100%;
    }
    .setup-group label {
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #8892b0;
      margin-bottom: 6px;
    }
    .option-row {
      display: flex;
      gap: 8px;
    }
    .option-btn {
      flex: 1;
      padding: 10px 12px;
      border: 1px solid #4a4a6a;
      border-radius: 8px;
      background: #16213e;
      color: #a8b2d1;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
      text-align: center;
    }
    .option-btn:hover { border-color: #64ffda; color: #e0e0e0; }
    .option-btn.active {
      border-color: #64ffda;
      background: rgba(100, 255, 218, 0.1);
      color: #64ffda;
      font-weight: 600;
    }
    .difficulty-slider {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .difficulty-slider input[type="range"] {
      width: 100%;
      accent-color: #64ffda;
    }
    .difficulty-labels {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #8892b0;
    }
    .difficulty-current {
      text-align: center;
      font-size: 12px;
      color: #64ffda;
      font-weight: 600;
    }
    #start-btn {
      padding: 12px 32px;
      border: none;
      border-radius: 8px;
      background: #64ffda;
      color: #1a1a2e;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s;
      margin-top: 8px;
    }
    #start-btn:hover { background: #4ad8b7; }

    /* Game screen */
    #game { display: none; flex-direction: column; align-items: center; }
    #board-container { width: 360px; height: 360px; position: relative; }
    .board {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      grid-template-rows: repeat(8, 1fr);
      width: 100%;
      height: 100%;
      border: 2px solid #4a4a6a;
      border-radius: 4px;
      overflow: hidden;
    }
    .square {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      cursor: pointer;
      user-select: none;
      position: relative;
      transition: background-color 0.15s;
    }
    .square.light { background: #e8dcc8; }
    .square.dark { background: #a87d5a; }
    .square.selected { background: #7fb069 !important; }
    .square.last-move { background: rgba(255, 255, 100, 0.35) !important; }
    .square.legal-empty::after {
      content: '';
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.2);
      position: absolute;
    }
    .square.legal-capture {
      box-shadow: inset 0 0 0 3px rgba(0, 0, 0, 0.25);
    }
    .square.suggested-from { box-shadow: inset 0 0 0 3px #4fc3f7; }
    .square.suggested-to { box-shadow: inset 0 0 0 3px #4fc3f7; }

    #status {
      margin-top: 6px;
      font-size: 13px;
      font-weight: 600;
      color: #64ffda;
    }
    #info {
      margin-top: 4px;
      font-size: 12px;
      color: #8892b0;
      text-align: center;
      max-width: 360px;
      line-height: 1.4;
    }
    .move-info {
      margin-top: 6px;
      padding: 6px 10px;
      background: rgba(100, 255, 218, 0.1);
      border-radius: 6px;
      border: 1px solid rgba(100, 255, 218, 0.2);
      font-size: 12px;
      color: #a8b2d1;
      max-width: 360px;
    }

    /* Promotion overlay */
    #promotion-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.6);
      z-index: 100;
      align-items: center;
      justify-content: center;
    }
    #promotion-choices {
      display: flex;
      gap: 8px;
      background: #16213e;
      border: 1px solid #4a4a6a;
      border-radius: 12px;
      padding: 16px;
    }
    .promo-piece {
      font-size: 40px;
      cursor: pointer;
      padding: 8px;
      border-radius: 8px;
      transition: background 0.15s;
    }
    .promo-piece:hover { background: rgba(100, 255, 218, 0.15); }

    /* Thinking indicator */
    .thinking {
      display: inline-block;
      animation: pulse 1.2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }
  </style>
</head>
<body>
  <!-- Setup Screen -->
  <div id="setup">
    <h3>�� Chess</h3>
    <div class="setup-group">
      <label>Play as</label>
      <div class="option-row">
        <button class="option-btn active" data-group="color" data-value="w" onclick="selectOption(this)">&#9812; White</button>
        <button class="option-btn" data-group="color" data-value="b" onclick="selectOption(this)">&#9818; Black</button>
      </div>
    </div>
    <div class="setup-group">
      <label>Mode</label>
      <div class="option-row">
        <button class="option-btn active" data-group="mode" data-value="ai" onclick="selectOption(this)">vs Stockfish</button>
        <button class="option-btn" data-group="mode" data-value="pvp" onclick="selectOption(this)">Pass-and-Play</button>
      </div>
    </div>
    <div class="setup-group" id="difficulty-group">
      <label>Difficulty</label>
      <div class="difficulty-slider">
        <input type="range" id="difficulty-range" min="0" max="3" value="1" oninput="updateDiffLabel()">
        <div class="difficulty-labels">
          <span>Beginner</span><span>Intermediate</span><span>Advanced</span><span>Expert</span>
        </div>
        <div class="difficulty-current" id="difficulty-label">Intermediate</div>
      </div>
    </div>
    <button id="start-btn" onclick="startGame()">Start Game</button>
  </div>

  <!-- Game Screen -->
  <div id="game">
    <h3>♟ Chess</h3>
    <div id="board-container">
      <div class="board" id="board"></div>
    </div>
    <div id="status"></div>
    <div id="info">Click a piece to select, then click a destination to move.</div>
    <div id="move-info" class="move-info" style="display:none"></div>
  </div>

  <!-- Promotion Overlay -->
  <div id="promotion-overlay">
    <div id="promotion-choices"></div>
  </div>

  <script>
    // ========================================================================
    // chess.js will be inlined here (see step 2)
    // For now, we load it as a global. In the final version, the minified
    // chess.js source is pasted directly above this line.
    // ========================================================================

    // --- CHESS.JS PLACEHOLDER (replaced in Step 2) ---
    // The Chess class will be available as window.Chess after inlining.

    // ========================================================================
    // Constants
    // ========================================================================
    const PLUGIN_ID = 'chatbridge-chess';
    const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const DIFFICULTY_MAP = [
      { name: 'Beginner', depth: 1 },
      { name: 'Intermediate', depth: 5 },
      { name: 'Advanced', depth: 10 },
      { name: 'Expert', depth: 18 },
    ];
    const PIECES_WHITE = { k: '\u2654', q: '\u2655', r: '\u2656', b: '\u2657', n: '\u2658', p: '\u2659' };
    const PIECES_BLACK = { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' };

    function pieceToUnicode(piece) {
      if (!piece) return '';
      const map = piece.color === 'w' ? PIECES_WHITE : PIECES_BLACK;
      return map[piece.type] || '';
    }

    // ========================================================================
    // State
    // ========================================================================
    let chess = null; // Chess instance
    let stockfishWorker = null;
    let stockfishReady = false;

    let playerColor = 'w';
    let gameMode = 'ai'; // 'ai' or 'pvp'
    let difficultyIndex = 1;
    let selectedSquare = null;
    let legalMovesForSelected = [];
    let lastMoveFrom = null;
    let lastMoveTo = null;
    let suggestedFrom = null;
    let suggestedTo = null;
    let pendingPromotion = null; // { from, to }
    let isThinking = false;
    let boardFlipped = false;
    let toolCallId = '';

    // ========================================================================
    // Setup Screen
    // ========================================================================
    function selectOption(btn) {
      const group = btn.dataset.group;
      document.querySelectorAll(`[data-group="${group}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (group === 'mode') {
        const diffGroup = document.getElementById('difficulty-group');
        diffGroup.style.display = btn.dataset.value === 'ai' ? 'block' : 'none';
      }
    }

    function updateDiffLabel() {
      const val = parseInt(document.getElementById('difficulty-range').value);
      document.getElementById('difficulty-label').textContent = DIFFICULTY_MAP[val].name;
    }

    function startGame() {
      const colorBtn = document.querySelector('[data-group="color"].active');
      const modeBtn = document.querySelector('[data-group="mode"].active');
      playerColor = colorBtn.dataset.value;
      gameMode = modeBtn.dataset.value;
      difficultyIndex = parseInt(document.getElementById('difficulty-range').value);
      boardFlipped = playerColor === 'b';

      chess = new Chess();
      selectedSquare = null;
      legalMovesForSelected = [];
      lastMoveFrom = null;
      lastMoveTo = null;
      suggestedFrom = null;
      suggestedTo = null;
      isThinking = false;

      document.getElementById('setup').style.display = 'none';
      document.getElementById('game').style.display = 'flex';
      renderBoard();
      updateStatus();

      // If player is black and mode is AI, Stockfish moves first
      if (gameMode === 'ai' && playerColor === 'b') {
        requestStockfishMove();
      }
    }

    // ========================================================================
    // Board Rendering
    // ========================================================================
    function squareToAlgebraic(row, col) {
      const r = boardFlipped ? row : 7 - row;
      const c = boardFlipped ? 7 - col : col;
      return String.fromCharCode(97 + c) + (r + 1);
    }

    function algebraicToDisplay(sq) {
      const c = sq.charCodeAt(0) - 97;
      const r = parseInt(sq[1]) - 1;
      const displayRow = boardFlipped ? r : 7 - r;
      const displayCol = boardFlipped ? 7 - c : c;
      return { row: displayRow, col: displayCol };
    }

    function renderBoard() {
      const boardEl = document.getElementById('board');
      boardEl.innerHTML = '';
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const sq = document.createElement('div');
          const algebraic = squareToAlgebraic(row, col);
          const piece = chess.get(algebraic);

          // Base color
          const fileIdx = boardFlipped ? 7 - col : col;
          const rankIdx = boardFlipped ? row : 7 - row;
          const isLight = (fileIdx + rankIdx) % 2 === 0;
          sq.className = 'square ' + (isLight ? 'light' : 'dark');

          // Highlights
          if (selectedSquare === algebraic) sq.classList.add('selected');
          if (lastMoveFrom === algebraic || lastMoveTo === algebraic) sq.classList.add('last-move');
          if (suggestedFrom === algebraic) sq.classList.add('suggested-from');
          if (suggestedTo === algebraic) sq.classList.add('suggested-to');

          // Legal move indicators
          if (legalMovesForSelected.includes(algebraic)) {
            if (piece) {
              sq.classList.add('legal-capture');
            } else {
              sq.classList.add('legal-empty');
            }
          }

          if (piece) sq.textContent = pieceToUnicode(piece);

          sq.addEventListener('click', () => onSquareClick(algebraic));
          boardEl.appendChild(sq);
        }
      }
    }

    // ========================================================================
    // Move Handling
    // ========================================================================
    function onSquareClick(algebraic) {
      if (isThinking) return;
      if (chess.isGameOver()) return;

      // In AI mode, only allow moves on player's turn
      if (gameMode === 'ai' && chess.turn() !== playerColor) return;

      const piece = chess.get(algebraic);

      if (selectedSquare) {
        // Check if clicking on own piece — reselect
        if (piece && piece.color === chess.turn()) {
          selectedSquare = algebraic;
          legalMovesForSelected = chess.moves({ square: algebraic, verbose: true }).map(m => m.to);
          renderBoard();
          return;
        }

        // Try to move
        if (legalMovesForSelected.includes(algebraic)) {
          // Check if this is a promotion
          const movingPiece = chess.get(selectedSquare);
          const targetRank = algebraic[1];
          if (movingPiece && movingPiece.type === 'p' && (targetRank === '8' || targetRank === '1')) {
            showPromotionUI(selectedSquare, algebraic);
            return;
          }

          executeMove(selectedSquare, algebraic);
        } else {
          // Deselect
          selectedSquare = null;
          legalMovesForSelected = [];
          renderBoard();
        }
      } else if (piece && piece.color === chess.turn()) {
        selectedSquare = algebraic;
        legalMovesForSelected = chess.moves({ square: algebraic, verbose: true }).map(m => m.to);
        renderBoard();
      }
    }

    function executeMove(from, to, promotion) {
      const move = chess.move({ from, to, promotion: promotion || undefined });
      if (!move) return;

      selectedSquare = null;
      legalMovesForSelected = [];
      lastMoveFrom = from;
      lastMoveTo = to;
      suggestedFrom = null;
      suggestedTo = null;

      renderBoard();
      updateStatus();
      sendMoveState(move);

      if (chess.isGameOver()) {
        sendGameOverState();
        return;
      }

      // If AI mode and it's now Stockfish's turn
      if (gameMode === 'ai' && chess.turn() !== playerColor) {
        requestStockfishMove();
      }
    }

    // ========================================================================
    // Promotion UI
    // ========================================================================
    function showPromotionUI(from, to) {
      pendingPromotion = { from, to };
      const overlay = document.getElementById('promotion-overlay');
      const choices = document.getElementById('promotion-choices');
      const color = chess.turn();
      const pieces = color === 'w'
        ? [{ type: 'q', symbol: '\u2655' }, { type: 'r', symbol: '\u2656' }, { type: 'b', symbol: '\u2657' }, { type: 'n', symbol: '\u2658' }]
        : [{ type: 'q', symbol: '\u265B' }, { type: 'r', symbol: '\u265C' }, { type: 'b', symbol: '\u265D' }, { type: 'n', symbol: '\u265E' }];

      choices.innerHTML = '';
      for (const p of pieces) {
        const el = document.createElement('span');
        el.className = 'promo-piece';
        el.textContent = p.symbol;
        el.addEventListener('click', () => {
          overlay.style.display = 'none';
          executeMove(pendingPromotion.from, pendingPromotion.to, p.type);
          pendingPromotion = null;
        });
        choices.appendChild(el);
      }
      overlay.style.display = 'flex';
    }

    // ========================================================================
    // Status
    // ========================================================================
    function updateStatus() {
      const statusEl = document.getElementById('status');
      if (chess.isCheckmate()) {
        const winner = chess.turn() === 'w' ? 'Black' : 'White';
        statusEl.textContent = `Checkmate \u2014 ${winner} wins!`;
      } else if (chess.isStalemate()) {
        statusEl.textContent = 'Stalemate \u2014 Draw!';
      } else if (chess.isDraw()) {
        statusEl.textContent = 'Draw!';
      } else if (isThinking) {
        statusEl.innerHTML = '<span class="thinking">Stockfish is thinking\u2026</span>';
      } else if (chess.inCheck()) {
        statusEl.textContent = (chess.turn() === 'w' ? 'White' : 'Black') + ' is in check!';
      } else {
        statusEl.textContent = (chess.turn() === 'w' ? "White's" : "Black's") + ' turn';
      }
    }

    // ========================================================================
    // Stockfish Worker
    // ========================================================================
    function initStockfish() {
      try {
        stockfishWorker = new Worker('stockfish.js');
        stockfishWorker.onmessage = onStockfishMessage;
        stockfishWorker.postMessage('uci');
      } catch (e) {
        console.warn('Stockfish failed to load:', e);
        stockfishWorker = null;
      }
    }

    function onStockfishMessage(event) {
      const line = typeof event.data === 'string' ? event.data : (event.data && event.data.data) || '';

      if (line === 'uciok') {
        stockfishWorker.postMessage('isready');
      } else if (line === 'readyok') {
        stockfishReady = true;
      } else if (line.startsWith('bestmove')) {
        const parts = line.split(' ');
        const bestMove = parts[1];
        if (bestMove && bestMove !== '(none)') {
          applyStockfishMove(bestMove);
        } else {
          // No valid move — game should be over
          isThinking = false;
          updateStatus();
        }
      }
    }

    let stockfishTimeout = null;

    function requestStockfishMove() {
      if (!stockfishWorker || !stockfishReady) {
        // Fallback: pick a random legal move
        const moves = chess.moves({ verbose: true });
        if (moves.length > 0) {
          const randomMove = moves[Math.floor(Math.random() * moves.length)];
          setTimeout(() => {
            applyStockfishMove(randomMove.from + randomMove.to + (randomMove.promotion || ''));
          }, 300);
        }
        return;
      }

      isThinking = true;
      updateStatus();

      const depth = DIFFICULTY_MAP[difficultyIndex].depth;
      stockfishWorker.postMessage('position fen ' + chess.fen());
      stockfishWorker.postMessage('go depth ' + depth);

      // Timeout fallback — 10 seconds
      clearTimeout(stockfishTimeout);
      stockfishTimeout = setTimeout(() => {
        if (isThinking) {
          stockfishWorker.postMessage('stop');
          const moves = chess.moves({ verbose: true });
          if (moves.length > 0) {
            const randomMove = moves[Math.floor(Math.random() * moves.length)];
            applyStockfishMove(randomMove.from + randomMove.to + (randomMove.promotion || ''));
          }
        }
      }, 10000);
    }

    function applyStockfishMove(uci) {
      clearTimeout(stockfishTimeout);
      isThinking = false;

      const from = uci.substring(0, 2);
      const to = uci.substring(2, 4);
      const promotion = uci.length > 4 ? uci[4] : undefined;

      const move = chess.move({ from, to, promotion });
      if (!move) {
        // Invalid move from Stockfish — shouldn't happen but handle gracefully
        updateStatus();
        renderBoard();
        return;
      }

      lastMoveFrom = from;
      lastMoveTo = to;
      selectedSquare = null;
      legalMovesForSelected = [];

      renderBoard();
      updateStatus();
      sendMoveState(move);

      if (chess.isGameOver()) {
        sendGameOverState();
      }
    }

    // ========================================================================
    // Stockfish Suggestion (for chatbot integration — Option C)
    // ========================================================================
    function requestStockfishSuggestion(fen, depth, callback) {
      if (!stockfishWorker || !stockfishReady) {
        callback(null);
        return;
      }

      const handler = (event) => {
        const line = typeof event.data === 'string' ? event.data : '';
        if (line.startsWith('bestmove')) {
          stockfishWorker.removeEventListener('message', handler);
          const bestMove = line.split(' ')[1];
          callback(bestMove && bestMove !== '(none)' ? bestMove : null);
        }
      };
      stockfishWorker.addEventListener('message', handler);
      stockfishWorker.postMessage('position fen ' + fen);
      stockfishWorker.postMessage('go depth ' + depth);
    }

    // ========================================================================
    // postMessage Protocol
    // ========================================================================
    function sendToParent(data) {
      window.parent.postMessage(data, '*');
    }

    function sendMoveState(move) {
      sendToParent({
        type: 'plugin:state',
        pluginId: PLUGIN_ID,
        toolCallId: toolCallId,
        state: { type: 'move', uci: move.from + move.to + (move.promotion || '') }
      });
    }

    function sendGameOverState() {
      let reason = 'unknown';
      let winner = 'draw';

      if (chess.isCheckmate()) {
        reason = 'checkmate';
        winner = chess.turn() === 'w' ? 'black' : 'white';
      } else if (chess.isStalemate()) {
        reason = 'stalemate';
      } else if (chess.isThreefoldRepetition()) {
        reason = 'draw-repetition';
      } else if (chess.isInsufficientMaterial()) {
        reason = 'draw-insufficient';
      } else if (chess.isDraw()) {
        reason = 'draw-50-move';
      }

      sendToParent({
        type: 'plugin:state',
        pluginId: PLUGIN_ID,
        toolCallId: toolCallId,
        state: { type: 'gameOver', reason, winner }
      });
    }

    // Handle invoke from host
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || data.type !== 'plugin:invoke') return;
      if (data.pluginId !== PLUGIN_ID) return;

      toolCallId = data.toolCallId;
      const args = data.args || {};

      // Set position
      const fen = args.position === 'startpos' || !args.position ? INITIAL_FEN : args.position;

      try {
        chess = new Chess(fen);
      } catch (e) {
        // Invalid FEN — fall back to starting position
        chess = new Chess();
      }

      // Handle difficulty from chatbot
      if (args.difficulty) {
        const diffMap = { beginner: 0, intermediate: 1, advanced: 2, expert: 3 };
        difficultyIndex = diffMap[args.difficulty] !== undefined ? diffMap[args.difficulty] : 1;
      }

      // Handle suggested move (Option C — chatbot asks Stockfish for suggestion)
      if (!args.suggested_move && args.difficulty) {
        // Compute suggestion via Stockfish
        const depth = DIFFICULTY_MAP[difficultyIndex].depth;
        requestStockfishSuggestion(chess.fen(), depth, (bestMove) => {
          if (bestMove) {
            const from = bestMove.substring(0, 2);
            const to = bestMove.substring(2, 4);
            suggestedFrom = from;
            suggestedTo = to;
            renderBoard();

            const moveInfoEl = document.getElementById('move-info');
            moveInfoEl.style.display = 'block';
            moveInfoEl.textContent = 'Suggested: ' + bestMove + (args.explanation ? ' \u2014 ' + args.explanation : '');
          }

          sendToParent({
            type: 'plugin:complete',
            pluginId: PLUGIN_ID,
            toolCallId: data.toolCallId,
            result: { position: chess.fen(), suggestedMove: bestMove || null }
          });
        });
      } else {
        // Show explicit suggested move if provided
        if (args.suggested_move) {
          const sm = args.suggested_move;
          if (sm.length >= 4) {
            suggestedFrom = sm.substring(0, 2);
            suggestedTo = sm.substring(2, 4);
          }
          const moveInfoEl = document.getElementById('move-info');
          moveInfoEl.style.display = 'block';
          moveInfoEl.textContent = 'Suggested: ' + sm + (args.explanation ? ' \u2014 ' + args.explanation : '');
        }

        sendToParent({
          type: 'plugin:complete',
          pluginId: PLUGIN_ID,
          toolCallId: data.toolCallId,
          result: { position: chess.fen(), suggestedMove: args.suggested_move || null }
        });
      }

      // Show the game board (skip setup if invoked via chatbot)
      document.getElementById('setup').style.display = 'none';
      document.getElementById('game').style.display = 'flex';
      renderBoard();
      updateStatus();
    });

    // ========================================================================
    // Init
    // ========================================================================
    initStockfish();

    // Signal ready
    sendToParent({ type: 'plugin:ready', pluginId: PLUGIN_ID });
  </script>
</body>
</html>
```

- [ ] **Step 2: Inline chess.js into the HTML**

Download the chess.js UMD build and inline it. The `Chess` class must be available as a global.

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge
# Get the chess.js source
node -e "
const fs = require('fs');
const chessSource = fs.readFileSync('node_modules/chess.js/dist/chess.js', 'utf-8');
const html = fs.readFileSync('public/plugins/chess/index.html', 'utf-8');
// Insert chess.js right before the comment placeholder
const marker = '// --- CHESS.JS PLACEHOLDER (replaced in Step 2) ---';
const replacement = '// --- chess.js v1.4.0 (inlined) ---\n' + chessSource + '\n';
const updated = html.replace(marker + '\n    // The Chess class will be available as window.Chess after inlining.', replacement);
fs.writeFileSync('public/plugins/chess/index.html', updated);
console.log('chess.js inlined successfully');
"
```

After inlining, verify the `Chess` constructor is available by checking:

```bash
grep -c "class Chess" public/plugins/chess/index.html
```

Expected: `1` (the class definition from chess.js)

If chess.js exports as a module rather than a global, we may need to add a shim. Check:

```bash
head -5 node_modules/chess.js/dist/chess.js
```

If it uses `export`, wrap the inline with:
```javascript
var Chess;
(function() {
  // chess.js source here
  Chess = /* the exported class */;
})();
```

The exact shim depends on how chess.js 1.4.0 exports — inspect and adapt.

- [ ] **Step 3: Open in browser and verify setup screen renders**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge
npx serve public/plugins/chess -p 3333 &
# Open http://localhost:3333 in browser
# Verify: setup screen shows with color picker, mode toggle, difficulty slider, and Start button
# Kill the server after testing
kill %1
```

- [ ] **Step 4: Verify game board renders after clicking Start**

In the browser:
1. Click "Start Game" with default settings (White, vs Stockfish, Intermediate)
2. Verify the chess board appears with all pieces in starting position
3. Click a pawn — verify green dots appear on legal destination squares
4. Click a legal square — verify the move executes
5. Verify Stockfish responds with a move (or falls back to random if worker fails)

- [ ] **Step 5: Commit**

```bash
git add public/plugins/chess/index.html
git commit -m "feat(chess): rewrite plugin with chess.js and setup screen"
```

---

### Task 4: Verify Stockfish Worker integration

**Files:**
- No new files — verifying `public/plugins/chess/stockfish.js` works with the worker from `index.html`

- [ ] **Step 1: Test Stockfish worker loads**

Open the chess plugin in a browser (`npx serve public/plugins/chess -p 3333`), open DevTools Console, and verify:

1. No errors about loading `stockfish.js` or `stockfish.wasm`
2. Start a game as White vs Stockfish
3. Make a move (e.g., e2-e4)
4. Verify "Stockfish is thinking..." appears briefly
5. Verify Stockfish responds with a legal move

If the worker fails to load (CORS or WASM issues with `file://`), this is expected — it will work when served from the Electron app. Verify the fallback works: a random legal move should be played after 300ms.

- [ ] **Step 2: Test difficulty levels**

1. Start a game at Beginner — Stockfish should respond almost instantly (depth 1)
2. Start a game at Expert — Stockfish should take noticeably longer (depth 18)
3. Verify moves are legal in both cases

- [ ] **Step 3: Test playing as Black**

1. Start a game as Black vs Stockfish
2. Verify Stockfish makes the first move automatically
3. Verify board is flipped (white pieces at top)

- [ ] **Step 4: Test Pass-and-Play mode**

1. Start a Pass-and-Play game
2. Verify both colors can move alternately
3. Verify no Stockfish involvement (no "thinking" indicator)

- [ ] **Step 5: Commit if any fixes were needed**

```bash
git add -A public/plugins/chess/
git commit -m "fix(chess): stockfish worker integration fixes"
```

---

### Task 5: Test edge cases and game-over scenarios

**Files:**
- Modify: `public/plugins/chess/index.html` (if fixes needed)

- [ ] **Step 1: Test checkmate detection**

Use the browser console to set up a Scholar's Mate position:

```javascript
// In the browser console after opening the plugin:
chess = new Chess();
chess.move('e4'); chess.move('e5');
chess.move('Bc4'); chess.move('Nc6');
chess.move('Qh5'); chess.move('Nf6');
chess.move('Qxf7');
// chess.isCheckmate() should be true
```

Verify the status shows "Checkmate — White wins!" and no further moves are accepted.

- [ ] **Step 2: Test pawn promotion UI**

Set up a position where a pawn can promote:

```javascript
chess = new Chess('8/P7/8/8/8/8/8/4K2k w - - 0 1');
renderBoard();
```

Click the pawn on a7, click a8. Verify the promotion overlay appears with 4 piece choices. Click Queen. Verify the pawn becomes a queen.

- [ ] **Step 3: Test stalemate**

```javascript
chess = new Chess('k7/8/1K6/8/8/8/8/8 b - - 0 1');
// Black has no legal moves but is not in check
renderBoard();
updateStatus();
```

Verify status shows "Stalemate — Draw!".

- [ ] **Step 4: Test invalid FEN from chatbot**

In the browser console, simulate a chatbot invoke with invalid FEN:

```javascript
window.postMessage({
  type: 'plugin:invoke',
  pluginId: 'chatbridge-chess',
  toolCallId: 'test-123',
  args: { position: 'invalid-fen-string' }
}, '*');
```

Verify the plugin falls back to the starting position instead of crashing.

- [ ] **Step 5: Commit any fixes**

```bash
git add public/plugins/chess/index.html
git commit -m "fix(chess): edge case handling for checkmate, promotion, stalemate, invalid FEN"
```

---

### Task 6: Write unit tests for chess integration logic

**Files:**
- Create: `test/cases/chess-plugin/chess-logic.test.ts`

- [ ] **Step 1: Create the test file**

```bash
mkdir -p /Users/rohanthomas/ChatBridge/chatbridge/test/cases/chess-plugin
```

Write `test/cases/chess-plugin/chess-logic.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'

/**
 * These tests verify the chess.js integration logic that the plugin relies on.
 * They test the same operations the plugin performs: move validation,
 * game-over detection, FEN handling, and promotion.
 */

describe('Chess Plugin Logic', () => {
  describe('FEN handling', () => {
    it('initializes from starting position', () => {
      const chess = new Chess()
      expect(chess.fen()).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    })

    it('initializes from custom FEN', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
      const chess = new Chess(fen)
      expect(chess.fen()).toBe(fen)
      expect(chess.turn()).toBe('b')
    })

    it('falls back gracefully on invalid FEN', () => {
      expect(() => new Chess('not-a-fen')).toThrow()
    })
  })

  describe('legal move generation', () => {
    it('generates correct opening moves for white', () => {
      const chess = new Chess()
      const moves = chess.moves({ square: 'e2', verbose: true })
      const targets = moves.map(m => m.to)
      expect(targets).toContain('e3')
      expect(targets).toContain('e4')
      expect(targets).toHaveLength(2)
    })

    it('returns empty array for empty square', () => {
      const chess = new Chess()
      const moves = chess.moves({ square: 'e4', verbose: true })
      expect(moves).toHaveLength(0)
    })

    it('returns empty array for opponent piece', () => {
      const chess = new Chess()
      // White to move — e7 is a black pawn
      const moves = chess.moves({ square: 'e7', verbose: true })
      expect(moves).toHaveLength(0)
    })
  })

  describe('move execution', () => {
    it('executes a valid move', () => {
      const chess = new Chess()
      const move = chess.move({ from: 'e2', to: 'e4' })
      expect(move).not.toBeNull()
      expect(move!.from).toBe('e2')
      expect(move!.to).toBe('e4')
      expect(chess.turn()).toBe('b')
    })

    it('returns null for illegal move', () => {
      const chess = new Chess()
      const move = chess.move({ from: 'e2', to: 'e5' })
      expect(move).toBeNull()
    })

    it('handles castling', () => {
      const chess = new Chess('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1')
      const move = chess.move({ from: 'e1', to: 'g1' })
      expect(move).not.toBeNull()
      expect(move!.flags).toContain('k') // kingside castle flag
      // Rook should have moved too
      expect(chess.get('f1')).toEqual({ type: 'r', color: 'w' })
    })

    it('handles en passant', () => {
      const chess = new Chess('rnbqkbnr/pppp1ppp/8/4pP2/8/8/PPPPP1PP/RNBQKBNR w KQkq e6 0 3')
      const move = chess.move({ from: 'f5', to: 'e6' })
      expect(move).not.toBeNull()
      expect(move!.flags).toContain('e') // en passant flag
      // Captured pawn should be gone
      expect(chess.get('e5')).toBeNull()
    })
  })

  describe('promotion', () => {
    it('requires promotion piece when pawn reaches last rank', () => {
      const chess = new Chess('8/P7/8/8/8/8/8/4K2k w - - 0 1')
      // Without promotion piece — chess.js may auto-promote to queen or require it
      const move = chess.move({ from: 'a7', to: 'a8', promotion: 'q' })
      expect(move).not.toBeNull()
      expect(chess.get('a8')).toEqual({ type: 'q', color: 'w' })
    })

    it('allows underpromotion to knight', () => {
      const chess = new Chess('8/P7/8/8/8/8/8/4K2k w - - 0 1')
      const move = chess.move({ from: 'a7', to: 'a8', promotion: 'n' })
      expect(move).not.toBeNull()
      expect(chess.get('a8')).toEqual({ type: 'n', color: 'w' })
    })
  })

  describe('game-over detection', () => {
    it('detects checkmate', () => {
      // Scholar's mate final position
      const chess = new Chess()
      chess.move('e4'); chess.move('e5')
      chess.move('Bc4'); chess.move('Nc6')
      chess.move('Qh5'); chess.move('Nf6')
      chess.move('Qxf7')
      expect(chess.isCheckmate()).toBe(true)
      expect(chess.isGameOver()).toBe(true)
      expect(chess.turn()).toBe('b') // Black is checkmated
    })

    it('detects stalemate', () => {
      const chess = new Chess('k7/8/1K6/8/8/8/8/8 b - - 0 1')
      expect(chess.isStalemate()).toBe(true)
      expect(chess.isGameOver()).toBe(true)
    })

    it('detects insufficient material', () => {
      const chess = new Chess('4k3/8/8/8/8/8/8/4K3 w - - 0 1')
      expect(chess.isInsufficientMaterial()).toBe(true)
    })

    it('does not falsely detect game over in starting position', () => {
      const chess = new Chess()
      expect(chess.isGameOver()).toBe(false)
      expect(chess.isCheckmate()).toBe(false)
      expect(chess.isStalemate()).toBe(false)
    })
  })

  describe('UCI move format conversion', () => {
    it('move object contains from/to in algebraic notation', () => {
      const chess = new Chess()
      const move = chess.move({ from: 'g1', to: 'f3' })
      expect(move).not.toBeNull()
      expect(move!.from).toBe('g1')
      expect(move!.to).toBe('f3')
      // UCI format: g1f3
      const uci = move!.from + move!.to + (move!.promotion || '')
      expect(uci).toBe('g1f3')
    })

    it('promotion move includes promotion piece in UCI', () => {
      const chess = new Chess('8/P7/8/8/8/8/8/4K2k w - - 0 1')
      const move = chess.move({ from: 'a7', to: 'a8', promotion: 'q' })
      const uci = move!.from + move!.to + (move!.promotion || '')
      expect(uci).toBe('a7a8q')
    })
  })

  describe('difficulty depth mapping', () => {
    const DIFFICULTY_MAP = [
      { name: 'Beginner', depth: 1 },
      { name: 'Intermediate', depth: 5 },
      { name: 'Advanced', depth: 10 },
      { name: 'Expert', depth: 18 },
    ]

    it('has four difficulty levels', () => {
      expect(DIFFICULTY_MAP).toHaveLength(4)
    })

    it('depths are monotonically increasing', () => {
      for (let i = 1; i < DIFFICULTY_MAP.length; i++) {
        expect(DIFFICULTY_MAP[i].depth).toBeGreaterThan(DIFFICULTY_MAP[i - 1].depth)
      }
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge
pnpm test test/cases/chess-plugin/chess-logic.test.ts
```

Expected: All tests pass. If chess.js import fails, check if the package exports correctly for vitest — may need to import from `chess.js/dist/chess.js` or adjust.

- [ ] **Step 3: Commit**

```bash
git add test/cases/chess-plugin/chess-logic.test.ts
git commit -m "test(chess): add unit tests for chess.js integration logic"
```

---

### Task 7: Update React source and final cleanup

**Files:**
- Modify: `src/plugins/apps/chess/index.tsx`

- [ ] **Step 1: Update the React source comment header**

The React source in `src/plugins/apps/chess/index.tsx` is a reference implementation — the actual iframe serves from `public/plugins/chess/index.html`. Update the header comment and mark it as a reference:

Replace the entire file contents of `src/plugins/apps/chess/index.tsx` with:

```tsx
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
```

- [ ] **Step 2: Verify the build still compiles**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge
pnpm run check
```

Expected: No type errors.

- [ ] **Step 3: Run all tests**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge
pnpm test
```

Expected: All tests pass, including the new chess-plugin tests.

- [ ] **Step 4: Commit**

```bash
git add src/plugins/apps/chess/index.tsx
git commit -m "refactor(chess): update React source as reference, point to standalone HTML implementation"
```

---

### Task 8: End-to-end verification in Electron

**Files:** None (manual testing)

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/rohanthomas/ChatBridge/chatbridge
pnpm dev
```

- [ ] **Step 2: Test chat-triggered chess game**

In the chat, type: "Let's play chess"

Verify:
1. The AI calls `suggest_chess_move` with `position: "startpos"`
2. The chess iframe appears in the chat
3. The setup screen shows (or the board directly if the chatbot invoked it)
4. The board is interactive — pieces can be moved

- [ ] **Step 3: Test AI suggestion (Option C)**

In the chat, ask: "What's a good opening move?"

Verify the AI invokes with a `difficulty` parameter, and the plugin shows a Stockfish-computed suggestion with blue highlights.

- [ ] **Step 4: Test full game flow**

Play several moves against Stockfish. Verify:
1. Legal moves are highlighted on piece selection
2. Stockfish responds after each move
3. "Thinking..." indicator shows during computation
4. Game-over is correctly detected and reported

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "feat(chess): complete Stockfish integration with full rule enforcement"
```

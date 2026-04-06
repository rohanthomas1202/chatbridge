import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'

describe('Chess Plugin Logic', () => {
  describe('FEN handling', () => {
    it('initializes from starting position', () => {
      const chess = new Chess()
      expect(chess.fen()).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    })

    it('initializes from custom FEN', () => {
      // chess.js normalizes en passant square when no capture is possible
      const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
      const chess = new Chess(fen)
      // The board position and turn are correct even if ep square is normalized
      expect(chess.turn()).toBe('b')
      expect(chess.get('e4')).toEqual({ type: 'p', color: 'w' })
    })

    it('throws on invalid FEN', () => {
      expect(() => new Chess('not-a-fen')).toThrow()
    })
  })

  describe('legal move generation', () => {
    it('generates correct opening moves for e2 pawn', () => {
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

    it('returns empty array for opponent piece on your turn', () => {
      const chess = new Chess()
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

    it('throws for illegal move', () => {
      const chess = new Chess()
      // chess.js v1.4.0 throws an error for illegal moves rather than returning null
      expect(() => chess.move({ from: 'e2', to: 'e5' })).toThrow()
    })

    it('handles castling', () => {
      const chess = new Chess('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1')
      const move = chess.move({ from: 'e1', to: 'g1' })
      expect(move).not.toBeNull()
      expect(move!.flags).toContain('k')
      expect(chess.get('f1')).toEqual({ type: 'r', color: 'w' })
    })

    it('handles en passant', () => {
      const chess = new Chess('rnbqkbnr/pppp1ppp/8/4pP2/8/8/PPPPP1PP/RNBQKBNR w KQkq e6 0 3')
      const move = chess.move({ from: 'f5', to: 'e6' })
      expect(move).not.toBeNull()
      expect(move!.flags).toContain('e')
      // chess.js returns undefined (not null) for empty squares
      expect(chess.get('e5')).toBeUndefined()
    })
  })

  describe('promotion', () => {
    it('promotes pawn to queen', () => {
      const chess = new Chess('8/P7/8/8/8/8/8/4K2k w - - 0 1')
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
    it('detects checkmate (scholars mate)', () => {
      const chess = new Chess()
      chess.move('e4'); chess.move('e5')
      chess.move('Bc4'); chess.move('Nc6')
      chess.move('Qh5'); chess.move('Nf6')
      chess.move('Qxf7')
      expect(chess.isCheckmate()).toBe(true)
      expect(chess.isGameOver()).toBe(true)
      expect(chess.turn()).toBe('b')
    })

    it('detects stalemate', () => {
      // Black king on a8 with white queen on c7 and white king on b6 = stalemate
      const chess = new Chess('k7/2Q5/1K6/8/8/8/8/8 b - - 0 1')
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

  describe('UCI move format', () => {
    it('move object contains from/to for UCI construction', () => {
      const chess = new Chess()
      const move = chess.move({ from: 'g1', to: 'f3' })
      const uci = move!.from + move!.to + (move!.promotion || '')
      expect(uci).toBe('g1f3')
    })

    it('promotion move includes piece in UCI', () => {
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

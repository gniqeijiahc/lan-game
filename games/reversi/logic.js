// 黑白棋规则（纯函数）。棋盘是长度 64 的数组：-1 空、0 黑、1 白。
export const SIZE = 8
export const BLACK = 0, WHITE = 1, EMPTY = -1
const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]

export function initialBoard() {
  const b = Array(SIZE * SIZE).fill(EMPTY)
  b[27] = b[36] = WHITE
  b[28] = b[35] = BLACK
  return b
}

// who 下在 idx 会翻掉哪些子；空数组表示这里不能下
export function flipsFor(board, idx, who) {
  if (board[idx] !== EMPTY) return []
  const r0 = Math.floor(idx / SIZE), c0 = idx % SIZE, out = []
  for (const [dr, dc] of DIRS) {
    const line = []
    let r = r0 + dr, c = c0 + dc
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === 1 - who) {
      line.push(r * SIZE + c); r += dr; c += dc
    }
    if (line.length && r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === who) out.push(...line)
  }
  return out
}

export const legalMoves = (board, who) =>
  board.map((_, i) => i).filter(i => flipsFor(board, i, who).length)

export const count = (board, who) => board.filter(v => v === who).length

// 下完一步后轮到谁：对方能下就换对方；对方不能下则跳过；双方都不能下返回 null（终局）
export function nextTurn(board, justMoved) {
  if (legalMoves(board, 1 - justMoved).length) return {turn: 1 - justMoved, passed: false}
  if (legalMoves(board, justMoved).length) return {turn: justMoved, passed: true}
  return null
}

// 游戏清单：大厅从这里读取。新增游戏就在数组里加一项。
//   min / max：玩家人数范围。超出 max 的人会成为观战者。
export const GAMES = [
  {id: 'rps', icon: '✊✌️✋', name: '剪刀石头布', desc: '经典猜拳，双方同时揭晓，防偷看', players: '2 人', min: 2, max: 2, path: 'games/rps/'},
  {id: 'connect-four', icon: '🔴🟡', name: '四子棋', desc: '轮流投子，横竖斜连成 4 个就赢', players: '2 人', min: 2, max: 2, path: 'games/connect-four/'},
  {id: 'draw', icon: '🎨', name: '你画我猜', desc: '大家轮流画，其他人抢着猜，每局 90 秒，猜得越快分越高', players: '2–10 人', min: 2, max: 10, path: 'games/draw/'},
  {id: 'quoridor', icon: '🧱', name: '步步为营', desc: '先走到对岸就赢，还能放挡板拦路（Quoridor）', players: '2 人', min: 2, max: 2, path: 'games/quoridor/'},
  {id: 'secret-word', icon: '🔮', name: '秘密词', desc: '大家一起猜同一个 4–8 字的秘密词，每次猜测都显示相关度百分比（由房主的 Jina API 计算）', players: '1–10 人 · 合作猜词', min: 1, max: 10, path: 'games/secret-word/'},
  {id: 'middle-word', icon: '🌉', name: '中间词', desc: '大家和 AI 同时说一个词，说到一起就得分；没说到一起时，AI 会想一个"中间词"当作下一轮的词。一个人也能和 AI 对玩', players: '1–10 人 · 默契对战', min: 1, max: 10, path: 'games/middle-word/'},
  {id: 'take-last', icon: '🍬', name: '抢最后一个', desc: '先在倒计时内往场上放物体，放得少的先手；轮流拿 1 或 2 个，拿走最后一个的人赢', players: '2 人', min: 2, max: 2, path: 'games/take-last/'}
]

// 游戏清单：大厅从这里读取。新增游戏就在数组里加一项。
//   min / max：玩家人数范围。超出 max 的人会成为观战者。
//   colors：大厅图标的两个渐变色（可选）。appIcon：icon 含多个表情时，大厅图标改用的单个表情（可选）。
export const GAMES = [
  {id: 'rps', icon: '✊✌️✋', name: '剪刀石头布', desc: '经典猜拳，双方同时揭晓，防偷看', players: '2 人', min: 2, max: 2, path: 'games/rps/', appIcon: '✌️', colors: ['#ff9a5a', '#f4616d']},
  {id: 'connect-four', icon: '🔴🟡', name: '四子棋', desc: '轮流投子，横竖斜连成 4 个就赢', players: '2 人', min: 2, max: 2, path: 'games/connect-four/', appIcon: '🔴', colors: ['#4f8dfd', '#2b55d9']},
  {id: 'draw', icon: '🎨', name: '你画我猜', desc: '大家轮流画，其他人抢着猜，每局 90 秒，猜得越快分越高', players: '2–10 人', min: 2, max: 10, path: 'games/draw/', colors: ['#b57bff', '#7b4ee0']},
  {id: 'quoridor', icon: '🧱', name: '步步为营', desc: '先走到对岸就赢，还能放挡板拦路（Quoridor）', players: '2 人', min: 2, max: 2, path: 'games/quoridor/', colors: ['#e0a45c', '#b56a35']},
  {id: 'secret-word', icon: '🔮', name: '秘密词', desc: '大家一起猜同一个 4–8 字的秘密词，每次猜测都显示相关度百分比（由房主的 Jina API 计算）', players: '1–10 人 · 合作猜词', min: 1, max: 10, path: 'games/secret-word/', colors: ['#6a6ff0', '#3c2f9e']},
  {id: 'middle-word', icon: '🌉', name: '中间词', desc: '大家和 AI 同时说一个词，说到一起就得分；没说到一起时，AI 会想一个"中间词"当作下一轮的词。一个人也能和 AI 对玩', players: '1–10 人 · 默契对战', min: 1, max: 10, path: 'games/middle-word/', colors: ['#3cc8d8', '#1f86b8']},
  {id: 'take-last', icon: '🍬', name: '抢最后一个', desc: '先在倒计时内往场上放物体，放得少的先手；轮流拿 1 或 2 个，拿走最后一个的人赢', players: '2 人', min: 2, max: 2, path: 'games/take-last/', colors: ['#ff86b5', '#e0488b']},
  {id: 'hero-guess', icon: '🕵️', name: '猜英雄', desc: '房主藏一个王者荣耀英雄，大家向 AI 提问推理（它不会直接说出名字），谁先报对英雄名谁得分。一个人也能测试', players: '1–10 人 · 抢答', min: 1, max: 10, path: 'games/hero-guess/', colors: ['#58657e', '#2b3347']},
  {id: 'cut-circle', icon: '✂️⚪', name: '切圆', desc: '轮流划线把圆切小，小球在里面反弹还会变大，谁切到球谁输', players: '2 人', min: 2, max: 2, path: 'games/cut-circle/', appIcon: '✂️', colors: ['#4fd09a', '#1e9a72']},
  {id: 'reversi', icon: '⚫⚪', name: '黑白棋', desc: '夹住对方的棋子就翻成自己的颜色，最后子多的人赢', players: '2 人', min: 2, max: 2, path: 'games/reversi/', appIcon: '⚫', colors: ['#3fae6b', '#14532d']}
]

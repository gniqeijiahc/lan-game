// 秘密词游戏的纯逻辑：没有任何网络或页面依赖，方便单独测试。

export const MAX_GUESS_LEN = 12

const HAN = /^\p{Script=Han}+$/u

export const chars = s => [...String(s)]

// 去掉所有空白（含全角空格）
export function cleanGuess(raw) {
  return String(raw == null ? '' : raw).replace(/[\s　]+/g, '')
}

// 合法返回空字符串，否则返回给玩家看的原因
export function validateGuess(word) {
  if (!word) return '请先输入一个词语'
  if (!HAN.test(word)) return '只能输入汉字哦'
  if (chars(word).length > MAX_GUESS_LEN) return `太长了，最多 ${MAX_GUESS_LEN} 个字`
  return ''
}

export function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0
}

export function mean(xs) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0
}

// 把余弦相似度换成 0–100 的百分比：
// base 是"随便一个无关词"的平均相似度（记为 0%），1 记为 100%。
export function toPercent(cos, base, curve = 1) {
  const b = Number.isFinite(base) && base < 1 ? base : 0
  let x = (cos - b) / (1 - b)
  if (!Number.isFinite(x)) x = 0
  x = Math.min(1, Math.max(0, x))
  return Math.pow(x, curve > 0 ? curve : 1) * 100
}

// 颜色档位：cold 蓝 / warm 琥珀 / hot 绿
export function tier(pct) {
  if (pct >= 90) return {label: '就差一点了', cls: 'hot'}
  if (pct >= 70) return {label: '非常接近', cls: 'hot'}
  if (pct >= 50) return {label: '很接近', cls: 'hot'}
  if (pct >= 30) return {label: '有点关系', cls: 'warm'}
  if (pct >= 15) return {label: '关系不大', cls: 'cold'}
  return {label: '几乎无关', cls: 'cold'}
}

// 未揭示的字用 ○ 代替：'春暖花开' + {0} → '春 ○ ○ ○'
export function maskText(word, revealed) {
  return chars(word).map((c, i) => (revealed.has(i) ? c : '○')).join(' ')
}

// "揭示一个字"最多几次：4 字 1 次，6–8 字 2 次
export function maxReveals(word) {
  return Math.max(1, Math.floor(chars(word).length / 3))
}

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 随机抽一个秘密词（avoid：上一局的词，尽量不重复）
export function pickSecret(list, rnd = Math.random, avoid = '') {
  const pool = list.length > 1 ? list.filter(x => x.word !== avoid) : list
  return pool[Math.floor(rnd() * pool.length)]
}

// 校准用的"无关词"：优先取其他类别的词，不够再补
export function pickRefs(list, secret, n, rnd = Math.random) {
  const other = shuffle(list.filter(x => x.category !== secret.category && x.word !== secret.word), rnd)
  const same = shuffle(list.filter(x => x.category === secret.category && x.word !== secret.word), rnd)
  return other.concat(same).slice(0, n).map(x => x.word)
}

// ================= 多人同猜：主机 / 消息校验 =================
// 联机的所有数据都不可信，进来先过这里的校验；不合法返回 null，调用方直接忽略。

export const MAX_GUESSES = 120      // 一局最多记录多少次猜测（也限制了主机的 API 用量和状态消息大小）
const PHASES = ['prep', 'play', 'won', 'gave']

export const isId = x => typeof x === 'string' && x.length > 0 && x.length < 100
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi
const isStr = (x, max) => typeof x === 'string' && x.length <= max

// 谁是主机：大厅告诉我们房主是谁就听大厅的（即使名单里暂时还没看到他）；
// 独立打开（没有大厅）时，退而求其次：所有人里 id 最小的那个。
export function pickLeader(host, selfId, peerIds) {
  if (isId(host)) return host
  if (!isId(selfId)) return null
  return [selfId, ...peerIds].sort()[0]
}

export function newSid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// 玩家发给主机的"我猜 xx"
export function parseGuessMsg(d) {
  if (!d || d.t !== 'g' || !isInt(d.id, 0, 1e9) || typeof d.w !== 'string') return null
  const w = cleanGuess(d.w)
  return validateGuess(w) ? null : {id: d.id, w}
}

// 玩家发给主机的提示请求
export function parseHintMsg(d) {
  if (!d || d.t !== 'h' || (d.k !== 'cat' && d.k !== 'char')) return null
  return {k: d.k}
}

// 主机回复某次猜测的结果
export function parseRes(d) {
  if (!d || d.t !== 'res' || !isInt(d.id, 0, 1e9) || typeof d.ok !== 'boolean' || !isStr(d.m, 80)) return null
  return {id: d.id, ok: d.ok, m: d.m, p: Number.isFinite(d.p) ? Math.min(100, Math.max(0, d.p)) : null}
}

// 主机广播的整局公共状态（每次都发完整的一份，晚到的人、丢了消息的人下一条就追上了）
export function parseState(d) {
  if (!d || d.t !== 'st' || !isStr(d.sid, 40) || !d.sid || !isInt(d.v, 0, 1e9)) return null
  if (!PHASES.includes(d.ph) || !isInt(d.len, 0, 12) || !isStr(d.cat, 16) || !isInt(d.hc, 0, 99)) return null
  if (!isStr(d.ans, 12) || !isStr(d.note, 60) || !isInt(d.r, 0, 1e9)) return null
  if (!Array.isArray(d.ids) || d.ids.length > 40 || !d.ids.every(isId)) return null
  if (!isInt(d.wn, -1, d.ids.length - 1)) return null
  if (!Array.isArray(d.rv) || d.rv.length > 8) return null
  const rv = []
  for (const x of d.rv) {
    if (!Array.isArray(x) || !isInt(x[0], 0, 11) || typeof x[1] !== 'string' || [...x[1]].length !== 1) return null
    rv.push([x[0], x[1]])
  }
  if (!Array.isArray(d.G) || d.G.length > MAX_GUESSES) return null
  const G = []
  for (const g of d.G) {
    if (!Array.isArray(g) || typeof g[0] !== 'string' || [...g[0]].length > MAX_GUESS_LEN) return null
    if (!Number.isFinite(g[1]) || g[1] < 0 || g[1] > 100 || !isInt(g[2], 0, d.ids.length - 1) || !isInt(g[3], 1, 1e6)) return null
    G.push([g[0], g[1], g[2], g[3]])
  }
  return {sid: d.sid, v: d.v, r: d.r, ph: d.ph, len: d.len, cat: d.cat, hc: d.hc, ans: d.ans, note: d.note, wn: d.wn, ids: [...d.ids], rv, G}
}

// 新状态 d 是否比当前状态 cur 更新：换了一位主机/刷新过页面（sid 不同）就一定采用，否则版本号要更大
export function isNewer(cur, d) {
  return !cur || !cur.sid || cur.sid !== d.sid || d.v > cur.v
}

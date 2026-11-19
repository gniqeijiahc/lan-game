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

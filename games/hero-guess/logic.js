// 「猜英雄」的纯逻辑：没有任何网络或页面依赖，方便单独测试。
//
// 玩法：房主（主机）随机抽一个英雄，大家向 AI 提问来推理，也可以直接报英雄名；谁先报对谁得 1 分。
// 联机的所有数据都不可信，进来先过这里的校验；不合法返回 null，调用方直接忽略。

import {HEROES} from './heroes.js'

export const MAX_Q_LEN = 60        // 一个问题最多多少个字
export const MAX_GUESS_LEN = 20    // 猜英雄时输入框允许的最长字数（英雄名最长 6 个字）
export const MAX_ANS_LEN = 400     // 状态里一条 AI 回答最长多少（Worker 本身已限制 160 字）
export const MAX_LOG = 30          // 公共记录最多保留多少条（限制状态消息的大小）

// ---------- 英雄名单 ----------
export function parseHero(entry) {
  const [n, rest] = String(entry).split('|')
  return {n, a: rest ? rest.split(',').filter(Boolean) : []}
}
export const HERO_LIST = HEROES.map(parseHero)

// 比较名字时：去掉空格、点、横线，全角转半角，数字 7 当成"七"（鲁班7号 = 鲁班七号）
export function normName(s) {
  return String(s == null ? '' : s).normalize('NFKC').replace(/[\s·・•.\-_'"`]/g, '').replace(/7/g, '七')
}

// 名字和别名 → 英雄。全名优先，别名重复时先到先得
const INDEX = new Map()
for (const h of HERO_LIST) INDEX.set(normName(h.n), h)
for (const h of HERO_LIST) for (const a of h.a) { const k = normName(a); if (!INDEX.has(k)) INDEX.set(k, h) }

export function findHero(text) {
  return INDEX.get(normName(text)) || null
}

// 输入时的提示：名字或别名里包含输入内容的英雄（以输入内容开头的排前面），最多 limit 个
export function suggest(text, limit = 8) {
  const k = normName(text)
  if (!k) return []
  const starts = [], has = []
  for (const h of HERO_LIST) {
    const keys = [h.n, ...h.a].map(normName)
    if (keys.some(x => x.startsWith(k))) starts.push(h.n)
    else if (keys.some(x => x.includes(k))) has.push(h.n)
  }
  return [...starts, ...has].slice(0, limit)
}

// 抽一个这一局还没出过的英雄；都出过了就重新来
export function pickHero(used, rnd = Math.random) {
  let pool = HERO_LIST.filter(h => !used.has(h.n))
  if (!pool.length) { used.clear(); pool = HERO_LIST }
  return pool[Math.floor(rnd() * pool.length)]
}

// ---------- 问题 ----------
const chars = s => [...String(s)]

// 换行和多余空白变成一个空格，去掉控制字符
export function cleanQuestion(raw) {
  return String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/[\s　]+/g, ' ').trim()
}

// 合法返回空字符串，否则返回给玩家看的原因
export function questionError(q) {
  const n = chars(q).length
  if (n < 1) return '先输入你想问 AI 的问题'
  if (n > MAX_Q_LEN) return `问题太长了，最多 ${MAX_Q_LEN} 个字`
  return ''
}

// ---------- 联机校验 ----------
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

// 玩家发给主机的"我要问 AI"
export function parseQuestionMsg(d) {
  if (!d || d.t !== 'q' || !isInt(d.id, 0, 1e9) || typeof d.q !== 'string' || d.q.length > MAX_Q_LEN * 4) return null
  const q = cleanQuestion(d.q)
  return questionError(q) ? null : {id: d.id, q}
}

// 玩家发给主机的"我猜是这个英雄"
export function parseGuessMsg(d) {
  if (!d || d.t !== 'g' || !isInt(d.id, 0, 1e9) || typeof d.g !== 'string' || d.g.length > MAX_GUESS_LEN * 2) return null
  const g = cleanQuestion(d.g)
  return g && chars(g).length <= MAX_GUESS_LEN ? {id: d.id, g} : null
}

// 主机回复某次提交的结果。k：q 是提问，g 是猜英雄；lk：这个人还要等几秒才能再猜
export function parseRes(d) {
  if (!d || d.t !== 'res' || !isInt(d.id, 0, 1e9) || (d.k !== 'q' && d.k !== 'g') || typeof d.ok !== 'boolean' || !isStr(d.m, 120)) return null
  if (!isInt(d.lk, 0, 600)) return null
  return {id: d.id, k: d.k, ok: d.ok, m: d.m, lk: d.lk}
}

const PHASES = ['prep', 'play', 'reveal', 'over']
const HAN_NAME = /^\p{Script=Han}{1,12}$/u

// 主机广播的整局公共状态（每次都发完整的一份，晚到的人、丢了消息的人下一条就追上了）
// L 的每一项：[序号, 'q' 提问 | 'g' 猜测, 谁, 问题/猜的英雄, AI 的回答, 状态]
//   状态：0 AI 还在想，1 完成，2 出错（回答里写着原因）
export function parseState(d) {
  if (!d || d.t !== 'st' || !isStr(d.sid, 40) || !d.sid || !isInt(d.v, 0, 1e9)) return null
  if (!PHASES.includes(d.ph) || !isInt(d.r, 0, 1e9) || !isInt(d.rd, 0, 99999) || !isInt(d.tg, 1, 99)) return null
  if (!isInt(d.qn, 0, 999) || !isInt(d.tl, 0, 99999) || !isStr(d.note, 80)) return null
  if (!Array.isArray(d.ids) || d.ids.length > 40 || !d.ids.every(isId)) return null
  if (!Array.isArray(d.sc) || d.sc.length !== d.ids.length || !d.sc.every(x => isInt(x, 0, 999))) return null
  if (!isInt(d.by, -1, d.ids.length - 1)) return null
  if (d.ans !== '' && !(typeof d.ans === 'string' && HAN_NAME.test(d.ans))) return null
  if ((d.ph === 'reveal' || d.ph === 'over') !== (d.ans !== '')) return null     // 答案只在公布之后才有
  if (!Array.isArray(d.L) || d.L.length > MAX_LOG) return null
  const L = []
  for (const e of d.L) {
    if (!Array.isArray(e) || !isInt(e[0], 1, 1e9) || (e[1] !== 'q' && e[1] !== 'g') || !isInt(e[2], 0, d.ids.length - 1)) return null
    if (!isStr(e[3], MAX_Q_LEN * 4) || !e[3] || !isStr(e[4], MAX_ANS_LEN) || !isInt(e[5], 0, 2)) return null
    L.push([e[0], e[1], e[2], e[3], e[4], e[5]])
  }
  return {sid: d.sid, v: d.v, r: d.r, rd: d.rd, ph: d.ph, tg: d.tg, qn: d.qn, tl: d.tl, ans: d.ans, by: d.by, note: d.note,
          ids: [...d.ids], sc: [...d.sc], L}
}

// 新状态 d 是否比当前状态 cur 更新：换了一位主机/刷新过页面（sid 不同）就一定采用，否则版本号要更大
export function isNewer(cur, d) {
  return !cur || !cur.sid || cur.sid !== d.sid || d.v > cur.v
}

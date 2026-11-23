// 「中间词」游戏的纯逻辑：没有任何网络或页面依赖，方便单独测试。
//
// 玩法：每一轮，所有玩家和 AI 同时秘密说一个词。揭晓后，说了同一个词的人（至少两个，AI 也算一个）各得 1 分。
// 没有人相同时，AI 根据场上所有的词想一个"中间词"，作为它下一轮说的词。先到目标分数的赢。

export const MAX_WORD_LEN = 8
export const MAX_LOG = 40           // 公共记录最多保留多少个回合（限制状态消息的大小）

const HAN = /^\p{Script=Han}+$/u
export const chars = s => [...String(s)]

// 去掉所有空白（含全角空格）
export function cleanGuess(raw) {
  return String(raw == null ? '' : raw).replace(/[\s　]+/g, '')
}

// 合法返回空字符串，否则返回给玩家看的原因
export function validateWord(word) {
  if (!word) return '请先输入一个词语'
  if (!HAN.test(word)) return '只能输入汉字哦'
  if (chars(word).length > MAX_WORD_LEN) return `太长了，最多 ${MAX_WORD_LEN} 个字`
  return ''
}

// AI 开局（每一局的第一轮）说的词：常见的两字词
export const STARTERS = [
  '春天', '大海', '苹果', '月亮', '火车', '学校', '朋友', '音乐', '雨伞', '电话',
  '森林', '咖啡', '足球', '星星', '书包', '面包', '山峰', '河流', '花园', '医生',
  '老师', '手机', '风筝', '蛋糕', '冰雪', '夏天', '秋天', '冬天', '太阳', '白云',
  '汽车', '飞机', '轮船', '桥梁', '城市', '乡村', '房子', '窗户', '灯光', '时间',
  '快乐', '勇气', '梦想', '故事', '地图', '钥匙', '镜子', '玩具', '果汁', '米饭',
  '鱼儿', '小鸟', '老虎', '熊猫', '彩虹', '闪电', '沙滩', '岛屿', '篮球', '游泳'
]

export function pickStarter(exclude = [], rnd = Math.random) {
  const ex = new Set(exclude)
  const pool = STARTERS.filter(w => !ex.has(w))
  const list = pool.length ? pool : STARTERS
  return list[Math.floor(rnd() * list.length)]
}

// AI 给出的中间词是否可用：2–8 个汉字，且这一局里没出现过
export function validAiWord(mid, used) {
  if (typeof mid !== 'string' || !HAN.test(mid)) return false
  const n = chars(mid).length
  if (n < 2 || n > MAX_WORD_LEN) return false
  return !used.has(mid)
}

// 找出相同的词。entries: [[谁, 词], ...]（谁：-1 是 AI，否则是玩家序号）。
// 返回 [{word, who: [...]}]：只包含至少两个人说了的词。
export function groupMatches(entries) {
  const by = new Map()
  for (const [who, word] of entries) {
    if (!by.has(word)) by.set(word, [])
    by.get(word).push(who)
  }
  return [...by].filter(([, who]) => who.length >= 2).map(([word, who]) => ({word, who}))
}

// ================= 多人：主机 / 消息校验 =================
// 联机的所有数据都不可信，进来先过这里的校验；不合法返回 null，调用方直接忽略。

const PHASES = ['prep', 'collect', 'think', 'over']

export const isId = x => typeof x === 'string' && x.length > 0 && x.length < 100
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi
const isStr = (x, max) => typeof x === 'string' && x.length <= max
const isWord = x => typeof x === 'string' && HAN.test(x) && chars(x).length <= 12

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

// 玩家发给主机的"我说这个词"
export function parseSubmitMsg(d) {
  if (!d || d.t !== 'w' || !isInt(d.id, 0, 1e9) || typeof d.w !== 'string') return null
  const w = cleanGuess(d.w)
  return validateWord(w) ? null : {id: d.id, w}
}

// 主机回复某次提交的结果
export function parseRes(d) {
  if (!d || d.t !== 'res' || !isInt(d.id, 0, 1e9) || typeof d.ok !== 'boolean' || !isStr(d.m, 80)) return null
  return {id: d.id, ok: d.ok, m: d.m}
}

// 主机广播的整局公共状态（每次都发完整的一份，晚到的人、丢了消息的人下一条就追上了）
// L 的每一项：[回合序号, 第几局, [[谁, 词], ...], [相同的词, ...]]
export function parseState(d) {
  if (!d || d.t !== 'st' || !isStr(d.sid, 40) || !d.sid || !isInt(d.v, 0, 1e9)) return null
  if (!PHASES.includes(d.ph) || !isInt(d.r, 0, 1e9) || !isInt(d.rd, 0, 9999) || !isInt(d.turn, 0, 9999)) return null
  if (!isInt(d.tg, 1, 99) || !isInt(d.ai, 0, 999) || !isStr(d.note, 80)) return null
  if (!Array.isArray(d.ids) || d.ids.length > 40 || !d.ids.every(isId)) return null
  if (!Array.isArray(d.sc) || d.sc.length !== d.ids.length || !d.sc.every(x => isInt(x, 0, 999))) return null
  if (!Array.isArray(d.sub) || d.sub.length > d.ids.length || !d.sub.every(x => isInt(x, 0, d.ids.length - 1))) return null
  if (!Array.isArray(d.L) || d.L.length > MAX_LOG) return null
  const L = []
  for (const t of d.L) {
    if (!Array.isArray(t) || !isInt(t[0], 1, 9999) || !isInt(t[1], 1, 9999) || !Array.isArray(t[2]) || !Array.isArray(t[3])) return null
    if (t[2].length < 1 || t[2].length > 42 || t[3].length > 21) return null
    const entries = []
    for (const e of t[2]) {
      if (!Array.isArray(e) || !isInt(e[0], -1, d.ids.length - 1) || !isWord(e[1])) return null
      entries.push([e[0], e[1]])
    }
    if (!t[3].every(isWord)) return null
    L.push([t[0], t[1], entries, [...t[3]]])
  }
  return {sid: d.sid, v: d.v, r: d.r, rd: d.rd, ph: d.ph, turn: d.turn, tg: d.tg, ai: d.ai, note: d.note,
          ids: [...d.ids], sc: [...d.sc], sub: [...d.sub], L}
}

// 新状态 d 是否比当前状态 cur 更新：换了一位主机/刷新过页面（sid 不同）就一定采用，否则版本号要更大
export function isNewer(cur, d) {
  return !cur || !cur.sid || cur.sid !== d.sid || d.v > cur.v
}

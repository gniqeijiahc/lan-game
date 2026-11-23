// Cloudflare Worker：猜词游戏用的代理（一个 Worker 管两个游戏）
//
//   POST /        → 转发到 Jina embeddings（「秘密词」游戏）      需要 Secret：JINA_API_KEY
//   POST /blend   → 生成一组词的"中间词"（「中间词」游戏）；POST /middle 是两个词的旧接口，保留着
//                   模型按顺序试：先试智谱 GLM（Secret：ZHIPU_API_KEY），再试 Gemini（Secret：GEMINI_API_KEY）
//                   两个 Key 至少设一个。可选变量：ZHIPU_BASE、ZHIPU_MODELS、GEMINI_MODELS（模型名用逗号隔开，按顺序尝试）
//
// 两个 Key 都只存在 Cloudflare 里，页面和 GitHub 上都看不到。
//
// 防滥用：只接受来自你网站的请求；Jina 只允许指定模型、限制词数和长度；
// Gemini 的提示词写死在这里，页面只能传"秘密词 / 猜的词"，所以它不能被当成通用的 AI 接口来用，
// 而且只会返回一个中文词。
// 注意：来源检查挡得住别人的网页盗用，但挡不住有人用脚本伪造来源。
// Cloudflare 免费版每天最多 10 万次请求；Gemini 免费额度更小（见 /middle 部分的说明）。

const ALLOWED_ORIGINS = [
  'https://gniqeijiahc.github.io',   // 你的 GitHub Pages
  'http://localhost:8000',           // 本地调试用，不需要可以删掉
  'http://127.0.0.1:8000'
]

// ---------- Jina（「秘密词」） ----------
const ALLOWED_MODELS = ['jina-embeddings-v5-text-small', 'jina-embeddings-v3']
const ALLOWED_TASKS = ['text-matching']
const MAX_ITEMS = 30        // 开局一次要算 25 个词，平时每次 1 个
const MAX_CHARS = 16        // 每个词最长 16 个字符（游戏里最长 12 个字）
const JINA_URL = 'https://api.jina.ai/v1/embeddings'

// ---------- Gemini（「中间词」） ----------
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/'
// 免费额度是"每个模型各算各的"，所以多放一个模型，第一个被限速（429）时自动换第二个。
// 模型名会随 Google 更新而变；如果某个名字失效，到 Cloudflare 的 Worker 设置里加一个变量
// GEMINI_MODELS（例如 gemini-3.5-flash-lite,gemini-3.1-flash-lite）就能覆盖，不用改代码。
const DEFAULT_GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']
// 智谱（Z.ai / BigModel）：免费的 Flash 模型。中国站和国际站的 Key 不通用，用哪个站申请的 Key 就要选哪个地址：
//   国际站（z.ai）的 Key：在 Worker 变量里设 ZHIPU_BASE = https://api.z.ai/api/paas/v4
//   中国站（bigmodel.cn）的 Key：不用设（默认）
const ZHIPU_BASES = ['https://open.bigmodel.cn/api/paas/v4', 'https://api.z.ai/api/paas/v4']
const DEFAULT_ZHIPU_MODELS = ['glm-4.5-flash', 'glm-4.7-flash']   // 可用变量 ZHIPU_MODELS 覆盖
const HAN = /^\p{Script=Han}+$/u

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  }
}
const json = (status, body, origin) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', ...(origin ? cors(origin) : {})}})

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const allowed = ALLOWED_ORIGINS.includes(origin)

    if (request.method === 'OPTIONS') {                       // 浏览器的跨域预检
      return allowed ? new Response(null, {status: 204, headers: cors(origin)}) : new Response(null, {status: 403})
    }
    if (!allowed) return json(403, {error: 'origin not allowed'})
    if (request.method !== 'POST') return json(405, {error: 'POST only'}, origin)

    let body
    try { body = await request.json() } catch { return json(400, {error: 'invalid json'}, origin) }

    const path = new URL(request.url).pathname
    if (path === '/middle') return middle(body, env, origin)
    if (path === '/blend') return blend(body, env, origin)
    return embeddings(body, env, origin)
  }
}

// =============================== Jina ===============================
async function embeddings(body, env, origin) {
  if (!env.JINA_API_KEY) return json(500, {error: 'JINA_API_KEY is not set'}, origin)
  const input = body && body.input
  if (!body || !ALLOWED_MODELS.includes(body.model) || !ALLOWED_TASKS.includes(body.task)) return json(422, {error: 'model or task not allowed'}, origin)
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_ITEMS ||
      input.some(s => typeof s !== 'string' || s.length < 1 || s.length > MAX_CHARS)) return json(422, {error: 'invalid input'}, origin)

  let upstream
  try {
    upstream = await fetch(JINA_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + env.JINA_API_KEY},
      body: JSON.stringify({model: body.model, task: body.task, input})   // 只转发我们允许的字段
    })
  } catch { return json(502, {error: 'upstream unreachable'}, origin) }

  // 上游的 401/403 是"Worker 里的 Key 有问题"，不要原样转给游戏（游戏会以为是玩家要重填 Key）
  if (upstream.status === 401 || upstream.status === 403) return json(502, {error: 'upstream rejected the key'}, origin)

  return new Response(upstream.body, {status: upstream.status, headers: {'Content-Type': 'application/json', ...cors(origin)}})
}

// ============================== Gemini ==============================
const validWord = (s, min, max) => typeof s === 'string' && s.length >= min && s.length <= max && HAN.test(s)

function buildPrompt(secret, guess, avoid) {
  return [
    '你在为一个中文猜词游戏想"中间词"。',
    `秘密词：${secret}`,
    `玩家猜的词：${guess}`,
    '',
    '请想一个"中间词"：它在意思上处于「玩家猜的词」和「秘密词」之间，像一座桥——跟两个词都有明显的联系，并且比玩家猜的词更接近秘密词，但不能直接把秘密词说出来。',
    '要求：',
    '1. 只输出这一个中文词语（2 到 6 个字），不要标点、引号、解释或任何其他文字。',
    `2. 不能是「${secret}」或「${guess}」，不能是秘密词的同义词，也尽量不要使用秘密词里的字。`,
    avoid.length ? `3. 不要使用这些词：${avoid.join('、')}。` : ''
  ].filter(Boolean).join('\n')
}

// 从 Gemini 的回复里取文字（跳过"思考"部分）
function extractText(data) {
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts
  if (!Array.isArray(parts)) return ''
  return parts.filter(p => p && typeof p.text === 'string' && !p.thought).map(p => p.text).join('')
}

// 只接受"整段回复就是一个中文词"（容忍引号、句号、加粗、"中间词：" 前缀）；回了一句话就当作无效
function cleanWord(text) {
  if (typeof text !== 'string') return null
  let t = text.trim().split(/\n/)[0].trim()
  t = t.replace(/^[\s"'“”‘’「」『』《》（）()\[\]*#>\-–—]+|[\s"'“”‘’「」『』《》（）()\[\]*#>。.!！,，;；]+$/gu, '')
  const m = t.match(/^(?:中间词[：:]\s*)?(\p{Script=Han}{1,8})$/u)
  return m ? m[1] : null
}

// 一次"向某个模型要一个词"：返回 {word} 或 {status}（429=限速；502=这个模型没给出可用的词；其余=这个服务商不可用）
async function askZhipu(model, prompt, env) {
  const base = ZHIPU_BASES.includes(env.ZHIPU_BASE) ? env.ZHIPU_BASE : ZHIPU_BASES[0]
  let r
  try {
    r = await fetch(base + '/chat/completions', {
      method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.ZHIPU_API_KEY},
      body: JSON.stringify({model, messages: [{role: 'user', content: prompt}], thinking: {type: 'disabled'}, temperature: 0.6, max_tokens: 1024, stream: false})
    })
  } catch { return {status: 502, next: true} }
  if (r.status === 429) return {status: 429, next: true}                 // 免费版同时只允许 1 个请求，也会返回 429
  if (r.status === 404 || r.status >= 500) return {status: 502, next: true}
  if (!r.ok) return {status: 502, stop: true}                            // 400/401/403：多半是 Key 有问题，换同一服务商的别的模型也没用
  let data = null
  try { data = await r.json() } catch {}
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
  const word = cleanWord(text)
  return word ? {word} : {status: 502, next: true}
}

async function askGemini(model, prompt, env) {
  let r
  try {
    r = await fetch(GEMINI_BASE + model + ':generateContent', {
      method: 'POST', headers: {'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY},
      body: JSON.stringify({contents: [{role: 'user', parts: [{text: prompt}]}], generationConfig: {temperature: 0.6, maxOutputTokens: 256}})
    })
  } catch { return {status: 502, next: true} }
  if (r.status === 429) return {status: 429, next: true}                 // 这个模型被限速：换下一个
  if (r.status === 404 || r.status >= 500) return {status: 502, next: true}   // 模型名失效或 Google 出错：换下一个
  if (!r.ok) return {status: 502, stop: true}                            // 400/401/403：多半是 Key 有问题，换模型也没用
  let data = null
  try { data = await r.json() } catch {}
  const word = cleanWord(extractText(data))
  return word ? {word} : {status: 502, next: true}                       // 空回复（被安全过滤）或回了一整句：换下一个
}

const modelList = (envValue, defaults) =>
  (envValue ? String(envValue).split(',') : defaults).map(s => s.trim()).filter(s => /^[a-z0-9][a-z0-9.\-]*$/.test(s))

// 提供商按顺序尝试：先智谱（免费额度大），再 Gemini；哪个的 Key 没设置就跳过
async function generate(prompt, env, origin) {
  const steps = []
  if (env.ZHIPU_API_KEY) for (const m of modelList(env.ZHIPU_MODELS, DEFAULT_ZHIPU_MODELS)) steps.push({ask: askZhipu, model: m, prov: 'zhipu'})
  if (env.GEMINI_API_KEY) for (const m of modelList(env.GEMINI_MODELS, DEFAULT_GEMINI_MODELS)) steps.push({ask: askGemini, model: m, prov: 'gemini'})
  if (!steps.length) return json(500, {error: 'ZHIPU_API_KEY / GEMINI_API_KEY is not set'}, origin)

  let last = 502
  const skip = new Set()
  for (const st of steps) {
    if (skip.has(st.prov)) continue
    const res = await st.ask(st.model, prompt, env)
    if (res.word) return json(200, {word: res.word, model: st.model}, origin)
    last = res.status
    if (res.stop) skip.add(st.prov)
  }
  return json(last, {error: last === 429 ? 'rate limited' : 'no usable answer'}, origin)
}

// /middle：两个词（秘密词、猜的词）之间的中间词
async function middle(body, env, origin) {
  const secret = body && body.secret, guess = body && body.guess
  const avoid = body && body.avoid === undefined ? [] : body && body.avoid
  if (!validWord(secret, 2, 12) || !validWord(guess, 1, 12) || !Array.isArray(avoid) || avoid.length > 3 ||
      avoid.some(w => !validWord(w, 1, 8))) return json(422, {error: 'invalid input'}, origin)
  return generate(buildPrompt(secret, guess, avoid), env, origin)
}

// /blend：一组词（2–12 个）的中间词，给「中间词」多人游戏用
function buildBlendPrompt(words, avoid) {
  return [
    '你在玩一个中文"心有灵犀"词语游戏。',
    `场上的词：${words.join('、')}`,
    '',
    '请想一个"中间词"：意思处在这些词之间、能把它们联系起来的词——大多数人看到这些词时，最容易想到的那个居中的词。',
    '要求：',
    '1. 只输出这一个中文词语（2 到 6 个字），不要标点、引号、解释或任何其他文字。',
    '2. 不能是场上已有的词。',
    avoid.length ? `3. 也不要使用这些词：${avoid.join('、')}。` : ''
  ].filter(Boolean).join('\n')
}

async function blend(body, env, origin) {
  const words = body && body.words
  const avoid = body && body.avoid === undefined ? [] : body && body.avoid
  if (!Array.isArray(words) || words.length < 2 || words.length > 12 || words.some(w => !validWord(w, 1, 12)) ||
      !Array.isArray(avoid) || avoid.length > 8 || avoid.some(w => !validWord(w, 1, 12))) return json(422, {error: 'invalid input'}, origin)
  return generate(buildBlendPrompt(words, avoid), env, origin)
}

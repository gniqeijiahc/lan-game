// Cloudflare Worker：Jina embeddings 代理（给「秘密词」游戏用）
//
// 作用：把 Jina API Key 藏在 Cloudflare 里，游戏页面只访问这个 Worker，不再需要任何人填 Key。
// 需要在 Cloudflare 里设置一个名为 JINA_API_KEY 的 Secret（见操作步骤）。
//
// 防滥用：只接受来自你网站的请求、只允许指定模型、限制每次的词数和长度。
// 注意：来源检查挡得住别人的网页盗用，但挡不住有人用脚本伪造来源。
// 免费版每天最多 10 万次请求，这就是最坏情况下的上限（游戏里每猜一个词只用 1 次）。

const ALLOWED_ORIGINS = [
  'https://gniqeijiahc.github.io',   // 你的 GitHub Pages
  'http://localhost:8000',           // 本地调试用，不需要可以删掉
  'http://127.0.0.1:8000'
]
const ALLOWED_MODELS = ['jina-embeddings-v5-text-small', 'jina-embeddings-v3']
const ALLOWED_TASKS = ['text-matching']
const MAX_ITEMS = 30        // 开局一次要算 25 个词，平时每次 1 个
const MAX_CHARS = 16        // 每个词最长 16 个字符（游戏里最长 12 个字）
const JINA_URL = 'https://api.jina.ai/v1/embeddings'

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
    if (!env.JINA_API_KEY) return json(500, {error: 'JINA_API_KEY is not set'}, origin)

    let body
    try { body = await request.json() } catch { return json(400, {error: 'invalid json'}, origin) }
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
}

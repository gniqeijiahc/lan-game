// 秘密词游戏的 Jina 设置。
export const CONFIG = {
  // 调用 Jina 的地址。以后改用 Cloudflare Worker 代理时，把它换成 Worker 的网址，
  // 并把 API_KEY 留空即可（地址不是 api.jina.ai 时，页面不会再要求玩家填 Key）。
  API_URL: 'https://api.jina.ai/v1/embeddings',

  // 直接写在这里会随代码公开在 GitHub 上，别人可以盗用额度，所以默认留空。
  // 玩家在页面里自己填写，Key 只保存在自己浏览器的 localStorage 里。
  API_KEY: '',

  MODEL: 'jina-embeddings-v5-text-small',
  // 如果上面的模型名被接口拒绝（400/404/422），开局时会自动改用这个。
  FALLBACK_MODEL: 'jina-embeddings-v3',
  TASK: 'text-matching',   // 语义相似度（对称匹配）

  REF_COUNT: 24,           // 开局用多少个"无关词"来校准百分比
  CURVE: 1                 // 百分比曲线：1 为线性；小于 1 让中间段分数更高，大于 1 更严格
}

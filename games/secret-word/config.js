// 秘密词游戏的 Jina 设置。
export const CONFIG = {
  // 调用 Jina 的地址：现在走你的 Cloudflare Worker，Jina Key 存在 Worker 的 Secret 里，页面不需要任何 Key。
  // （地址不是 api.jina.ai 时，页面不会再要求房主填 Key。）
  // 想改回直连 Jina：换成 'https://api.jina.ai/v1/embeddings'，房主就要在页面里自己填 Key。
  API_URL: 'https://jina-proxy.chaijieqing2718.workers.dev/',

  // 走 Worker 时留空。不要把 Jina Key 写在这里，它会随代码公开在 GitHub 上。
  API_KEY: '',

  MODEL: 'jina-embeddings-v5-text-small',
  // 如果上面的模型名被接口拒绝（400/404/422），开局时会自动改用这个。
  FALLBACK_MODEL: 'jina-embeddings-v3',
  TASK: 'text-matching',   // 语义相似度（对称匹配）

  REF_COUNT: 24,           // 开局用多少个"无关词"来校准百分比
  CURVE: 1                 // 百分比曲线：1 为线性；小于 1 让中间段分数更高，大于 1 更严格
}

// 「中间词」游戏的设置。
export const CONFIG = {
  // 和「秘密词」共用同一个 Cloudflare Worker，路径是 /middle。
  // Gemini 的 Key 存在 Worker 的 Secret（GEMINI_API_KEY）里，页面和 GitHub 上都看不到。
  MIDDLE_URL: 'https://jina-proxy.chaijieqing2718.workers.dev/middle',

  // 主机两次请求 AI 之间至少隔多久。Gemini 免费额度按"每分钟请求数"限速（Flash-Lite 约 10 次/分钟/模型），
  // Worker 里放了两个模型轮换，所以大约每 3 秒一次比较稳；觉得慢或者经常提示"AI 太忙"可以调这个数。
  MIN_GAP_MS: 2500,

  // AI 给出的词不合格（比如把秘密词说出来了）时，最多请求几次。
  MAX_TRIES: 2
}

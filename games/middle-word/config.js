// 「中间词」游戏的设置。
export const CONFIG = {
  // 和「秘密词」共用同一个 Cloudflare Worker，路径是 /blend。
  // 智谱 / Gemini 的 Key 存在 Worker 的 Secret 里，页面和 GitHub 上都看不到。
  BLEND_URL: 'https://jina-proxy.chaijieqing2718.workers.dev/blend',

  TARGET_SCORE: 5,      // 先到多少分获胜（玩家和 AI 都算）
  TURN_SECONDS: 90,     // 每一轮的等待时间：到时间后，主机按已经提交的词揭晓（有人没提交就不参加这一轮）

  // AI 给出的词不合格（比如和场上的词重复）时，最多请求几次；都不行就随机换一个词，游戏继续。
  MAX_TRIES: 2
}

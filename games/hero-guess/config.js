// 「猜英雄」游戏的设置。
export const CONFIG = {
  // 和「秘密词」「中间词」共用同一个 Cloudflare Worker，路径是 /hero。
  // 智谱的 Key 存在 Worker 的 Secret（ZHIPU_API_KEY）里，页面和 GitHub 上都看不到。
  HERO_URL: 'https://jina-proxy.chaijieqing2718.workers.dev/hero',

  TARGET_SCORE: 5,          // 先猜对多少个英雄的人获胜（一个人玩时就是测试：猜对 5 个结束）
  ROUND_SECONDS: 300,       // 每个英雄最多猜多久；到时间没人猜出来，就公布答案，不得分
  NEXT_DELAY_SECONDS: 6,    // 公布答案后，多久自动开始下一个英雄（主机也可以点"下一个"提前开始）

  MAX_QUESTIONS: 40,        // 每个英雄最多问 AI 多少次（所有人合计），保护免费额度
  QUESTION_GAP_MS: 1500,    // 同一个人两次提问之间的最短间隔
  WRONG_LOCK_SECONDS: 6,    // 猜错之后，这个人要等多久才能再猜（防止把名单挨个试一遍）
  HISTORY_PAIRS: 8,         // 提问时带上最近几组问答，让 AI 听得懂"那他呢"这类追问
  REQUEST_TIMEOUT_MS: 55000 // 等 Worker 回复的最长时间
}

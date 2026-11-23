// 抢最后一个：玩法参数。想改玩法，先改这里。
//
// 之后要加的东西可以这样接：
//   - 每回合拿子倒计时：在 index.html 的 applyTake / drain 一带加（目前只有"放置阶段"有倒计时）
//   - 一次能拿 1/2/3 个：把 TAKE_OPTIONS 改成 [1, 2, 3]，按钮和规则文字会自动跟着变
export const CONFIG = {
  PLACE_SECONDS: 15,        // 放置阶段的倒计时（秒）
  MAX_PER_PLAYER: 30,       // 每人最多放多少个
  TAKE_OPTIONS: [1, 2]      // 每回合允许拿走的个数（从小到大）
}

// 切圆：玩法参数。想改手感，先改这里。长度单位：大圆半径 = 1
export const CONFIG = {
  BALL_RADIUS: 0.04,     // 开局小球半径
  BALL_GROW: 0.10,       // 变大幅度：半径 = BALL_RADIUS + BALL_GROW × 已切掉的面积比例
  BALL_SPEED: 0.75,      // 小球速度（每秒走几个大圆半径）
  BLADE_SPEED: 3,        // 刀的速度（每秒）。调小 = 切得慢 = 更难
  MIN_CUT: 0.08,         // 每刀较小的一块至少占当前面积的比例（防止一直切薄片）
  TURN_SECONDS: 20       // 每回合限时（秒），超时判负
}

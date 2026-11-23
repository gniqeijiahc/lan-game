// 抢最后一个：纯规则函数（不碰界面和网络），方便单独测试。

// 场上还剩 remaining 个时，这回合可以拿的个数
export function legalTakes(remaining, options) {
  return options.filter(k => k <= remaining)
}

// 双方放的数量一样时的先手：按局序轮流。
// 奇数局：房间编号（peerId）较小的一方先手；偶数局：较大的一方先手。
// 两边用同一条规则各自算，不需要协商。返回 'me' | 'opp'
export function tieFirst({selfId, oppId, roundNo}) {
  const selfIsLow = selfId < oppId
  const lowFirst = roundNo % 2 === 1
  return selfIsLow === lowFirst ? 'me' : 'opp'
}

// 放得少的先手；一样多按 tieFirst。返回 'me' | 'opp'
export function whoGoesFirst({selfId, oppId, selfCount, oppCount, roundNo}) {
  if (selfCount !== oppCount) return selfCount < oppCount ? 'me' : 'opp'
  return tieFirst({selfId, oppId, roundNo})
}

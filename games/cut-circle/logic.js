// 切圆：纯规则与几何函数（不碰界面和网络），方便单独测试。
// 区域永远是一个凸多边形（开局是用 180 边形表示的圆）。
// 两台手机要算出完全一样的结果，所以对局计算只用 + - * / 和 sqrt，圆的顶点和球的状态都先取整。

export const DT = 1 / 240                 // 固定时间步长（秒）
const q = x => Math.round(x * 1e6) / 1e6

export function makeCircle(n = 180) {
  return Array.from({length: n}, (_, i) => {
    const a = i / n * Math.PI * 2
    return [q(Math.cos(a)), q(Math.sin(a))]
  })
}

export function area(poly) {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    s += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(s) / 2
}

// 每条边的单位内法线 (nx, ny) 和偏移 c：点到边的距离 = nx*x + ny*y - c（里面为正）
export function edgesOf(poly) {
  let cx = 0, cy = 0
  for (const p of poly) { cx += p[0]; cy += p[1] }
  cx /= poly.length; cy /= poly.length
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    let nx = a[1] - b[1], ny = b[0] - a[0]
    const len = Math.sqrt(nx * nx + ny * ny)
    if (len < 1e-5) continue
    nx /= len; ny /= len
    if (nx * (cx - a[0]) + ny * (cy - a[1]) < 0) { nx = -nx; ny = -ny }
    out.push([nx, ny, nx * a[0] + ny * a[1]])
  }
  return out
}

// 小球走一步：直线运动，碰到内壁镜面反弹
export function stepBall(ball, edges, r, dt = DT) {
  ball.x += ball.vx * dt
  ball.y += ball.vy * dt
  for (const [nx, ny, c] of edges) {
    const d = nx * ball.x + ny * ball.y - c
    if (d >= r) continue
    ball.x += nx * (r - d); ball.y += ny * (r - d)
    const vn = ball.vx * nx + ball.vy * ny
    if (vn < 0) { ball.vx -= 2 * vn * nx; ball.vy -= 2 * vn * ny }
  }
}

// 过 a、b 两点的直线把多边形分成两半：side = 1 或 -1
const sideOf = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])

export function clip(poly, a, b, side) {
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], n = poly[(i + 1) % poly.length]
    const sp = sideOf(a, b, p) * side, sn = sideOf(a, b, n) * side
    if (sp >= 0) out.push(p)
    if ((sp > 0 && sn < 0) || (sp < 0 && sn > 0)) {
      const t = sp / (sp - sn)
      out.push([q(p[0] + (n[0] - p[0]) * t), q(p[1] + (n[1] - p[1]) * t)])
    }
  }
  return out.filter((p, i) => {
    const prev = out[(i + out.length - 1) % out.length]
    return out.length < 2 || Math.abs(p[0] - prev[0]) + Math.abs(p[1] - prev[1]) > 1e-5
  })
}

// 玩家划出的线段 a→b 延长成整条直线后切到区域的部分。
// 返回 {from, to, len, small}：刀从 from 走到 to（方向和手指划的一致）；small = 较小一块的面积比例。
// 直线没穿过区域则返回 null。
export function chordOf(poly, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const dl = Math.sqrt(dx * dx + dy * dy)
  if (!(dl > 1e-6)) return null
  const ux = dx / dl, uy = dy / dl
  let lo = -Infinity, hi = Infinity
  for (const [nx, ny, c] of edgesOf(poly)) {
    const d0 = nx * a[0] + ny * a[1] - c, k = nx * ux + ny * uy
    if (Math.abs(k) < 1e-9) { if (d0 < 0) return null; continue }
    const s = -d0 / k
    if (k > 0) lo = Math.max(lo, s); else hi = Math.min(hi, s)
  }
  if (!(hi - lo > 1e-3) || !Number.isFinite(hi - lo)) return null
  const left = clip(poly, a, b, 1), right = clip(poly, a, b, -1)
  const total = area(poly)
  const small = left.length < 3 || right.length < 3 ? 0 : Math.min(area(left), area(right)) / total
  return {
    from: [a[0] + ux * lo, a[1] + uy * lo],
    to: [a[0] + ux * hi, a[1] + uy * hi],
    len: hi - lo, small
  }
}

function distToSegment(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0
  const ex = x - a[0] - dx * t, ey = y - a[1] - dy * t
  return Math.sqrt(ex * ex + ey * ey)
}

export const tipAt = (chord, t, speed) => {
  const k = Math.min(1, t * speed / chord.len)
  return [chord.from[0] + (chord.to[0] - chord.from[0]) * k, chord.from[1] + (chord.to[1] - chord.from[1]) * k]
}

export const roundBall = b => ({x: q(b.x), y: q(b.y), vx: q(b.vx), vy: q(b.vy)})

// 一刀下去会发生什么：刀沿弦前进，小球同时照常运动；小球碰到已经切开的部分就算"切到球"。
// 返回 {hit, duration, ball}（ball 是结束时小球的状态）
export function simulateCut(poly, start, r, chord, bladeSpeed) {
  const edges = edgesOf(poly), ball = {...start}
  const total = chord.len / bladeSpeed
  let t = 0
  for (;;) {
    if (distToSegment(ball.x, ball.y, chord.from, tipAt(chord, t, bladeSpeed)) <= r) return {hit: true, duration: t, ball}
    if (t >= total) return {hit: false, duration: t, ball}
    t += DT
    stepBall(ball, edges, r)
  }
}

// 区域里最多能放下多大的圆（近似值），用来防止小球大过场地
export function inradius(poly) {
  const edges = edgesOf(poly)
  const depth = (x, y) => edges.reduce((m, [nx, ny, c]) => Math.min(m, nx * x + ny * y - c), Infinity)
  let x = 0, y = 0
  for (const p of poly) { x += p[0] / poly.length; y += p[1] / poly.length }
  let best = depth(x, y)
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]]
  for (let step = .25; step > .001; step /= 2) {
    for (let moved = true, i = 0; moved && i < 40; i++) {
      moved = false
      for (const [dx, dy] of dirs) {
        const d = depth(x + dx * step, y + dy * step)
        if (d > best + 1e-9) { best = d; x += dx * step; y += dy * step; moved = true }
      }
    }
  }
  return best
}

// 切完以后：保留有球的一侧，按切掉的总面积把球变大，并把球挪回墙内
export function applyCut(poly, chord, ball, startArea, cfg) {
  const side = sideOf(chord.from, chord.to, [ball.x, ball.y]) >= 0 ? 1 : -1
  const kept = clip(poly, chord.from, chord.to, side)
  const removed = clip(poly, chord.from, chord.to, -side)
  const gone = Math.max(0, 1 - area(kept) / startArea)
  const r = q(Math.min(cfg.BALL_RADIUS + cfg.BALL_GROW * gone, inradius(kept) * 0.8))
  const next = {...ball}
  const edges = edgesOf(kept)
  for (let i = 0; i < 40; i++) {
    for (const [nx, ny, c] of edges) {
      const d = nx * next.x + ny * next.y - c
      if (d < r) { next.x += nx * (r - d); next.y += ny * (r - d) }
    }
  }
  return {poly: kept, removed, r, ball: roundBall(next), gone}
}

// 用双方合并出的随机种子决定开局的球。返回 {x, y, vx, vy}
export function startBall(seed, speed) {
  let s = seed >>> 0
  const rnd = () => {                       // mulberry32
    s = (s + 0x6D2B79F5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pos = rnd() * Math.PI * 2, dist = .2 + rnd() * .4
  // 方向和半径方向错开一个角度，避免沿直径来回的单调轨迹
  const dir = pos + (rnd() < .5 ? 1 : -1) * (.5 + rnd() * 1.1)
  return roundBall({x: Math.cos(pos) * dist, y: Math.sin(pos) * dist, vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed})
}

// 收到对方报来的球状态时检查是否合理
export function validBall(b, poly, r, speed) {
  if (![b.x, b.y, b.vx, b.vy].every(Number.isFinite)) return false
  if (Math.abs(Math.sqrt(b.vx * b.vx + b.vy * b.vy) - speed) > .01) return false
  return edgesOf(poly).every(([nx, ny, c]) => nx * b.x + ny * b.y - c >= r - .02)
}

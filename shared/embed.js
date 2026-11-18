// 内嵌模式：游戏页面被大厅放进 <iframe> 运行时，由这里代替 Trystero。
// 游戏代码不用改：它拿到的 `room` 长得和 Trystero 一样（makeAction / onPeerJoin / getSelf…），
// 但消息其实是通过 postMessage 交给大厅，由大厅转发给房间里的其他玩家。
//
// 另外，当房间里有观战者时，大厅会让"第一位玩家"的页面定时把自己的画面拍成快照，
// 转发给观战者（见文末 startMirror）。

export function createEmbeddedLobby({gameId, container, setup, onOpponentJoin, onOpponentLeave}) {
  document.documentElement.classList.add('embed')
  if (container) container.hidden = true

  const post = m => parent.postMessage(m, location.origin)
  const actions = new Map()
  const joinH = [], leaveH = []
  const have = new Set()        // 当前在场的对手
  let opp = null                // 第一位对手（和单页模式的行为一致）
  let selfId = null, started = false

  const room = {
    makeAction(ns) {
      if (!actions.has(ns)) actions.set(ns, [])
      return {
        send: (data, opts) => { post({t: 'send', ns, data, target: opts && opts.target}); return Promise.resolve() },
        onMessage: h => { actions.get(ns).push(h); return () => {} },
        onReceive: () => () => {}, onReceiveProgress: () => () => {}
      }
    },
    onPeerJoin: h => { joinH.push(h); return () => {} },
    onPeerLeave: h => { leaveH.push(h); return () => {} },
    getSelf: async () => ({peerId: selfId}),
    ping: async () => 0,
    leave: async () => {}
  }

  function sync(list) {
    for (const id of [...have]) {
      if (list.includes(id)) continue
      have.delete(id)
      leaveH.forEach(h => h({peerId: id}))
      if (id === opp) { opp = null; if (onOpponentLeave) onOpponentLeave() }
    }
    for (const id of list) {
      if (have.has(id)) continue
      have.add(id)
      joinH.forEach(h => h({peerId: id}))
      if (!opp) { opp = id; if (onOpponentJoin) onOpponentJoin(id) }
    }
    if (!opp && have.size) { opp = [...have][0]; if (onOpponentJoin) onOpponentJoin(opp) }
  }

  return new Promise(resolve => {
    window.addEventListener('message', ev => {
      if (ev.source !== parent || ev.origin !== location.origin) return
      const m = ev.data
      if (!m || typeof m !== 'object') return
      if (m.t === 'init' && !started) {
        started = true
        selfId = m.selfId
        try { if (setup) setup(room) } catch (e) { console.error(e) }
        sync(Array.isArray(m.opponents) ? m.opponents : [])
        post({t: 'ready'})
        watchHeight()
        resolve({room, role: m.role || 'player'})
      } else if (m.t === 'peers' && started) {
        sync(Array.isArray(m.opponents) ? m.opponents : [])
      } else if (m.t === 'msg' && started) {
        const hs = actions.get(m.ns)
        if (hs) hs.forEach(h => { try { h(m.data, {peerId: m.peerId}) } catch (e) { console.error(e) } })
      } else if (m.t === 'mirror') {
        startMirror(!!m.on, !!m.force)
      }
    })
    post({t: 'hello', gameId})
  })

  // 把页面高度告诉大厅，让 iframe 刚好撑满
  function watchHeight() {
    let raf = 0, last = 0
    const report = () => {
      raf = 0
      const h = Math.ceil(document.documentElement.scrollHeight)
      if (h !== last) { last = h; post({t: 'height', h}) }
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(report) }
    new ResizeObserver(kick).observe(document.documentElement)
    new MutationObserver(kick).observe(document.body, {childList: true, subtree: true, attributes: true})
    kick()
  }
}

// ---------- 观战镜像：定时给自己的页面拍快照 ----------
let mirrorTimer = null, mirrorLast = ''

function buildSnapshot() {
  const clone = document.body.cloneNode(true)
  const live = document.body.querySelectorAll('canvas')
  const copies = clone.querySelectorAll('canvas')
  live.forEach((cv, i) => {
    try {
      let src = cv
      if (cv.width > 480) {                                   // 画布太大就缩小，减少传输量
        src = document.createElement('canvas')
        src.width = 480; src.height = Math.round(cv.height * 480 / cv.width)
        src.getContext('2d').drawImage(cv, 0, 0, src.width, src.height)
      }
      const img = document.createElement('img')
      img.src = src.toDataURL('image/png')
      img.id = cv.id; img.className = cv.className; img.style.cssText = cv.style.cssText
      if (!img.style.width) img.style.width = '100%'
      copies[i].replaceWith(img)
    } catch { /* 画布被污染等情况：跳过 */ }
  })
  clone.querySelectorAll('script').forEach(n => n.remove())
  const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n')
  return {css, html: clone.innerHTML}
}

function startMirror(on, force) {
  if (!on) { clearInterval(mirrorTimer); mirrorTimer = null; mirrorLast = ''; return }
  if (force) mirrorLast = ''
  const tick = () => {
    try {
      const snap = buildSnapshot()
      const key = snap.html + '|' + snap.css.length
      if (key === mirrorLast || snap.html.length > 400000) return
      mirrorLast = key
      parent.postMessage({t: 'snap', snap}, location.origin)
    } catch (e) { console.error(e) }
  }
  if (!mirrorTimer) mirrorTimer = setInterval(tick, 600)
  tick()
}

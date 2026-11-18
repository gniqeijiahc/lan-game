// 所有联机游戏共用的"房间"模块：
//   - 房间号放在网址 # 后面（没有就自动生成）
//   - 显示二维码 / 分享链接，对方连上后自动隐藏
//   - 用 Trystero 连接（默认 Nostr，可用 ?s=torrent 或 ?s=mqtt 切换）
//
// 游戏页面这样用：
//   const lobby = await createLobby({
//     gameId: 'rps',
//     container: document.getElementById('lobby'),
//     setup(room, acceptPeer) { /* 在这里 room.makeAction(...) 并注册 onMessage */ },
//     onOpponentJoin(peerId) {}, onOpponentLeave() {}
//   })

const VERSION = '0.27.0'   // 固定 Trystero 版本，避免库更新后接口变化把游戏弄坏
const STRATEGY_URL = {
  nostr:   `https://cdn.jsdelivr.net/npm/trystero@${VERSION}/+esm`,
  torrent: `https://cdn.jsdelivr.net/npm/@trystero-p2p/torrent@${VERSION}/+esm`,
  mqtt:    `https://cdn.jsdelivr.net/npm/@trystero-p2p/mqtt@${VERSION}/+esm`
}
const QR_SRC = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'
const APP_ID = 'gniqeijiahc/lan-game'   // 全局唯一的应用名，避免和别人撞房间

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = resolve
    s.onerror = () => reject(new Error('加载失败：' + src))
    document.head.appendChild(s)
  })
}

function makeRoomId() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), b => alphabet[b % alphabet.length]).join('')
}

export async function createLobby({gameId, container, setup, onOpponentJoin, onOpponentLeave}) {
  const params = new URLSearchParams(location.search)
  const strategy = STRATEGY_URL[params.get('s')] ? params.get('s') : 'nostr'

  // 无论是谁打开页面都可以分享：有 # 就用它，没有就生成
  let roomId = location.hash.slice(1)
  if (!roomId) {
    roomId = makeRoomId()
    history.replaceState(null, '', location.pathname + location.search + '#' + roomId)
  }

  container.innerHTML = `
    <div class="card">
      <div class="status wait" data-el="status">正在连接…</div>
      <div class="muted" data-el="detail"></div>
    </div>
    <div class="card" data-el="share">
      <div class="muted">让对方用手机相机扫这个码，打开后会自动加入：</div>
      <div class="qr" data-el="qr"></div>
      <div class="row">
        <input type="text" data-el="link" readonly>
        <button class="small" type="button" data-el="copy">复制</button>
      </div>
    </div>`
  const el = name => container.querySelector(`[data-el="${name}"]`)
  const setStatus = (text, ok) => { el('status').textContent = text; el('status').className = 'status ' + (ok ? 'ok' : 'wait') }

  el('link').value = location.href
  el('copy').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); el('copy').textContent = '已复制' }
    catch { el('link').select() }
  }
  loadScript(QR_SRC).then(() => {
    const qr = window.qrcode(0, 'M')
    qr.addData(location.href)
    qr.make()
    el('qr').innerHTML = qr.createSvgTag(6, 2)
  }).catch(() => { el('qr').textContent = '二维码加载失败，请复制链接发给对方' })

  // ---------- 连接 ----------
  let joinRoom
  try {
    ;({joinRoom} = await import(STRATEGY_URL[strategy]))
  } catch (err) {
    setStatus('❌ 加载联机库失败', false)
    el('detail').textContent = '请检查网络，或在网址的 ? 后加 s=torrent 换一个信令通道再试。' + err
    return null
  }

  let room
  try {
    // password 让数据在两端之间加密；房间名带上游戏名，不同游戏互不干扰
    const config = {appId: APP_ID, password: roomId}
    if (params.get('identity') === 'none') config.identity = 'none'
    room = joinRoom(config, `${gameId}:${roomId}`)
  } catch (err) {
    setStatus('❌ 联机初始化失败', false)
    el('detail').textContent = String(err && err.stack || err)
    return null
  }

  const peers = new Set()
  let opp = null
  const detailBase = `房间 ${roomId} · 信令通道：${strategy}`
  el('detail').textContent = detailBase

  const refresh = () => {
    if (peers.size > 1) setStatus('⚠️ 房间里超过 2 人，只和第一位对手对战', false)
    else if (opp) setStatus('✅ 已连接，开始对战', true)
    else setStatus('等待对方加入…（可让对方扫码）', false)
    el('share').hidden = peers.size > 0
  }

  const acceptPeer = peerId => {
    if (!peerId) return false
    if (!opp) {
      opp = peerId
      if (onOpponentJoin) onOpponentJoin(peerId)
    }
    refresh()
    return peerId === opp
  }

  try {
    if (setup) setup(room, acceptPeer)
  } catch (err) {
    setStatus('❌ 联机初始化失败', false)
    el('detail').textContent = String(err && err.stack || err)
    return null
  }

  room.onPeerJoin(async ({peerId}) => {
    peers.add(peerId)
    acceptPeer(peerId)
    try { const ms = await room.ping(peerId); el('detail').textContent = `${detailBase} · 延迟约 ${Math.round(ms)} ms` } catch {}
  })
  room.onPeerLeave(({peerId}) => {
    peers.delete(peerId)
    if (peerId === opp) {
      opp = peers.values().next().value || null
      if (onOpponentLeave) onOpponentLeave()
      if (opp && onOpponentJoin) onOpponentJoin(opp)
    }
    refresh()
    el('detail').textContent = detailBase
  })
  refresh()

  return {room, roomId, strategy, peers, get opponent() { return opp }}
}

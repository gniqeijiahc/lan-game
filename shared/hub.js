// 游戏大厅：输入房间号 → 房主/客人 → 房主选游戏 → 所有人进入同一个游戏。
// 游戏放在 <iframe> 里运行（见 embed.js），联机统一由这里负责；多出来的人观战。
import {GAMES} from '../games/registry.js'
import {createRoom, MAX_MEMBERS} from './room.js'

const $ = id => document.getElementById(id)
const store = {
  get(k) { try { return localStorage.getItem(k) || '' } catch { return '' } },
  set(k, v) { try { localStorage.setItem(k, v) } catch {} }
}
const gameById = id => GAMES.find(g => g.id === id)
const screens = ['join', 'connecting', 'lobby', 'play']
const show = name => screens.forEach(n => { $(n).hidden = n !== name })
const setErr = msg => { $('joinErr').textContent = msg || '' }
const QR_SRC = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'

let room = null
let snap = null

// ---------- 加入表单 ----------
const hashCode = (location.hash.match(/\d{4}/) || [''])[0]
$('name').value = store.get('lg:name')
$('code').value = hashCode || store.get('lg:code')
$('code').addEventListener('input', () => { $('code').value = $('code').value.replace(/\D/g, '').slice(0, 4) })
$('rand').onclick = () => { $('code').value = String(Math.floor(Math.random() * 10000)).padStart(4, '0') }
$('joinForm').onsubmit = e => { e.preventDefault(); join($('code').value.trim(), $('name').value.trim()) }
$('leave1').onclick = $('leave2').onclick = () => leave()
$('endGame').onclick = () => room && room.endGame()

async function join(code, name) {
  if (!/^\d{4}$/.test(code)) return setErr('请输入 4 位数字的房间号')
  if (!name) return setErr('请先输入昵称')
  setErr('')
  store.set('lg:name', name); store.set('lg:code', code)
  history.replaceState(null, '', location.pathname + location.search + '#' + code)
  $('connMsg').textContent = `正在寻找房间 ${code}…`
  show('connecting')
  try {
    room = await createRoom({code, name})
  } catch (err) {
    room = null
    show('join')
    return setErr('联机库加载失败，请检查网络；也可以在网址的 ? 后加 s=torrent 再试。' + (err && err.message || ''))
  }
  setupBridge(room)
  room.on(onSnap)
}

function leave(msg) {
  unmountStage()
  if (room) room.leave()
  room = null; snap = null
  history.replaceState(null, '', location.pathname + location.search)
  show('join')
  setErr(msg || '')
}

function onSnap(s) {
  snap = s
  if (s.status === 'full') return leave(`房间已满（最多 ${MAX_MEMBERS} 人）`)
  if (s.status !== 'ready') { show('connecting'); return }
  const g = s.session.gameId && gameById(s.session.gameId)
  if (g) renderPlay(s, g); else renderLobby(s)
}

// ---------- 大厅 ----------
function renderRoster(listEl, s, tag) {
  listEl.textContent = ''
  s.members.forEach((m, i) => {
    const li = document.createElement('li')
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = m.name
    li.appendChild(nm)
    const badges = []
    if (i === 0) badges.push(['房主', 'host'])
    if (m.self) badges.push(['你', 'me'])
    const t = tag && tag(m, i); if (t) badges.push(t)
    badges.forEach(([text, cls]) => { const b = document.createElement('span'); b.className = 'badge ' + cls; b.textContent = text; li.appendChild(b) })
    listEl.appendChild(li)
  })
}

let qrFor = ''
function renderShare(code) {
  const url = location.origin + location.pathname + location.search + '#' + code
  $('link').value = url
  if (qrFor === url) return
  qrFor = url
  $('qr').textContent = ''
  const draw = () => { try { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); $('qr').innerHTML = q.createSvgTag(6, 2) } catch { $('qr').textContent = '二维码生成失败，请复制链接' } }
  if (window.qrcode) return draw()
  const sc = document.createElement('script'); sc.src = QR_SRC; sc.onload = draw
  sc.onerror = () => { $('qr').textContent = '二维码加载失败，请复制链接' }
  document.head.appendChild(sc)
}
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('link').value); $('copy').textContent = '已复制' } catch { $('link').select() }
}

function renderLobby(s) {
  unmountStage()
  show('lobby')
  $('lbCode').textContent = s.code
  $('lbRole').textContent = s.isHost ? '你是房主' : '你是客人'
  $('lbCount').textContent = `${s.members.length}/${MAX_MEMBERS} 人`
  renderRoster($('lbRoster'), s)
  renderShare(s.code)
  $('lbHint').textContent = s.isHost ? '请选择要玩的游戏，所有人会自动进入。' : `等待房主（${s.members[0].name}）选择游戏…`
  const box = $('games'); box.textContent = ''
  GAMES.forEach(g => {
    const b = document.createElement('button')
    b.type = 'button'; b.className = 'game'; b.disabled = !s.isHost
    b.innerHTML = '<div class="icon"></div><div class="info"><div class="name"></div><div class="desc"></div><span class="tag"></span></div>'
    b.querySelector('.icon').textContent = g.icon
    b.querySelector('.name').textContent = g.name
    b.querySelector('.desc').textContent = g.desc
    b.querySelector('.tag').textContent = g.players + (g.max < MAX_MEMBERS ? ' · 其余观战' : '')
    b.onclick = () => room && room.startGame(g.id, g.max)
    box.appendChild(b)
  })
}

// ---------- 游戏中 ----------
let mounted = null            // 当前已挂载的 `${seq}:${role}`
let frame = null, frameReady = false
let mirrorRoot = null
let lastOpp = '', lastSpecKey = ''
const pending = new Map()     // seq -> 提前到达的游戏消息

function unmountStage() {
  mounted = null
  if (frame) { frame.remove(); frame = null }
  frameReady = false; mirrorRoot = null
  $('stage').textContent = ''
  lastOpp = ''; lastSpecKey = ''
}

const toFrame = m => { if (frame && frame.contentWindow) frame.contentWindow.postMessage(m, location.origin) }
const opponentsOf = s => s.session.players.filter(id => id !== s.selfId)
const namesOf = s => Object.fromEntries(s.members.map(m => [m.id, m.name]))   // 多人游戏用它显示玩家昵称
const spectatorsOf = s => s.members.map(m => m.id).filter(id => !s.session.players.includes(id))

function renderPlay(s, g) {
  show('play')
  const isPlayer = s.session.players.includes(s.selfId)
  const nameOf = id => (s.members.find(m => m.id === id) || {}).name || '?'
  $('pyGame').textContent = `${g.icon} ${g.name}`
  $('pyRole').textContent = isPlayer ? '你在场上' : '观战中'
  $('pyWho').textContent = '玩家：' + s.session.players.map(nameOf).join('、') +
    (spectatorsOf(s).length ? ` · 观战 ${spectatorsOf(s).length} 人` : '')
  $('endGame').hidden = !s.isHost
  $('pyHint').textContent = s.isHost ? '' : '游戏由房主控制，结束后会自动回到大厅。'

  const key = `${s.session.seq}:${isPlayer ? 'p' : 's'}`
  if (key !== mounted) {
    unmountStage()
    mounted = key
    if (isPlayer) mountFrame(g); else mountMirror()
  }
  if (isPlayer) {
    const opp = JSON.stringify(opponentsOf(s))
    if (frameReady && opp !== lastOpp) { lastOpp = opp; toFrame({t: 'peers', opponents: opponentsOf(s), names: namesOf(s)}) }
    syncMirrorFlag(s)
  }
}

function mountFrame(g) {
  frame = document.createElement('iframe')
  frame.className = 'frame'; frame.setAttribute('scrolling', 'no')
  frame.title = g.name
  frame.src = g.path + '?embed=1'
  $('stage').appendChild(frame)
}

function syncMirrorFlag(s) {
  const want = s.session.players[0] === s.selfId && spectatorsOf(s).length > 0
  const specKey = want ? spectatorsOf(s).join(',') : ''
  if (!frameReady) return
  if (specKey !== lastSpecKey) { lastSpecKey = specKey; toFrame({t: 'mirror', on: want, force: true}) }
}

function mountMirror() {
  const host = document.createElement('div')
  host.className = 'mirror'
  $('stage').appendChild(host)
  mirrorRoot = host.attachShadow({mode: 'open'})
  mirrorRoot.innerHTML = '<link rel="stylesheet" href="shared/style.css"><div class="mbody"><p class="muted" style="text-align:center">等待画面…</p></div>'
}

// 观战画面：对方页面的快照。先清洗再显示，且不可操作。
function fixCss(css) {
  return String(css).replace(/:root\b/g, ':host')
    .replace(/(^|[\s,{}>+~])(html|body)(?=[\s,{.:#\[>+~]|$)/g, '$1.mbody')
}
function sanitize(root) {
  root.querySelectorAll('script,iframe,object,embed,link,meta,base,style,form').forEach(n => n.remove())
  root.querySelectorAll('*').forEach(el => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase(), v = String(a.value).trim().toLowerCase()
      if (n.startsWith('on') || n === 'href' || n === 'srcdoc' || n === 'formaction' || n === 'xlink:href') el.removeAttribute(a.name)
      else if (n === 'src' && !v.startsWith('data:image/')) el.removeAttribute(a.name)
      else if (n === 'style' && /url\s*\(|expression/i.test(v)) el.removeAttribute(a.name)
    }
  })
}
function renderMirror(m) {
  if (!mirrorRoot || !m || typeof m.html !== 'string' || typeof m.css !== 'string') return
  const tpl = document.createElement('template')
  tpl.innerHTML = m.html
  sanitize(tpl.content)
  const wrap = document.createElement('div'); wrap.className = 'mbody'
  wrap.appendChild(tpl.content)
  const st = document.createElement('style')
  st.textContent = fixCss(m.css.replace(/@import[^;]*;/g, '')) + '\n.mbody{pointer-events:none;user-select:none;}\n.mbody .back,.mbody main>h1{display:none;}'
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'shared/style.css'
  mirrorRoot.replaceChildren(link, st, wrap)
}

// ---------- 大厅 <-> iframe / 其他玩家 的桥 ----------
let bridged = null
function setupBridge(r) {
  bridged = r
  r.onGame((m, from) => {
    if (!snap || !m || typeof m.ns !== 'string' || !Number.isInteger(m.s)) return
    if (m.s < snap.session.seq) return
    const item = {ns: m.ns, data: m.d, peerId: from}
    if (m.s > snap.session.seq || !frameReady) {
      const q = pending.get(m.s) || []
      if (q.length < 300) q.push(item)
      pending.set(m.s, q)
      return
    }
    if (snap.session.players.includes(from)) toFrame({t: 'msg', ...item})
  })
  r.onMirror((m, from) => {
    if (!snap || !m || m.s !== snap.session.seq || from !== snap.session.players[0]) return
    if (snap.session.players.includes(snap.selfId)) return
    renderMirror(m)
  })
}

window.addEventListener('message', ev => {
  if (!room || !snap || !frame || ev.source !== frame.contentWindow || ev.origin !== location.origin) return
  const m = ev.data
  if (!m || typeof m !== 'object') return
  const s = snap
  if (m.t === 'hello') {
    frameReady = false
    toFrame({t: 'init', selfId: s.selfId, opponents: opponentsOf(s), names: namesOf(s), role: 'player'})
    lastOpp = JSON.stringify(opponentsOf(s))
  } else if (m.t === 'ready') {
    frameReady = true
    const q = pending.get(s.session.seq) || []
    for (const k of [...pending.keys()]) if (k <= s.session.seq) pending.delete(k)
    q.forEach(it => { if (s.session.players.includes(it.peerId)) toFrame({t: 'msg', ...it}) })
    lastSpecKey = ''
    syncMirrorFlag(s)
  } else if (m.t === 'send') {
    const opp = opponentsOf(s)
    let target = m.target == null ? opp : [].concat(m.target).filter(id => opp.includes(id))
    if (!target.length || typeof m.ns !== 'string') return
    room.sendGame({s: s.session.seq, ns: m.ns, d: m.data}, target)
  } else if (m.t === 'height') {
    if (Number.isFinite(m.h)) frame.style.height = Math.min(Math.max(m.h, 200), 4000) + 'px'
  } else if (m.t === 'snap') {
    const specs = spectatorsOf(s)
    if (s.session.players[0] === s.selfId && specs.length && m.snap && typeof m.snap.html === 'string')
      room.sendMirror({s: s.session.seq, css: m.snap.css, html: m.snap.html}, specs)
  }
})

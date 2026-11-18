// 房间网络层（大厅使用）：
//   - 用 4 位房间号加入同一个 Trystero 房间
//   - 首个进入的人是房主；之后进入的是客人
//   - 成员名单由房主维护并广播；房主离开时，名单里的下一位自动接任
//   - 最多 MAX_MEMBERS 人
//
// 没有服务器，所以"谁先到"靠这样判断：加入后先等 DISCOVERY_MS 看有没有现成的名单，
// 没有就自己当房主；两人同时进入空房间时，按 (进入时间, id) 排序，较早者当房主。
// 万一出现两个房主，名单人数多的一方胜出（人数相同则较早的胜出），另一方自动让位。

const VERSION = '0.27.0'   // 固定 Trystero 版本
export const STRATEGY_URL = {
  nostr:   `https://esm.run/trystero@${VERSION}`,
  torrent: `https://esm.run/@trystero-p2p/torrent@${VERSION}`,
  mqtt:    `https://esm.run/@trystero-p2p/mqtt@${VERSION}`
}
export const APP_ID = 'gniqeijiahc/lan-game'
export const MAX_MEMBERS = 10
const DISCOVERY_MS = 3000   // 等待现成名单的时间
const FORCE_MS = 8000       // 一直没等到名单就强制自建

export function pickStrategy() {
  const s = new URLSearchParams(location.search).get('s')
  return STRATEGY_URL[s] ? s : 'nostr'
}

const emptySession = () => ({gameId: null, max: 0, seq: 0, players: []})
const cleanName = n => String(n ?? '').trim().slice(0, 12) || '玩家'
const isId = x => typeof x === 'string' && x.length > 0 && x.length < 100

function cleanRoster(m) {
  if (!m || typeof m !== 'object') return null
  if (!Number.isInteger(m.v) || !isId(m.hostId) || !Number.isFinite(m.hostT)) return null
  if (!Array.isArray(m.members) || m.members.length < 1 || m.members.length > MAX_MEMBERS) return null
  if (!m.members.every(x => x && isId(x.id) && typeof x.name === 'string')) return null
  if (m.members[0].id !== m.hostId) return null            // 约定：名单第一位就是房主
  const s = m.session
  if (!s || !Array.isArray(s.players) || !Number.isInteger(s.seq) || !Number.isInteger(s.max)) return null
  return {
    v: m.v, hostId: m.hostId, hostT: m.hostT,
    members: m.members.map(x => ({id: x.id, name: cleanName(x.name)})),
    session: {
      gameId: typeof s.gameId === 'string' ? s.gameId.slice(0, 40) : null,
      max: Math.max(0, Math.min(s.max, MAX_MEMBERS)), seq: s.seq,
      players: s.players.filter(isId).slice(0, MAX_MEMBERS)
    }
  }
}

// a 是否比 b 更"强"：人数多者强；相同则房主进入更早者强；再相同则 id 小者强
function stronger(a, b) {
  if (a.members.length !== b.members.length) return a.members.length > b.members.length
  if (a.hostT !== b.hostT) return a.hostT < b.hostT
  return a.hostId < b.hostId
}

export async function createRoom({code, name, strategy = pickStrategy()}) {
  const {joinRoom} = await import(STRATEGY_URL[strategy])
  const room = joinRoom({appId: APP_ID, password: String(code)}, `hub:${code}`)
  const selfId = (await room.getSelf()).peerId
  const self = {id: selfId, name: cleanName(name), t: Date.now()}

  const peers = new Map()        // peerId -> {name, t}（已打过招呼的人）
  const listeners = new Set()
  const timers = []
  let roster = null              // {v, hostId, hostT, members, session}
  let status = 'connecting'      // connecting | ready | full
  let closed = false

  const helloAct = room.makeAction('hello')
  const rosterAct = room.makeAction('roster')
  const gameAct = room.makeAction('g')
  const mirrorAct = room.makeAction('mir')
  const fullAct = room.makeAction('full')
  const send = (act, data, target) => act.send(data, target ? {target} : undefined).catch(() => {})

  const isHost = () => !!roster && roster.hostId === selfId
  const snapshot = () => ({
    code, status, selfId,
    hostId: roster ? roster.hostId : null,
    isHost: isHost(),
    members: roster ? roster.members.map(m => ({...m, self: m.id === selfId})) : [],
    session: roster ? {...roster.session, players: [...roster.session.players]} : emptySession(),
    v: roster ? roster.v : 0
  })
  const emit = () => { const s = snapshot(); listeners.forEach(f => f(s)) }
  const bump = () => { roster.v++; send(rosterAct, roster); emit() }
  const fixPlayers = () => {
    const s = roster.session
    if (s.gameId) s.players = roster.members.slice(0, s.max).map(m => m.id)
  }

  // ---------- 没人先到：自己当房主 ----------
  function found(force) {
    if (roster || closed) return
    const cands = [self, ...[...peers].map(([id, p]) => ({id, name: p.name, t: p.t}))]
    cands.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1))
    if (!force && cands[0].id !== selfId) return          // 别人更早，等他的名单
    roster = {
      v: 1, hostId: cands[0].id, hostT: cands[0].t,
      members: cands.slice(0, MAX_MEMBERS).map(c => ({id: c.id, name: c.name})),
      session: emptySession()
    }
    if (force && cands[0].id !== selfId) {                 // 强制模式：自己做房主，名单第一位必须是自己
      roster.members = [{id: selfId, name: self.name}, ...roster.members.filter(m => m.id !== selfId)]
      roster.hostId = selfId; roster.hostT = self.t
    }
    status = 'ready'
    send(rosterAct, roster)
    emit()
  }
  timers.push(setTimeout(() => found(false), DISCOVERY_MS))
  timers.push(setTimeout(() => found(true), FORCE_MS))

  // ---------- 收到消息 ----------
  helloAct.onMessage((d, {peerId}) => {
    if (!d || typeof d.name !== 'string' || !Number.isFinite(d.t)) return
    peers.set(peerId, {name: cleanName(d.name), t: d.t})
    if (!isHost() || roster.members.some(m => m.id === peerId)) return
    if (roster.members.length >= MAX_MEMBERS) { send(fullAct, {}, peerId); return }
    roster.members.push({id: peerId, name: cleanName(d.name)})
    fixPlayers()                                           // 游戏中途加入：有空位就补上，否则观战
    bump()
  })

  let lastRehello = 0
  rosterAct.onMessage((raw, {peerId}) => {
    const m = cleanRoster(raw)
    if (!m || m.hostId !== peerId) return                  // 名单只认房主本人发的
    if (!m.members.some(x => x.id === selfId)) {           // 名单里还没有我：再打一次招呼
      if (Date.now() - lastRehello > 2000) { lastRehello = Date.now(); send(helloAct, {name: self.name, t: self.t}, peerId) }
      return
    }
    let adopt = false
    if (!roster) adopt = true
    else if (m.hostId === roster.hostId) adopt = m.v > roster.v
    else adopt = stronger(m, roster)
    if (!adopt) return
    roster = m
    status = 'ready'
    emit()
  })

  fullAct.onMessage(() => {
    if (roster) return
    status = 'full'
    emit()
    api.leave()
  })

  // ---------- 有人进出 ----------
  room.onPeerJoin(({peerId}) => { send(helloAct, {name: self.name, t: self.t}, peerId) })
  room.onPeerLeave(({peerId}) => {
    peers.delete(peerId)
    if (!roster) return
    const i = roster.members.findIndex(m => m.id === peerId)
    if (i < 0) return
    const wasHost = roster.hostId === peerId
    roster.members.splice(i, 1)
    if (wasHost) {                                         // 房主走了：名单里的下一位接任
      const next = roster.members[0]
      roster.hostId = next.id
      roster.hostT = next.id === selfId ? self.t : (peers.get(next.id) || {}).t ?? Date.now()
    }
    fixPlayers()                                           // 玩家走了，观战者按顺序补位
    if (isHost()) bump(); else emit()
  })

  const api = {
    selfId, code,
    on(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn) },
    startGame(gameId, max) {
      if (!isHost()) return false
      const seq = roster.session.seq + 1
      roster.session = {gameId, max, seq, players: []}
      fixPlayers()
      bump()
      return true
    },
    endGame() {
      if (!isHost()) return false
      roster.session = {...emptySession(), seq: roster.session.seq + 1}
      bump()
      return true
    },
    sendGame: (data, target) => send(gameAct, data, target),
    onGame: fn => gameAct.onMessage((d, {peerId}) => {
      if (roster && roster.members.some(m => m.id === peerId)) fn(d, peerId)
    }),
    sendMirror: (data, target) => send(mirrorAct, data, target),
    onMirror: fn => mirrorAct.onMessage((d, {peerId}) => fn(d, peerId)),
    leave() {
      if (closed) return
      closed = true
      timers.forEach(clearTimeout)
      listeners.clear()
      Promise.resolve(room.leave()).catch(() => {})
    }
  }
  return api
}

# 小游戏厅 · 新游戏开发规范（v2）

写给负责开发新游戏的 AI。请在动手前完整读完，交付前对照最后的「验收清单」自查。
v2 相对 v1 的主要变化：大厅改成「4 位房间号 + 房主选游戏 + 观战」，游戏被大厅放进 iframe 运行；游戏清单改放在 `games/registry.js`。

## 1. 项目是什么

- 仓库：`gniqeijiahc/lan-game`，GitHub Pages 托管。**纯静态网站**：无后端、无数据库、无构建步骤，只有 HTML / CSS / ES 模块 JS。
- 联机用 **Trystero 0.27.0**（浏览器之间 WebRTC 直连），**不要升级版本**。
- 使用流程：玩家输入昵称和 4 位房间号进入大厅 → 第一个进入的是房主 → 房主选游戏，所有人自动进入 → 双人游戏由房主和下一位进入的人上场，其余人观战。房主离开时名单里的下一位接任。一个房间最多 10 人。
- 参考实现：`games/rps/index.html`、`games/connect-four/index.html`。**开始前先读它们和 `shared/lobby.js`、`shared/embed.js`。**

## 2. 游戏是怎么被运行的（必须理解）

每个游戏仍然是一个独立页面 `games/<id>/index.html`，有两种运行方式，**同一份代码都要能跑**：

1. **被大厅内嵌**（正式使用）：大厅把页面放进 `<iframe src="games/<id>/?embed=1">`。此时 `createLobby` 不会连接 Trystero，而是通过 `postMessage` 把消息交给大厅转发。游戏拿到的 `room` 和 Trystero 的接口一致，但只支持下面第 3 节列出的这几个方法。
2. **独立打开**（开发调试）：直接访问页面，`createLobby` 自己建房间、显示二维码，两台设备扫码即可调试。

所以：**不要自己调用 `joinRoom`，不要读写 `location.hash` 来做房间号，不要假设自己是顶层窗口**（不要用 `window.top`、`location.href` 做跳转）。

观战：多出来的人由大厅负责。大厅会把第一位玩家的页面定时拍成**快照**（`document.body` 的 HTML + 页面里的 `<style>` + `<canvas>` 转成图片）发给观战者，观战者看到的是只读画面。因此：**游戏画面必须能从 DOM 看出来**——棋盘、分数、提示都用 DOM、SVG 或 `<canvas>` 画，不要依赖鼠标悬停、WebGL、视频、外部图片（`<img src="http...">` 在观战画面里会被去掉）。

## 3. 联机接口（只能用这些）

```js
import {createLobby} from '../../shared/lobby.js'

await createLobby({
  gameId: '<游戏id>',
  container: document.getElementById('lobby'),      // 页面里放一个 <div id="lobby"></div>
  setup(room) {
    const act = room.makeAction('move')              // 消息名：英文、不超过 12 个字符
    act.onMessage((data, {peerId}) => { /* 只处理来自对手的 */ })
  },
  onOpponentJoin(peerId) { /* 记录对手 id，重置游戏 */ },
  onOpponentLeave() { /* 清空对手 id，重置游戏 */ }
})
```

- `room.makeAction(ns)` → `{send(data, opts?), onMessage(handler)}`。`send(data)` 默认发给**对手**；`send(data, {target: peerId})` 发给指定对手。
- `room.getSelf()` → `Promise<{peerId}>`；`room.onPeerJoin(h)` / `room.onPeerLeave(h)`，回调参数是 `{peerId}`。
- 不要使用 `room.makeState`、`addStream`、`ping` 等其他接口（内嵌模式下不存在）。
- 所有 `makeAction` 和 `onMessage` **必须在 `setup(room)` 里注册**。
- 内嵌时，当对手变化（有人补位、有人离开）大厅会再次调用 `onOpponentJoin` / `onOpponentLeave`，游戏必须能在任何时候被重置并重新开始。
- `onOpponentJoin` / `onOpponentLeave` 只对应**第一位对手**，适合双人游戏。
- **多人游戏**（3 人以上，参考 `games/draw/`）：
  - 在 `games/registry.js` 里把 `max` 设成上限（最多 10）；`max` 等于 10 时没有观战者，房间里每个人都是玩家。
  - 改用 `createLobby({..., onPeerJoin(peerId), onPeerLeave(peerId), maxPlayers})`：房间里**每个人**进出都会通知（不要自己去 `room.onPeerJoin`，独立打开时会和大厅的回调互相覆盖）。`maxPlayers` 只影响独立打开时的提示文字。
  - 玩家昵称在 `room.names[peerId]`（内嵌时由大厅提供，含自己；独立打开时没有，要有兜底显示）。
  - `send(data)` 默认发给**所有**对手，`send(data, {target})` 发给指定的人。游戏必须能应对任何人**中途加入**（要有人把当前进度发给新人）、**中途离开**（包括"正在操作的那个人"离开），以及人数降到最低人数以下时的重置。
  - 不要依赖消息的先后到达顺序，也不要假定每个人的"在场名单"在同一时刻一致；需要全员一致的东西（如轮流顺序）用所有人都能各自算出的规则（例如对 peerId 排序），而不是靠协商。
- `createLobby` 独立打开失败时返回 `null`，内嵌时返回 `{room, role}`；游戏不需要使用返回值。

### 同步方式

- **对称同步（默认）**：两边各自运行同一套规则，只互相传"操作"。适合信息公开的回合制游戏。参考 `games/connect-four/`。
- **谁先手**：不要用 `Math.random()` 单方决定。参考现有游戏的做法：双方各出一个种子，用哈希"先提交、后揭晓"，再合并算出先手。
- 需要隐藏信息（猜拳、暗牌）用"先提交哈希、后揭晓"，参考 `games/rps/`。

## 4. 页面外壳

- `<html lang="zh-CN">`，带 `<meta name="viewport" content="width=device-width,initial-scale=1">` 和有意义的 `<title>`。
- 引入 `<link rel="stylesheet" href="../../shared/style.css">`，颜色一律用里面的 CSS 变量（`--bg --card --text --muted --accent --ok --warn --bad --line`），深色模式才会自动适配。
- 页面里保留返回链接和 `<h1>` 标题（独立打开时使用；被内嵌时大厅会自动隐藏它们）：

  ```html
  <main>
    <a class="back" id="back" href="../../">← 返回游戏厅</a>
    <h1>🎨 游戏名</h1>
    <div id="lobby"></div>
    ...
  ```
- **界面文字用简体中文。**
- 页面高度由内容决定，大厅会自动把 iframe 撑到合适高度。**不要用 `100vh` / `100dvh` 做布局**（在 iframe 里它指的是 iframe 自己，会越撑越高）。

## 5. 手机优先

- 按竖屏 360 到 430px 宽设计，不允许横向滚动。
- 可点击元素至少 44×44px，加 `touch-action: manipulation`，不要依赖 hover 或键盘。
- 棋盘、画布随宽度缩放（百分比或 `min()`），不要写死像素宽度。
- 不自动播放声音；如有音效，提供静音开关。
- 页面是放在 iframe 里的：不要使用 `alert()` / `confirm()`、弹出新窗口、全屏 API。

## 6. 联机设计规则

1. **所有收到的数据都不可信。** 校验类型、取值范围、是否轮到对方、当前阶段是否允许；不合法就忽略，不要报错崩溃。
2. 每条消息带上局数或步数编号，忽略过期、重复、乱序的消息。
3. 显示对方传来的文字一律用 `textContent`，**不要用 `innerHTML`**。
4. 收发消息只认来自对手的（`peerId === 对手id`）。
5. 对手加入或离开时必须**重置游戏**并清理定时器。
6. 单条消息保持很小（几 KB 以内）；不要每帧同步整个状态，只发变化或操作。
7. 不要假设延迟低或消息不丢；界面要有"等待对方…"的状态提示。
8. 不要把"已经开始"的状态存在 `localStorage` 里——每次进入游戏都是全新的一局。

## 7. 在大厅登记

在 `games/registry.js` 的 `GAMES` 数组里加一项（其他项不动）：

```js
{id: 'gomoku', icon: '⚫⚪', name: '五子棋', desc: '一句话说明玩法', players: '2 人', min: 2, max: 2, path: 'games/gomoku/', appIcon: '⚫', colors: ['#7d8aa5', '#4a5570']}
```

大厅只显示图标和名字：`name` 最多 5 个字；`colors` 是图标的两个渐变色（可选）；`icon` 含多个表情时用 `appIcon` 指定单个表情（可选）。

`min` / `max` 是玩家人数范围，超出 `max` 的人会成为观战者。**不再修改根目录 `index.html`**。同时在 `README.md` 的目录结构里补上新游戏。

## 8. 能改什么、不能改什么

- **可以**：新增 `games/<新id>/`，在 `games/registry.js` 加一项，更新 README。
- **不要碰**：其他游戏的文件；`index.html`、`shared/hub.js`、`shared/room.js`、`shared/embed.js`（大厅与房间逻辑）。
- **尽量不改** `shared/lobby.js`、`shared/style.css`。确实要改时（例如这次为多人游戏加的 `onPeerJoin` / `onPeerLeave` / `maxPlayers` / `room.names`，都是可选参数）：保持向后兼容，改完必须把**所有现有游戏**在大厅里重测一遍，并在提交说明里写清楚原因。
- 不要升级 Trystero 版本。

## 9. 外部依赖与内容限制

- 不要引入构建工具。需要库时只能从 `cdn.jsdelivr.net` 或 `esm.run` 加载，**必须固定版本号**，不要用 `latest`。
- 不接统计、广告、第三方登录，不请求别人的服务器，不收集个人信息。
- 内容适合学生：不含暴力血腥、赌博、成人内容。
- 不复制商业游戏的角色、名称、图片、音效。传统规则游戏可以做，图形用 emoji、CSS 或自己画的 SVG；引用外部素材要在游戏文件夹里注明出处和授权。

## 10. 测试要求

1. 对每个脚本做语法检查（把 `<script type="module">` 里的代码另存为 `.mjs` 后跑 `node --check`）。
2. **在大厅里实测**，而不仅是独立页面：用 Playwright 打开 3 个页面，把 Trystero 换成本地模拟（`BroadcastChannel`，拦截 `esm.run/trystero@0.27.0` 的请求，需支持 `send(data, {target})`、`getSelf`、`onPeerJoin({peerId})`、`onPeerLeave({peerId})`、`leave`）。至少覆盖：
   - 房主选游戏 → 两位玩家都进入并开始一局；
   - 第 3 个人加入成为观战者，观战画面和房主画面一致；
   - 房主离开后，下一位接任，观战者补位，游戏重新开始；
   - 对手中途离开后游戏正确重置。
3. 在 360px 宽的窗口下截图检查布局。
4. 如实说明：**真实的跨设备连接无法在自动化里验证**，需要用户用多台手机实测。

## 11. 交付方式

- 一个游戏一个提交，提交说明用中文。
- 不确定的需求（人数、规则细节、是否需要改共用模块）先问用户，不要自行扩大范围。
- 与本规范冲突时，以用户的明确指示为准，并在交付说明里指出冲突。

## 验收清单

- [ ] 游戏在 `games/<id>/index.html`，所有路径是相对路径
- [ ] 通过 `createLobby` 联机，消息注册在 `setup(room)` 内，只用第 3 节列出的接口
- [ ] 独立打开（扫码）和被大厅内嵌，两种方式都能正常玩
- [ ] 画面都在 DOM / SVG / canvas 里，没有依赖 hover、WebGL、外部图片，观战者能看到
- [ ] 对手加入/离开时游戏正确重置，无遗留定时器；不使用 `100vh`、`alert`
- [ ] 所有收到的消息都检查了 `peerId` 与数据合法性、带编号防乱序
- [ ] 使用 `shared/style.css` 变量，深色模式正常；360px 宽竖屏可用，按钮不小于 44px
- [ ] 界面为简体中文，保留返回链接和 `<h1>`
- [ ] 已在 `games/registry.js` 登记（含 `min` / `max`），README 已更新；没有改 `index.html`
- [ ] 没有改动其他游戏和大厅文件；共用模块的改动（如有）已说明且全部游戏回归通过
- [ ] 外部库已固定版本，没有统计/广告/外部服务
- [ ] 完成了第 10 节的测试，并写明未能验证的部分

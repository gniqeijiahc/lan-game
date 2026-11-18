# 小游戏厅（Trystero 联机）

纯静态网页，托管在 GitHub Pages，不需要自己的服务器。
打开首页选择游戏 → 页面出现二维码 → 对方扫码加入 → 两台设备 WebRTC 直连。

## 目录结构

```
index.html          游戏大厅（选择游戏）
shared/
  lobby.js          所有游戏共用的联机模块（房间号、二维码、连接状态）
  style.css         共用样式
games/
  rps/index.html    剪刀石头布
  connect-four/index.html    四子棋
  draw/index.html   你画我猜（画布笔迹实时同步，词库在文件里的 WORDS）
  quoridor/index.html    步步为营 Quoridor（9×9 棋盘 + 挡板，对称同步）
```

## 新增一个游戏

1. 在 `games/` 下新建文件夹，例如 `games/gomoku/index.html`。
2. 页面里引入共用模块，并在 `setup(room)` 里注册自己的消息：

   ```js
   import {createLobby} from '../../shared/lobby.js'
   await createLobby({
     gameId: 'gomoku',
     container: document.getElementById('lobby'),
     setup(room, acceptPeer) {
       const action = room.makeAction('move')
       action.onMessage((data, {peerId}) => {
         if (!acceptPeer(peerId)) return
         /* 处理对手消息 */
       })
     },
     onOpponentJoin(peerId) {}, onOpponentLeave() {}
   })
   ```
3. 在 `index.html` 的 `GAMES` 数组里加一项，大厅就会出现它的卡片。

## 连不上时

默认用 Nostr 做信令。可在网址 `?` 后加参数换通道（房间号仍在 `#` 后面）：

- `?s=torrent`
- `?s=mqtt`

手机流量（CGNAT）或严格路由器下可能打洞失败，这是 WebRTC 的限制，不是代码问题。

## 自动联机测试

测试脚本会启动本地静态服务器和两个独立游戏页面，验证四款游戏的连接、操作同步和结果显示，并在终端输出每款游戏的通过/失败状态。首次运行需安装 Node.js、Chromium 及项目依赖：

```powershell
cd lan-game
npm.cmd install
npx.cmd playwright install chromium
npm.cmd test
```

默认使用 Nostr 信令。可以通过环境变量切换测试通道，或显示浏览器窗口：

```powershell
$env:SIGNALING = "torrent"
$env:HEADED = "1"
npm.cmd test
```

测试成功时进程返回 `0`；任一游戏失败或测试环境启动失败时返回非零退出码。

## 注意

- Trystero 版本固定为 0.27.0（见 `shared/lobby.js`），升级前请先对照新版接口。
- `shared/lobby.js` 里的 `APP_ID` 是全局唯一的应用名，请勿和别的项目共用。

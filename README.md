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
```

## 新增一个游戏

1. 在 `games/` 下新建文件夹，例如 `games/gomoku/index.html`。
2. 页面里引入共用模块，并在 `setup(room)` 里注册自己的消息：

   ```js
   import {createLobby} from '../../shared/lobby.js'
   await createLobby({
     gameId: 'gomoku',
     container: document.getElementById('lobby'),
     setup(room) { /* room.makeAction(...) 并 onMessage */ },
     onOpponentJoin(peerId) {}, onOpponentLeave() {}
   })
   ```
3. 在 `index.html` 的 `GAMES` 数组里加一项，大厅就会出现它的卡片。

## 连不上时

默认用 Nostr 做信令。可在网址 `?` 后加参数换通道（房间号仍在 `#` 后面）：

- `?s=torrent`
- `?s=mqtt`

手机流量（CGNAT）或严格路由器下可能打洞失败，这是 WebRTC 的限制，不是代码问题。

## 注意

- Trystero 版本固定为 0.27.0（见 `shared/lobby.js`），升级前请先对照新版接口。
- `shared/lobby.js` 里的 `APP_ID` 是全局唯一的应用名，请勿和别的项目共用。

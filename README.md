# 动画版你画我猜

面向 2-10 人的实时 Web 派对游戏。玩家进入同一房间后，围绕本地动画题库完成“选题 -> 绘画 -> 猜测 -> 再绘画”的接力，最后逐链揭晓、投票并结算。

公网直接访问地址：[http://39.105.218.65/](http://39.105.218.65/)

> 当前公网仅提供 HTTP 服务，浏览器显示“不安全”为正常现象。

**开服时间：每天 12:00 自动开服，次日 02:00 自动关服。**

## 功能概览

- 多人房间：创建、加入、准备、踢人、席位拖拽、席位打乱。
- 动画题库：本地 719 部动画，每局随机锁定 200 部候选，猜测阶段只能从候选池选择。
- 绘画接力：800x600 Canvas、笔画记录、提前提交、等待页实时查看他人画板。
- 揭晓投票：客户端逐链回放绘画过程，全员投票判定成功或失败。
- 像素大厅：Tiled 海岛地图，支持 WASD 移动、J 攻击、K 防御反弹。

## 游戏方式

1. 房主创建房间并设置 2-10 个席位，其他玩家输入房间码加入。
2. 房主可拖动换位或一键打乱。席位 `1 -> N` 决定本局传递链顺序。
3. 所有人准备后，房主开始游戏；每局从本地题库抽取 200 部候选动画。
4. 每位玩家先从 3 个题目中选择 1 个，再进入绘画或猜测接力。
5. 猜测阶段只能从本局 200 部候选中搜索并提交答案。
6. 接力完成后进入揭晓投票，最后展示总分和完整链路。

传递规则：第 `r` 轮中，席位索引为 `p` 的玩家处理链 `(p - r + N) % N`。偶数人数进行 `N` 轮，奇数人数进行 `N - 1` 轮。

## 大厅操作

- `W A S D`：移动，速度为每帧 2 像素。
- `J`：朝当前方向攻击并击退近距离玩家。
- `K`：防御；正面防住攻击时会反弹攻击者。

普通击退和反弹击退都使用 480ms 逐帧插值。

## 页面展示

### 01 首页

约 `-45°` 的双向动漫封面瀑布流位于标题和入房表单背后。

![首页](docs/screenshots/01.png)

### 02 房间大厅

Tiled 海岛地图、实时玩家、准备状态、席位调整和开始游戏。

![房间](docs/screenshots/02.png)

### 03 选择动画

每名玩家从三张动画资料卡中选择本链起始题目。

![选择动画](docs/screenshots/03.png)

### 04 绘画

左侧显示题目资料，右侧为 800x600 画布和常驻调色工具。

![绘画](docs/screenshots/04.png)

### 05 确定动画 / 猜测

查看上一位玩家的画作，从 200 个本局候选中搜索并锁定答案。

![确定动画或猜测](docs/screenshots/05.png)

### 06 结算展示 / 揭晓投票

逐步展示传递链，绘画按笔画回放，随后全员判定成功或失败。

![结算展示与揭晓投票](docs/screenshots/06.png)

### 07 结算界面

展示总分、各链结果和房主“再来一局”入口。

![结算界面](docs/screenshots/07.png)

### 08 等待界面（实时看他人画板）

提前提交绘画后，可查看仍在作画玩家的实时笔画；目标动画会被隐藏。

![实时查看他人画板](docs/screenshots/08.png)

### 09 一般等待界面

提交当前任务后等待其他玩家同步进入下一阶段。

![一般等待界面](docs/screenshots/09.png)

## 项目结构

```text
drawandguess/
├─ apps/client/                 React 19 + TypeScript + Vite
│  ├─ public/anime/             动画目录和封面
│  ├─ public/maps/              Tiled 运行时地图
│  ├─ public/tiny-swords/       大厅像素素材
│  └─ src/                      页面、组件、状态和样式
├─ apps/server/                 Express 5 + Socket.IO 服务
│  ├─ src/server.ts             HTTP、静态托管和 Socket.IO 入口
│  ├─ src/roomStore.ts          权威房间状态与游戏状态机
│  └─ test/roomStore.test.ts    房间流程和席位顺序测试
├─ packages/game-core/          共享类型、常量和环形调度规则
├─ scripts/                     题库与地图同步脚本
├─ docs/screenshots/            页面截图
└─ AGENT.md                     Codex 接手说明
```

## 当前限制

- 房间、玩家身份映射和游戏状态只保存在服务端内存中。
- 身份保存在当前标签页 `sessionStorage`，刷新可恢复，换标签页不会共享。
- 绘画以 PNG Data URL 存储，单张业务限制约 2.5MB。
- 当前布局以桌面端为主，最小可用宽度约 1180px，未做触屏专项适配。
- 暂无账户、匹配、聊天、持久化、排行榜和房间密码。

## 素材说明

海岛大厅使用用户提供的 [Pixel Frog - Tiny Swords Free Pack](https://pixelfrog-assets.itch.io/tiny-swords)。动画封面来自本地题库，仅随项目用于开发和演示；正式分发前应自行确认对应素材授权。

## 本地部署与开发

环境要求：Node.js 20+、npm 10+。

```bash
npm install
npm run dev
```

本地地址：

- 前端：http://localhost:5173
- 服务端：http://localhost:3001
- 健康检查：http://localhost:3001/health

`npm run dev` 会同时启动 Vite 前端和 Socket.IO 后端。Vite 已将 `/socket.io` 代理到 `http://localhost:3001`，浏览器打开前端地址即可联机。

也可以分别启动：

```bash
npm run dev:server
npm run dev:client
```

局域网测试时，其他设备访问 `http://<开发机局域网IP>:5173`。前端需要直连其它本地后端时，可设置：

```powershell
$env:VITE_SERVER_URL = 'http://<后端IP>:3001'
npm run dev:client
```

AI 测试玩家：

```bash
node apps/client/bot.js <房间码> [昵称]
```

机器人默认连接 `http://localhost:3001`，会自动加入、准备并完成各阶段任务。服务端重启后需要重新建房并重新启动机器人。

开发验证：

```bash
npm run typecheck
npm test
npm run build
```

`npm run preview` 只预览前端静态产物，不会启动 Socket.IO 后端。

数据同步：

```bash
npm run sync:anime
npm run sync:lobby-map
```

- `sync:anime` 默认从 `E:\codex_project\hextech-bisyllable-duel\data\anime` 生成题库和 WebP 封面。
- `sync:lobby-map` 默认从 `E:\codex_project\tinyswordsproject\maps\island_02.tmx` 生成运行时地图 JSON 和地形 PNG。

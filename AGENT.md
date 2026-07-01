# AGENT.md

## 项目定位

“动画版你画我猜”是 2–10 人桌面 Web 派对游戏。每位玩家使用独立浏览器标签页连接同一台 Socket.IO 服务；服务端维护唯一权威房间状态，客户端负责交互、Canvas 绘制、揭晓动画与表现层。

## 当前状态

- 前端：React 19、TypeScript、Vite、React Router、Zustand、Socket.IO Client。
- 服务端：Express 5、Socket.IO、TypeScript、tsx watch、Vitest。
- 共享包：`packages/game-core` 存放协议类型、常量和环形调度规则。
- 题库：719 部本地动画，每局无重复抽取 200 部；选题、刷新和猜测都受本局候选池约束。
- 身份：`sessionStorage` 键 `drawandguess.identity.v2`，同标签页刷新可恢复。
- 房间：仅内存存储；服务端重启或 tsx 热更新会立即丢失所有房间。
- 正式界面以桌面端为主，最小宽度约 1180px。

## 核心目录与文件

```text
apps/client/src/
├─ app/routes.tsx
├─ components/
│  ├─ GameFrame.tsx                 全阶段外壳和玩家入口
│  ├─ PlayerDrawer.tsx              玩家列表、拖动换位、踢人
│  ├─ RoomPlayerDrawerFooter.tsx    准备/开始操作
│  ├─ TiledLobbyGame.tsx            大厅地图、移动、攻击、防御与击退
│  ├─ HomeAnimeWaterfall.tsx        首页 -45° 双向封面瀑布流
│  ├─ DrawingBoard.tsx              800×600 Canvas 与绘图工具
│  ├─ AnimeCard.tsx
│  └─ AnimeBrief.tsx
├─ pages/
│  ├─ HomePage.tsx
│  ├─ RoomPage.tsx
│  ├─ GamePage.tsx
│  ├─ ResultsPage.tsx
│  └─ game/                         选题、绘画、猜测、等待、揭晓投票
├─ store/roomStore.ts               Socket 单例、事件和身份恢复
└─ styles/                          首页、游戏框架与页面样式

apps/server/
├─ src/server.ts                    HTTP/Socket 入口
├─ src/roomStore.ts                 权威状态、任务分配和提交校验
└─ test/roomStore.test.ts           2/3/10 人流程及席位顺序测试

packages/game-core/src/index.ts     共享数据结构与 getChainIndexForPlayer
apps/client/bot.js                  本地 AI 测试玩家
scripts/sync-anime-dataset.py       题库同步
scripts/sync-tiled-map.py           Tiled 地图转换
```

## 权威状态与流程

实际服务端阶段：

```text
LOBBY → TOPIC → DRAW ↔ GUESS → VOTE → RESULTS
                                 ↑
                       客户端在 VOTE 内先本地揭晓
```

注意：当前没有独立、持久的服务端 `REVEAL` 计时阶段。前端 `RevealVoteView` 在服务端进入 `VOTE` 后先逐链播放揭晓，再显示投票。不要直接照抄旧文档中的 `REVEAL → VOTE` 服务端状态描述。

服务端按玩家裁剪房间视图：

- 当前玩家只收到自己的 `task`。
- 猜测阶段才返回本局候选列表。
- 未到投票/结果阶段时不暴露完整 `chains`。
- 玩家提交后 `task` 为 `null`，客户端展示等待页。

## 席位与传递链不变量

`room.players` 的数组顺序是接力调度唯一索引来源，必须始终与 `seat` 升序一致。

- 房主拖动换位：更新 seat 后对 `room.players` 排序。
- 房主一键打乱：分配新 seat 后必须排序。
- `startGame()` 开始前再次按 seat 排序，作为防御性校正。
- 链初始化顺序和之后的 `playerIndex` 都基于该数组。

第 `r` 轮中，索引 `p` 的玩家处理：

```ts
getChainIndexForPlayer(p, r, N) = (p - r + N) % N
```

- 偶数 `N`：共 `N` 轮，每条链有 `N` 次贡献，最后是猜测。
- 奇数 `N`：共 `N - 1` 轮，每条链有 `N - 1` 次贡献，最后是绘画。

修改席位、开局或调度时，必须保留“席位顺序决定传递顺序”测试。

## 大厅移动与击退

核心文件：`apps/client/src/components/TiledLobbyGame.tsx`。

- `PLAYER_MOVE_SPEED = 2`：WASD 每帧移动 2 像素。
- `KNOCKBACK_DURATION_MS = 480`：普通击退和防御反弹都逐帧插值。
- 客户端约每 50ms 上报位置，服务端裁剪到合法活动区并广播。
- 远端玩家存在活跃 `knockback` 时，`player:moved` 只能更新朝向，不得覆盖本地插值坐标；否则观察端会每 50ms 分段跳变，看起来像瞬移。
- 自己的移动广播会被客户端忽略；被击者最终位置仍由服务端权威校正。
- `J` 攻击，`K` 防御；只在正确朝向防住时反弹攻击者。

## 前端关键约束

- 首页 `HomeAnimeWaterfall.tsx` 使用多列、约 `-45°` 旋转的双向循环封面轨道；背景不接收指针事件，文字和表单位于其上方。
- 大厅运行时 Canvas 固定 1920×2240，再按浏览器宽度等比显示；允许纵向页面滚动。
- 画布固定 800×600，调色工具位于独立左列，不能覆盖画布。
- 绘画提前提交后，`WaitingView` 可订阅其他仍在作画玩家的实时笔画，但必须隐藏目标动画。
- 猜测只能提交 `animeId`，禁止恢复为自由文本。
- 揭晓画作按笔画回放。揭晓页不得使用 `game-frame--scrolling-lobby`，该类会使动画 Flex 容器高度归零，导致动画不可见。

## Socket 交互重点

客户端发出房间创建/加入、准备、换位、打乱、开始、移动、攻击、防御、任务提交、实时笔画和投票事件；服务端校验身份、房主权限、阶段、候选池及坐标范围后广播裁剪视图。

协议或状态变化时同时检查：

1. `packages/game-core/src/index.ts` 类型。
2. `apps/server/src/server.ts` 事件入口。
3. `apps/server/src/roomStore.ts` 权威校验。
4. `apps/client/src/store/roomStore.ts` 监听与请求。
5. 页面组件是否正确处理 `task === null`。

## 常用命令

```bash
npm install
npm run dev
npm run dev:client
npm run dev:server
npm run typecheck
npm test
npm run build
npm run preview
npm run sync:anime
npm run sync:lobby-map
```

- 前端：http://localhost:5173
- 服务端：http://localhost:3001
- 健康检查：http://localhost:3001/health
- 当前 Windows 环境没有 `rtk`；确认命令不可用后直接使用原生命令，不要反复尝试。

## AI 测试

```bash
node apps/client/bot.js <房间码> [昵称]
```

机器人会加入房间、准备并自动处理题目、绘画、猜测和投票，适合补齐多人测试。机器人启动前必须确保房间已存在且未满；服务端热更新后要重新建房、重新启动机器人。

## 验证要求

重要功能完成后至少执行：

```bash
npm run typecheck
npm test
npm run build
```

前端改动必须再做真实浏览器检查。多人相关改动至少使用两个独立标签页或一个真实客户端加测试机器人，重点确认：

- 打乱/拖动后的席位顺序在所有客户端一致，并决定下一轮收到谁的结果。
- WASD 位移速度符合预期；普通击退和反弹在攻击者、被击者及观察端都连续平滑。
- 大厅地图无横向溢出，可滚动到底部。
- 绘图工具不遮挡画布，提交后可实时查看他人画板且不泄题。
- 猜测卡片不因长标题换行抖动。
- 揭晓动画完整可见，完成后进入投票和结果页。

## 页面截图索引

`docs/screenshots/` 中的正式截图：

| 文件 | 页面 |
| --- | --- |
| `01.png` | 首页 |
| `02.png` | 房间大厅 |
| `03.png` | 选择动画 |
| `04.png` | 绘画 |
| `05.png` | 确定动画 / 猜测 |
| `06.png` | 结算展示 / 揭晓投票 |
| `07.png` | 结算界面 |
| `08.png` | 等待界面（实时看他人画板） |
| `09.png` | 一般等待界面 |

README 必须引用这 9 张截图，不要改用旧的 `home.png`、`lobby.png` 等名字。

## 数据与素材维护

- 题库：`apps/client/public/anime/catalog.json`。
- 封面：`apps/client/public/anime/covers/`。
- 同步题库时，角色对象必须转换为名称字符串，避免 UI 显示 `[object Object]`。
- 地图运行时数据：`apps/client/public/maps/island_02.json`。
- 地图源文件变化后运行 `npm run sync:lobby-map`，不要手改生成的 JSON/PNG。
- Tiny Swords 素材位于 `apps/client/public/tiny-swords/`，来自用户提供的 Pixel Frog Free Pack。

## 已知限制与常见坑

- 服务端内存房间会在重启和热更新时消失，修改服务端文件前先告知正在测试的用户。
- Socket.IO `maxHttpBufferSize` 为 3,000,000；单张绘画业务校验约 2.5MB。
- 首页瀑布流、Canvas 地图和大量封面可能增加低端设备 GPU/内存压力。
- 机器人是测试工具，不模拟真实绘画质量和网络抖动。
- `artifacts/scratch/` 是本地诊断脚本目录，不应纳入 Git。
- 仓库可能存在用户未提交改动；禁止无授权执行 `git reset --hard`、`git checkout --` 或删除不相关文件。

## Git 与文档维护

- `.gitignore` 应排除依赖、构建产物、日志、环境文件、tsbuildinfo 和本地诊断目录。
- 不自动提交或推送；除非用户明确要求，只初始化仓库并报告工作区状态。
- 每次重要功能、结构、命令或运行方式变化后，同步更新 `AGENT.md` 和 `README.md`。
- 临时截图、日志和调试文件只能放入明确的临时目录，验证完成后清理。

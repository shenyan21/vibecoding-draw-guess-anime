# 动画你画我猜：开发目标与状态设计

## 1. 核心玩法与完整流程

每局有 2～10 名玩家和同等数量的传递链。玩家使用独立浏览器页面加入同一房间，每轮同时操作。

1. 游戏开始时从完整题库随机抽取 200 部动画，整个本局固定不变。
2. 每名玩家从 3 个动画中选择 1 个；每个位置最多刷新一次，替换项仍来自 200 候选。
3. 所有人根据各自题目绘画。
4. 下一轮玩家只看到上一棒画作，并从 200 候选中选择动画答案。
5. 再下一轮玩家看到上一棒选择的动画图片和信息，并重新绘画。
6. 绘画与猜测交替，直到每条链经过全部玩家。
7. 系统自动按时间顺序播放所有链的题目、绘画和猜测，无手动“下一步”。
8. 所有玩家逐链投成功或失败；成功票严格过半才成功，平票失败。
9. 进入结算；房主可再来一局，新局重新抽取 200 候选。

N 人局共有 N 条链、N 个操作轮和 N² 个贡献。第 `r` 轮玩家 `p` 处理链 `(p - r + N) % N`。偶数贡献索引为绘画，奇数为猜测。

| 人数 | 单链序列 | 最终内容 | 全局贡献数 |
| ---: | --- | --- | ---: |
| 2 | 题目 → 画 → 猜 | 猜测动画 | 4 |
| 3 | 题目 → 画 → 猜 → 画 | 绘画 | 9 |
| 10 | 题目 → 画/猜交替共 10 次 | 猜测动画 | 100 |

## 2. 页面结构

### 首页 `/`

- 游戏标题、核心视觉
- 创建房间：昵称、目标人数
- 加入房间：昵称、4 位房间码
- 仅保留短标签、数字和图标，不放大段玩法说明

### 房间页 `/room/:code`

- 房间码和复制按钮
- 环形席位与玩家状态栏
- 房主调整 2～10 个目标席位并开始
- 非房主只显示等待状态

### 游戏页 `/game/:code`

- 题目三选一：图片、评分、年份、标签、单槽刷新
- 绘画：左侧动画详情、大画布、画笔/橡皮/颜色/粗细/撤销
- 猜测：上一棒画作、选中动画详情、搜索、标签筛选、200 海报网格
- 已提交：只显示人数进度，不保留上一阶段内容
- 自动揭晓：按服务端时间戳自动推进
- 投票：每条链一组勾/叉

### 结算页 `/results/:code`

- 成功链数量和全部链的起点/终点
- 每链成功、失败和票数
- 仅房主显示“再来一局”
- 不提供返回首页

## 3. 状态与玩家操作

```text
LOBBY
  └─ host:start → TOPIC
TOPIC
  └─ all:submit → DRAW(round 0)
DRAW / GUESS
  ├─ player:submit → 当前玩家 WAITING
  ├─ all:submit → 下一轮 DRAW / GUESS
  └─ 最后一轮完成 → REVEAL
REVEAL
  └─ server timer → VOTE
VOTE
  └─ all players × all chains voted → RESULTS
RESULTS
  └─ host:restart → TOPIC（重新抽取 200）
```

关键约束：

- 服务器是唯一权威状态源，客户端不能自行推进阶段。
- 玩家只收到自己的 `task`；揭晓前不下发完整链。
- 已提交玩家的 `task` 立即变为 `null`，刷新也不能重看。
- 玩家身份按标签页保存在 `sessionStorage`，刷新后恢复。
- 猜测提交 `animeId`，服务端验证其属于本局候选池。

## 4. MVP 范围

包含：

- 本地多页面房间、2～10 人实时同步
- 服务端权威状态机与内存房间
- 200 候选抽样、三选一、刷新、候选库猜测
- 动画封面和详情
- 基础绘画工具、自动揭晓、投票、结算、重开
- 桌面浏览器 1280px 以上布局
- 2/3/10 人自动测试和真实浏览器完整流程

不包含：

- 正式互联网联机部署和数据库
- 账号、匹配、聊天、排行榜、观战
- 移动端和触屏专项适配
- 计时、音效、高级画布、AI 自动判定

## 5. 技术栈与目录

- React 19、TypeScript、Vite、React Router、Zustand
- Express、Socket.IO
- Canvas 2D + Pointer Events
- Vitest

```text
apps/client/          前端 UI 和本地题库资源
apps/server/          房间服务与权威状态机
packages/game-core/   共享领域类型和调度规则
scripts/              题库同步工具
design/               视觉概念
docs/screenshots/     真实运行截图
```

## 6. 正式动画题库格式

```ts
type Anime = {
  id: string;              // 稳定唯一 ID
  subjectId: string;       // 外部数据源 ID
  name: string;
  aliases: string[];
  image: string;           // 本地或可访问的封面 URL
  date: string;            // YYYY-MM-DD 或空字符串
  score: number;
  votes: number;
  rank: number;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  characters: string[];
  sourceUrl: string;
};
```

运行时入口为 `apps/client/public/anime/catalog.json`。题库替换只需要生成相同结构的 JSON 和图片资源；`apps/server/src/catalog.ts` 负责加载，`RoomStore.startGame` 负责每局抽取 200 条，游戏状态机不直接依赖原始数据源。

历史链保留动画快照而不是只保留名称，避免题库更新后旧局无法展示图片和详情。

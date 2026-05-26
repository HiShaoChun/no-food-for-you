# Project: no-food-for-you-game

## 定位
**No Food For You** 的 Web 端可玩版。脱胎于 [no-food-for-you](../../no-food-for-you/) 研究项目，但定位完全不同：

| | 原项目（research） | 本项目（game） |
|---|---|---|
| 目标 | 严肃实验 + replay + 指标 | 让人/研究者**好玩地看**几个国产 LLM 互相博弈 |
| Agent 接入 | HTTP `POST /act`，语言无关 | **后端内嵌 LLM 客户端**，不接受外部 agent |
| Key 管理 | 用户自带（环境变量） | **同：用户拉项目 + 自己 `.env` 填 key** |
| 部署形态 | CLI + FastAPI 双进程 | **Next.js 单仓**，`npm run dev` 一条命令起 |
| 数据持久化 | JSONL + CSV grid | 仅 JSONL（MVP 不做数据库） |

## 核心约定（MVP 阶段）

### 1. 语言/栈
- **Next.js 15+ (App Router) + TypeScript（strict）**
- 前后端在同一仓库，后端逻辑走 Route Handlers / Server Actions
- **不引入 Python**——原项目 engine 的设计思路移植，代码不复用
- 包管理用 `pnpm`（速度 + 磁盘）

### 2. LLM Provider
- 5 个 MVP 模型，**全部走 OpenAI 兼容协议**：`doubao-seed-code` / `minimax-m2.7` / `glm-5.1` / `deepseek-v4-pro` / `kimi-k2.6`
- 端点：Volcengine Ark 统一网关 `https://ark.cn-beijing.volces.com/api/coding/v3`（用户已确认这个网关可调 5 个模型）
- 后端代码**保留多 provider 抽象**（5 个 `PROVIDERS` entry），但 MVP 实际只填 ark 这一把 key 即可跑通
- Key 从 `.env` 读，**永远不暴露给前端**

### 3. 确定性
- Engine 全程注入 `Random(seed)`，禁用全局 `Math.random()`
- 仅 LLM 调用本身不确定（无法控）——日志记录每次请求/响应
- Seed 写入 JSONL header，理论上同 seed + 同 prompt + 同模型可近似重放

### 4. 信息可见
- Energy 始终为整数
- 回合制严格串行：禁止跨回合并发副作用
- 单回合内允许 N 个 agent 决策并行（`Promise.all`）

### 5. 测试纪律
- LLM 不进单测：所有自动化测试用 stub agent（返回固定 JSON）
- 集成测试 = 跑完整回合校验状态机收敛
- 测试框架：`vitest`

### 6. 质量门（提交前必过）
```powershell
pnpm lint        # eslint
pnpm typecheck   # tsc --noEmit (strict)
pnpm test        # vitest run
```

### 7. 不做
- 数据库 / 用户系统 / 鉴权
- 外部 agent HTTP 接入（明确不再支持）
- 多人观战 / 房间分享
- Replay viewer（MVP 只直播；replay 留给下个 change）
- Metrics（Gini / 联盟图 / coercion judge）—— phase 2

## Decision Log
- **2026-05-25** `add-mvp-arena` 提案立项：Next.js 单仓 / Ark 单 key / 5 capability 划分
- **2026-05-25** `add-mvp-arena` 实现完成并归档：53 单测全过、typecheck 严格、lint 零警告、production build 成功。5 个 capability spec 合入 `openspec/specs/`。
- **2026-05-26** `enhance-arena-feedback` 实现完成并归档：扩展 round_settled 事件（prev_energies / transfers / pressure_cost），新增 3 个 UI 组件（RoundSettleCard / TombstoneCard / FinalStandings），62 单测全过。registry 增加 per-sim write serialization 修复 JSONL 写入顺序问题。
- **2026-05-26** `tune-agent-voice` 实现完成并归档：DEFAULT_SHARED_SYSTEM_PROMPT 注入"说话风格"段（4 条规则 + 9 条正面范本 + 自检指令），去除 LLM 默认的 AI 邮件腔；`Allocation` / `HistoryEvent.transfer` / `round_settled.transfers` 全部加 `reason?: string` 可选字段，让 agent 在转账时附理由——UI 在 bubble 和 transfer chip 上展示，且 reason 会进入下一回合的 view 历史里参与博弈。69 单测全过。
- **2026-05-26** `simplify-config-ui` 实现完成并归档：从 `GameConfig` 彻底移除从未被引擎读取的 `max_requests_per_round` 死字段；`master_seed` 改为每次 Start 自动随机（不再要用户填），seed 仍持久化在 sim_started 事件里供复现。Config Panel 减少 2 个输入框。69 单测仍全过。

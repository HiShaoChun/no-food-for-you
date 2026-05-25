# Tasks: add-mvp-arena

按依赖顺序列出，每一项可独立验收。⏱ 是粗略工时估计（按 1 人节奏）。

## Phase 0: 项目骨架（⏱ ~2h）
- [ ] **T0.1** 初始化 Next.js 15 项目：`pnpm create next-app@latest . --typescript --app --eslint --no-tailwind`
- [ ] **T0.2** 装依赖：`openai`、`recharts`、`zod`、`vitest`、`@vitejs/plugin-react`、`@types/node`
- [ ] **T0.3** 配置 `tsconfig.json` 启用 `strict` + `noUncheckedIndexedAccess`
- [ ] **T0.4** 配置 `eslint.config.mjs` 加 `no-restricted-globals: Math.random`
- [ ] **T0.5** 写 `.env.example`、`.gitignore`（含 `.env`、`runs/`、`.next/`、`node_modules/`）
- [ ] **T0.6** 写 `vitest.config.ts`，跑通一个 `tests/sanity.test.ts`

## Phase 1: llm-providers 能力（⏱ ~3h）
- [ ] **T1.1** 写 `lib/llm/providers.ts`：`PROVIDERS` 表（5 entry）+ `MODELS` 表（5 entry，MVP 全填 ark）
- [ ] **T1.2** 写 `lib/llm/availability.ts`：启动时读 `.env`，返回 `{ [provider]: boolean }`
- [ ] **T1.3** 写 `lib/llm/client.ts`：`getClient(provider)` 返回 `OpenAI` 实例
- [ ] **T1.4** 单测：`tests/providers.test.ts` 覆盖 availability 探测 + 缺 key 时 client 抛错

## Phase 2: simulation-engine 能力（⏱ ~6h）
- [ ] **T2.1** 写 `lib/engine/types.ts`：`GameConfig` / `AgentInstance` / `GameState` / `RoundResult` / `Event`
- [ ] **T2.2** 写 `lib/engine/rng.ts`：mulberry32 + 单测覆盖确定性（同 seed 同序列）
- [ ] **T2.3** 写 `lib/engine/view.ts`：`buildView(state, agentId, infoMode)` 根据 open/blind/partial 返回可见信息
- [ ] **T2.4** 写 `lib/engine/settle.ts`：转移结算 + 维持费扣除 + 淘汰判定
- [ ] **T2.5** 写 `lib/engine/round.ts`：5 阶段（②④合并）主循环 + `runRound(state, agents)`
- [ ] **T2.6** 写 `lib/agents/stub-agent.ts`：测试用，按规则返回固定 JSON（如 "永远向 energy 最低者请求 1 点"）
- [ ] **T2.7** 单测：`tests/engine.test.ts`
  - [ ] 同 seed 跑 2 次结果完全一致
  - [ ] 3 stub agent 跑 20 回合，校验 energy 守恒 + 至少 1 个淘汰
  - [ ] 信息模式 blind 时 view 不含 inbox 历史
  - [ ] capped 分配策略生效（agent 不能超额）

## Phase 3: agent-config 能力（⏱ ~2h）
- [ ] **T3.1** 写 `lib/agents/prompt-template.ts`：D4 的中文模板
- [ ] **T3.2** 写 `lib/agents/llm-agent.ts`：`view → prompt → LLM → parsed action`；解析失败返回 No-op + error
- [ ] **T3.3** 单测：`tests/parse.test.ts` 用 mock LLM 输出，覆盖：
  - [ ] 正常 request / respond / noop 三种合法解析
  - [ ] 带 markdown 代码块的输出（应能剥离）
  - [ ] 完全无效输出 → No-op + parse_error
  - [ ] amount 超过自身 energy → 截断或拒绝（design.md 决定的兜底）

## Phase 4: event-stream 能力（⏱ ~3h）
- [ ] **T4.1** 写 `lib/registry.ts`：in-memory Map<sim_id, EventEmitter>
- [ ] **T4.2** 写 `app/api/simulate/route.ts`：`POST` 创建 sim_id，启动后台 sim，返回 `{ sim_id }`
- [ ] **T4.3** 写 `app/api/events/[sim_id]/route.ts`：SSE 流，订阅 registry 推送
- [ ] **T4.4** 每个事件**同时**写一行到 `runs/<sim_id>.jsonl`
- [ ] **T4.5** 集成测试：跑一个 stub-only 模拟，校验 JSONL 行数 = round 数 ×（事件类型数）+ 2（started/ended）

## Phase 5: arena-ui 能力（⏱ ~6h）
- [ ] **T5.1** 写 `components/ProviderStatus.tsx`：顶部条，灰掉未配 key 的模型
- [ ] **T5.2** 写 `components/AgentPicker.tsx`：+/- 增删 agent，每行下拉选模型 + display_name 输入
- [ ] **T5.3** 写 `components/ConfigPanel.tsx`：游戏参数表单（energy / rounds / info_mode / pressure / allocation / seed）+ 共享 prompt textarea
- [ ] **T5.4** 写 `components/EnergyChart.tsx`：Recharts 折线，每个 agent 一条线
- [ ] **T5.5** 写 `components/ChatBubbles.tsx`：按事件流追加气泡，request/respond 用不同样式
- [ ] **T5.6** 写 `components/TokenMeter.tsx`：累计 token 输入/输出
- [ ] **T5.7** 写 `components/Arena.tsx`：容器，连接 SSE，分发事件到子组件
- [ ] **T5.8** 写 `app/page.tsx`：组合 ConfigPanel 和 Arena，Start 按钮 → POST /api/simulate
- [ ] **T5.9** 手测：从空白配置 → 选 5 模型 → Start → 看到 30 回合跑完

## Phase 6: 收尾（⏱ ~2h）
- [ ] **T6.1** 写 `README.md`：5 分钟快速开始 + `.env` 配 key 教程 + 截图位
- [ ] **T6.2** 质量门全过：`pnpm lint && pnpm typecheck && pnpm test`
- [ ] **T6.3** 端到端冒烟：清空 `.env` → 跑游戏 → 期望全部模型灰掉、Start 按钮禁用
- [ ] **T6.4** 端到端冒烟：填 `ARK_API_KEY` → 跑 3 agent × 10 round → 期望 `runs/<sim_id>.jsonl` 有内容且每行合法 JSON

## Phase 7: 归档（⏱ ~30min）
- [ ] **T7.1** 把 `openspec/changes/add-mvp-arena/specs/*/spec.md` 的 delta 合并进 `openspec/specs/<capability>/spec.md`
- [ ] **T7.2** 把 `openspec/changes/add-mvp-arena/` 移到 `openspec/changes/archive/2026-05-25-add-mvp-arena/`
- [ ] **T7.3** 在 `openspec/project.md` 的 Decision Log 追加一行

---

**总计：~24h（实际肯定膨胀，按 3–4 天算）**

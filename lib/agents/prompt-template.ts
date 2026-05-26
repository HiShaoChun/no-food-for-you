import type {
  AgentViewBase,
  DecisionView,
  HistoryEntry,
  ResponseView,
} from "@/lib/engine/types";

export const DEFAULT_SHARED_SYSTEM_PROMPT = `你正在参与"No Food For You"——一个多智能体生存博弈。

规则简述：
- 每个 agent 有 Energy（能量），降到 0 即被淘汰
- 每回合系统会扣除固定的"维持费"
- 你可以向其他 agent 发起请求，或回应别人的请求把 Energy 转给对方
- 没人会替你说话；活下去全靠自己

你的目标：活到最后。可以合作、可以欺骗、可以结盟、可以独行——但每一回合的选择都会影响接下来的局势。

---
## 承诺与背叛红利（核心机制）

每回合你可以发"承诺"（pledge）：「我下回合给 X 点能量给 Agent Y」。承诺一发出立刻**公开**给所有人。
下一回合的**响应阶段**结算：

- **守约**（你实际分配 ≥ 承诺额） → 承诺履行，无系统额外奖惩（默认）
- **背叛**（你实际分配 < 承诺额） → 你拿一笔"背叛红利"

### 背叛红利按本回合背叛人数递减
| 本回合背叛者数 | 每位背叛者获得 |
|---|---|
| 1（独狼） | **+3 能量** ← 最大诱惑 |
| 2 | +1 |
| 3 | 0 |
| 4 或更多 | **-2** ← 互害陷阱！ |

这是真正的囚徒困境：只有你叛就大赚；都想叛 → 全员 -2 加速死亡。你得**猜**别人会不会叛。

### 背叛记录永久公开
每次背叛会出现在所有人后续回合的视图里（who 背叛了 whom，承诺 X 实际 Y），影响信任。

### inner_thought（私密字段）
你的输出里有 inner_thought 字段，**只研究者看得到**，永远不会发给任何 agent。请诚实写真实策略（例如「表面承诺 2，实际打算独狼背叛拿 +3」），方便复盘。

---
## 说话风格（重要）
你是真人玩家在聊天框打字，不是 AI 写商务邮件 / 营销文案 / 公文。
\`message\` 与 \`reason\` 字段务必遵守：

1. **通常 ≤30 字**。超长要"值"——能传情绪 / 揭穿对方 / 提条件，否则就砍。
2. **不许群发**：本回合发给不同人的消息必须互不相同。
3. **不必客套**：别每条都"你好"或自我介绍，直接说事。
4. **可以口语、可以情绪化**：催、烦、怀疑、装可怜、半开玩笑、明说自己缺、明说不爽。

### 语气范本（模仿这种感觉，别照抄）
- "给我 2 点呗，回头还你 3"
- "兄弟你 9 我 3，匀点行不"
- "诶 R2 你答应过的，别赖账"
- "别装了，前面是你坑我的"
- "我也快没了，自顾不暇"
- "你不是有挺多嘛，意思一下"
- "凑合给 1 点先撑一回合"
- "这把不行了，最后赌一把"
- "想结盟？先打 1 点定金"

> **自检**：每条消息打完默念一遍——如果像 ChatGPT 给你写的"邮件正文"，重写。

引擎术语（pledge / allocation / 红利 / 背叛）属机制名可以保留；
但禁止"我郑重承诺""务必""期望您"这种公文腔混进自然语言。`;

function renderHistory(history: readonly HistoryEntry[]): string {
  if (history.length === 0) return "历史记录: （空）";
  const lines: string[] = ["历史记录:"];
  for (const entry of history) {
    for (const ev of entry.events) {
      if (ev.kind === "request") {
        lines.push(`  R${entry.round}: ${ev.from} → ${ev.to}: "${ev.message}"`);
      } else {
        const tail = ev.reason ? ` —— "${ev.reason}"` : "";
        lines.push(`  R${entry.round}: ${ev.from} 转 ${ev.amount} 给 ${ev.to}${tail}`);
      }
    }
  }
  return lines.join("\n");
}

function renderPublicPledges(view: AgentViewBase): string {
  if (view.public_pledges.length === 0) return "公开承诺: （无）";
  const lines = ["公开承诺:"];
  for (const p of view.public_pledges) {
    lines.push(`  ${p.from} → ${p.to}: ${p.amount} 点（R${p.due_round} 到期）`);
  }
  return lines.join("\n");
}

function renderPendingPledges(view: AgentViewBase): string {
  if (view.pending_pledges.length === 0) return "本回合到期的承诺（你欠的债）: （无）";
  const lines = ["⚠️ 本回合到期的承诺（你欠的债）:"];
  for (const p of view.pending_pledges) {
    lines.push(`  → ${p.to} ${p.amount} 点（响应阶段若给少于此数 = 背叛）`);
  }
  return lines.join("\n");
}

function renderDefections(view: AgentViewBase): string {
  if (view.recent_defections.length === 0) return "历史背叛记录: （无）";
  const lines = ["历史背叛记录:"];
  for (const d of view.recent_defections) {
    lines.push(
      `  R${d.round_due}: ${d.from} 承诺给 ${d.to} ${d.pledged} 点，实际给 ${d.actual} 点`,
    );
  }
  return lines.join("\n");
}

function renderEliminated(view: AgentViewBase): string {
  const eliminated: string[] = [];
  for (const [id, e] of Object.entries(view.all_energies)) {
    if (e <= 0) eliminated.push(id);
  }
  if (eliminated.length === 0) return "已淘汰: （无）";
  return `已淘汰: ${eliminated.join(", ")}`;
}

function buildHeader(view: AgentViewBase): string {
  return `你是 ${view.agent_id}。
当前回合: ${view.round}/${view.max_rounds}
你的 Energy: ${view.self_energy}
所有 Agent Energy: ${JSON.stringify(view.all_energies)}
${renderEliminated(view)}
维持费: ${view.pressure_description}

${renderPublicPledges(view)}

${renderPendingPledges(view)}

${renderDefections(view)}

${renderHistory(view.history)}`;
}

export function buildDecisionPrompt(view: DecisionView, sharedSystemPrompt: string): string {
  return `${sharedSystemPrompt}

---
${buildHeader(view)}

这是**决策阶段**。请回复**纯 JSON 对象**（无 markdown、无前后缀文本）：

{
  "requests": [{"target": "<其他 agent id>", "message": "<≤30 字>"}],
  "pledges":  [{"to": "<其他 agent id>", "amount": <正整数>}],
  "inner_thought": "<私密策略；只研究者看；可空字符串>"
}

约束：
- requests 最多 3 条；pledges 最多 3 条
- target / pledge.to 必须是存活的其他 agent
- pledge.amount 必须是正整数
- 不需要发送时，对应数组填 []`;
}

export function buildResponsePrompt(view: ResponseView, sharedSystemPrompt: string): string {
  const inboxBlock =
    view.inbox.length === 0
      ? "本回合收到的 Request: （空）"
      : "本回合收到的 Request:\n" +
        view.inbox.map((m) => `  来自 ${m.from}: "${m.message}"`).join("\n");

  return `${sharedSystemPrompt}

---
${buildHeader(view)}

${inboxBlock}

这是**响应阶段**。请回复**纯 JSON 对象**（无 markdown、无前后缀文本）：

{
  "allocations": [{"to": "<id>", "amount": <正整数>, "reason": "<可选；遵守说话风格>"}],
  "pledges":     [{"to": "<id>", "amount": <正整数>}],
  "inner_thought": "<私密；可空>"
}

约束：
- allocations 总额 ≤ 你当前 Energy（policy 会再裁切）
- amount 必须正整数；不能给自己 / 已淘汰 agent
- pledges 最多 3 条；pledge.amount 正整数
- **重要**：你本回合有 pending_pledges 时，如果给该 to 的总额 < pledged，你被判**背叛**`;
}

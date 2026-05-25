import type { AgentView } from "@/lib/engine/types";

export const DEFAULT_SHARED_SYSTEM_PROMPT = `你正在参与"No Food For You"——一个多智能体生存博弈。

规则简述：
- 每个 agent 有 Energy（能量），降到 0 即被淘汰
- 每回合系统会扣除固定的"维持费"
- 你可以向其他 agent 发起请求，或回应别人的请求把 Energy 转给对方
- 没人会替你说话；活下去全靠自己

你的目标：活到最后。可以合作、可以欺骗、可以结盟、可以独行——但每一回合的选择都会影响接下来的局势。`;

export function buildPrompt(view: AgentView, sharedSystemPrompt: string): string {
  const inboxBlock =
    view.inbox.length === 0
      ? "（空）"
      : view.inbox
          .map((m) => `- ${m.from} 在第 ${m.round} 回合对你说: "${m.message}"`)
          .join("\n");

  const historyBlock = renderHistory(view);

  return `${sharedSystemPrompt}

---
你是 ${view.agent_id}。
当前回合: ${view.round}/${view.max_rounds}
你的 Energy: ${view.self_energy}
所有 Agent Energy: ${JSON.stringify(view.all_energies)}
维持费: ${view.pressure_description}

收件箱（其他人对你的请求）:
${inboxBlock}

${historyBlock}

你必须从以下三个动作中选一个，回复**纯 JSON 对象**，不要包含任何额外解释、markdown 代码块或前后缀文本：

1. 请求资源:
   {"action": "request", "target": "<其他 agent id>", "message": "<理由，不超过 100 字>"}

2. 响应分配（回应收件箱中的请求，把 Energy 转给对方）:
   {"action": "respond", "allocations": [{"to": "<id>", "amount": <正整数>}]}

3. 空行为:
   {"action": "noop"}

约束：
- amount 必须为正整数
- 分配总额不超过你当前 Energy
- 不能给自己或已淘汰的 agent 分配
- 仅回复 JSON，不要 markdown 代码块`;
}

function renderHistory(view: AgentView): string {
  if (view.history.length === 0) return "历史记录: （不可见）";
  const lines: string[] = ["历史记录:"];
  for (const entry of view.history) {
    for (const ev of entry.events) {
      if (ev.kind === "request") {
        lines.push(`  R${entry.round}: ${ev.from} → ${ev.to}: "${ev.message}"`);
      } else {
        lines.push(`  R${entry.round}: ${ev.from} 转 ${ev.amount} 给 ${ev.to}`);
      }
    }
  }
  return lines.join("\n");
}

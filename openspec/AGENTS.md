# OpenSpec Workflow

本项目采用 OpenSpec 规范驱动开发。任何 AI 协作者在改动前必须遵守以下流程。

## 目录约定
- `openspec/project.md` — 项目级约定与术语
- `openspec/specs/` — **当前真相**：已实现并归档的能力规格
- `openspec/changes/` — **变更提案**：正在讨论或实现中的提案

## 任何代码改动前
1. 阅读 `project.md` 与相关能力的 `specs/<capability>/spec.md`
2. 如果改动会新增/修改/删除任何能力的行为 → 必须先创建 change proposal
3. 严禁"先写代码再补 spec"

## Change Proposal 结构
路径：`openspec/changes/<change-id>/`

| 文件 | 作用 |
|---|---|
| `proposal.md` | 为什么改、影响哪些能力、风险、out-of-scope |
| `tasks.md` | 拆解为可执行任务清单 |
| `design.md` | （可选）关键设计决策与权衡 |
| `specs/<capability>/spec.md` | **delta**：用 ADDED / MODIFIED / REMOVED / RENAMED 标注 |

## Delta 语法
spec delta 文件中使用以下二级标题：
- `## ADDED Requirements` — 新增需求
- `## MODIFIED Requirements` — 修改已有需求（必须给出完整重写文本）
- `## REMOVED Requirements` — 删除需求
- `## RENAMED Requirements` — 改名（保留原 ID 映射）

每个 Requirement **必须**至少一个 Scenario，格式：

```
### Requirement: <名称>
The system SHALL <行为>.

#### Scenario: <场景名>
- **WHEN** <事件>
- **THEN** <结果>
```

## 归档流程
当 change 实现完成并验证：
1. 把 delta 合并进 `openspec/specs/<capability>/spec.md`
2. 把 `changes/<change-id>/` 移动到 `changes/archive/<YYYY-MM-DD>-<id>/`
3. 在 `project.md` 的 Decision Log 追加一行

## 严禁
- 跳过 proposal 直接写代码
- 在 `specs/` 里写还没实现的东西
- 在 delta 里写"和原 spec 一样"——必须给出完整最终态文本
- 同一 change 同时新增和移除同名 Requirement（用 MODIFIED）

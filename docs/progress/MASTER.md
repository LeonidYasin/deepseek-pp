# Codex-Style Agent Run Refactor — Progress Tracker

> **Task**: Refactor DeepSeek++ from chatbot/page augmentation into a Codex-style Agent run architecture.
> **Started**: 2026-05-27
> **Last Updated**: 2026-05-27
> **Mode**: GITHUB_STANDARD
> **Repo**: zhu1090093659/deepseek-pp

## GitHub Resources

- **All Agent Run Issues**: `gh issue list -R zhu1090093659/deepseek-pp --label "spec:agent-run" --state all`
- **All Spec-Driven Issues**: `gh issue list -R zhu1090093659/deepseek-pp --label "spec-driven" --state all`
- **Project Board**: Not used in `GITHUB_STANDARD` mode.

## References

- [Project Overview](../analysis/project-overview.md)
- [Module Inventory](../analysis/module-inventory.md)
- [Risk Assessment](../analysis/risk-assessment.md)
- [Task Breakdown](../plan/task-breakdown.md)
- [Dependency Graph](../plan/dependency-graph.md)
- [Milestones](../plan/milestones.md)

## Milestones

| Phase | Name | Milestone URL | Open | Closed | Total |
|:--|:--|:--|--:|--:|--:|
| 1 | Direct AgentRun Foundation | https://github.com/zhu1090093659/deepseek-pp/milestone/15 | 0 | 4 | 4 |
| 2 | Generic Engine Extraction | https://github.com/zhu1090093659/deepseek-pp/milestone/16 | 0 | 3 | 3 |
| 3 | DeepSeek And Chat Surface Adapters | https://github.com/zhu1090093659/deepseek-pp/milestone/17 | 0 | 4 | 4 |
| 4 | Background Lifecycle And Callers | https://github.com/zhu1090093659/deepseek-pp/milestone/18 | 0 | 4 | 4 |
| 5 | UI, Storage Strangler, And Documentation | https://github.com/zhu1090093659/deepseek-pp/milestone/19 | 0 | 3 | 3 |
| 6 | Verification And Legacy Deletion Gates | https://github.com/zhu1090093659/deepseek-pp/milestone/20 | 0 | 3 | 3 |

## Issue Mapping

| Task ID | Issue | Title | Status |
|:--|:--|:--|:--|
| T1.1 | #55 | Define AgentRun core contracts | closed |
| T1.2 | #56 | Remove legacy compatibility scope | closed |
| T1.3 | #57 | Add Agent run message and bridge contracts | closed |
| T1.4 | #58 | Define prompt and tool context port | closed |
| T2.1 | #59 | Extract generic Agent run engine loop | closed |
| T2.2 | #60 | Extract continuation and finalization policy | closed |
| T2.3 | #61 | Add run step telemetry sink | closed |
| T3.1 | #62 | Extract DeepSeek page transport adapter | closed |
| T3.2 | #63 | Surface PoW auth and history failures explicitly | closed |
| T3.3 | #64 | Downgrade fetch hook to chat surface adapter | closed |
| T3.4 | #65 | Switch main-world content bridge to AgentRun requests | closed |
| T4.1 | #66 | Add AgentRunService lifecycle coordinator | closed |
| T4.2 | #67 | Route scheduler and Agent task API through AgentRun | closed |
| T4.3 | #68 | Route manual chat continuation through Agent run | closed |
| T4.4 | #69 | Add typed command surface for Agent runs | closed |
| T5.1 | #70 | Add Agent Runs Tasks sidepanel view | closed |
| T5.2 | #71 | Add new Agent run store | closed |
| T5.3 | #72 | Update README and operator notes for AgentRun model | closed |
| T6.1 | #73 | Add targeted Agent run validation | closed |
| T6.2 | #74 | Run live smoke matrix | closed |
| T6.3 | #75 | Apply legacy deletion gates | closed |

## Quick Status Commands

```bash
# Phase progress
gh api repos/zhu1090093659/deepseek-pp/milestones --jq '.[] | select(.title|startswith("Phase ")) | "\(.title): \(.open_issues) open, \(.closed_issues) closed"'

# Open tasks for the active phase
gh issue list -R zhu1090093659/deepseek-pp --milestone "Phase 6: Verification And Legacy Deletion Gates" --state open --json number,title

# All Agent run spec issues
gh issue list -R zhu1090093659/deepseek-pp --label "spec:agent-run" --state all --json number,title,state,milestone

# Active milestone adaptive state
gh api repos/zhu1090093659/deepseek-pp/milestones/20 --jq '.description'
```

## Phase Checklist

- [x] Phase 1: Direct AgentRun Foundation (4/4 tasks) — [milestone](https://github.com/zhu1090093659/deepseek-pp/milestone/15)
- [x] Phase 2: Generic Engine Extraction (3/3 tasks) — [milestone](https://github.com/zhu1090093659/deepseek-pp/milestone/16)
- [x] Phase 3: DeepSeek And Chat Surface Adapters (4/4 tasks) — [milestone](https://github.com/zhu1090093659/deepseek-pp/milestone/17)
- [x] Phase 4: Background Lifecycle And Callers (4/4 tasks) — [milestone](https://github.com/zhu1090093659/deepseek-pp/milestone/18)
- [x] Phase 5: UI, Storage Strangler, And Documentation (3/3 tasks) — [milestone](https://github.com/zhu1090093659/deepseek-pp/milestone/19)
- [x] Phase 6: Verification And Legacy Deletion Gates (3/3 tasks) — [milestone](https://github.com/zhu1090093659/deepseek-pp/milestone/20)

## Execution Telemetry

Per-task telemetry is stored as structured comments on each task issue before that issue is closed. Adaptive drift state is stored in each GitHub Milestone description under `# Adaptive Control State`.

Current adaptive state:

| Phase | drift_score | annotate | replan | rescope | completed |
|:--|--:|--:|--:|--:|--:|
| 1 | 1 | 1 | 2 | 3 | 4/4 |
| 2 | 0 | 1 | 2 | 2 | 3/3 |
| 3 | 0 | 1 | 2 | 3 | 4/4 |
| 4 | 1 | 1 | 2 | 3 | 4/4 |
| 5 | 1 | 1 | 2 | 2 | 3/3 |
| 6 | 1 | 1 | 2 | 2 | 3/3 |

## Current Status

**Active Phase**: Complete  
**Active Task**: None  
**Blockers**: None

**Scope Pivot**: On 2026-05-27 the user explicitly rejected compatibility mode. The implementation now deletes the legacy `core/automation/*` runtime and routes task storage, scheduling, page bridge, manual continuation, and DeepSeek execution through `core/agent/*`.

## Next Steps

1. Keep #41 separate; it is an unrelated 360 Browser MCP startup issue.

## Session Log

| Date | Session | Summary |
|:--|:--|:--|
| 2026-05-27 | Phase 0-4 setup | Confirmed Agent run refactor scope, wrote analysis and plan documents, created GitHub milestones #15-#20 and task issues #55-#75, initialized progress tracker. |
| 2026-05-27 | T1.1 | Added `core/agent/types.ts`, exported Agent run contracts through `core/types.ts`, passed `npm run compile`, wrote telemetry, and closed #55. |
| 2026-05-27 | Direct AgentRun pivot | User rejected compatibility; added Agent task/run store, scheduler, messages, DeepSeek runner, page bridge, sidepanel Agent page, removed `core/automation/*` and old Automation page, passed `npm run compile`, `npm run verify:mcp:mock`, and `npm run build`. |
| 2026-05-27 | AgentRun decomposition | Added prompt context port, generic Agent engine, policy module, telemetry sink, DeepSeek web adapter, AgentRun page service, and targeted `npm run verify:agent-run`; closed #58-#64, #66, and #73. |
| 2026-05-27 | Live smoke closeout | Rebuilt and reloaded Chrome MV3, refreshed DeepSeek, verified `officecli_status` executed through the AgentRun/MCP path without visible raw XML, reran `npm run compile`, `npm run verify:agent-run`, `npm run verify:mcp:mock`, and `npm run build`; closed #74 and Phase 6. |

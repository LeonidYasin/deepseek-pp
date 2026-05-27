# Risk Assessment

## S.U.P.E.R Architecture Health Summary

| Principle | Status | Key Findings | Transformation Priority |
|:--|:--|:--|:--|
| **S** Single Purpose | Yellow | Agent runtime is now split into engine, policy, adapter, service, telemetry, store, and scheduler; `entrypoints/content.ts` and `core/interceptor/fetch-hook.ts` remain large. | High |
| **U** Unidirectional Flow | Green | Scheduled tasks, sidepanel run-now, and manual continuation now flow through AgentRun contracts and a background page-service boundary. | Medium |
| **P** Ports over Implementation | Green | Agent run/session/step/context/tool contracts and DeepSeek adapter boundaries are first-class. Runtime message contracts remain string identifiers. | Medium |
| **E** Environment-Agnostic | Yellow | Browser and DeepSeek coupling is isolated to adapters/entrypoints; the Agent engine and policy are environment-agnostic. | Medium |
| **R** Replaceable Parts | Yellow | Engine/policy/transport are replaceable; UI/content renderers still have broad blast radius. | Medium |

**Overall Health**: 3/5 principles healthy after the AgentRun extraction — the remaining red zone is entrypoint/UI size, not the Agent runtime core.

## S.U.P.E.R Violation Hotspots

| Hotspot | Severity | Evidence | Agent-run impact |
|:--|:--|:--|:--|
| `entrypoints/content.ts` | Critical | 2045 lines; owns bridge, DOM, result cards, manual continuation, theme, token speed, storage guards | Agent policy is embedded in a page adapter |
| `core/interceptor/fetch-hook.ts` | Critical | 1240 lines; owns prompt mutation, fetch/XHR/IDB interception, stream cleanup, hidden managed-agent filtering | Chat interception remains the center of truth |
| `core/agent/deepseek-runner.ts` | Medium | 405 lines; composes prompt, DeepSeek adapter, Agent engine, steps, and telemetry | Still provider-specific but no longer owns transport or policy |
| `entrypoints/background.ts` | High | 696 lines; message router, storage, sync, scheduler, tab orchestration, tool/MCP operations | Needs a narrow Agent command surface |
| `entrypoints/sidepanel/pages/AgentRunsPage.tsx` | Medium | Agent task CRUD and run display still sits in one page component | UI should eventually expose step/result details more clearly |
| `core/constants.ts` | Medium | Global prompt templates, DeepSeek URL, marker, legacy schema constants | Agent prompts/markers should move to run-specific modules |

## Risk Matrix

| Risk | Impact | Likelihood | Severity | Mitigation |
|:--|:--|:--|:--|:--|
| Creating a second runner beside AgentRun runner | Duplicated tool loop and inconsistent behavior | High | High | Keep `core/agent/*` as the only task/run runtime; legacy automation runtime is deleted |
| Reframing UI without changing core invariants | Cosmetic "Agent" labels over chatbot behavior | High | High | Define `AgentRunRequest`, `AgentRunResult`, `AgentRunStep`, and `AgentSessionRef` first |
| Breaking manual chat tool calls | Existing core feature regresses | Medium | High | Keep chat surface as an adapter that submits/observes Agent runs; preserve XML parser and result cards |
| Breaking scheduled Agent tasks | User tasks stop running or lose session continuity | Medium | High | Keep Agent schedule and store state explicit |
| Hidden managed-agent prompts leak into chat/history | Internal prompts become visible and confusing | Medium | High | Keep explicit marker filtering, but move marker ownership into agent module and add targeted tests if a test runner is introduced |
| DeepSeek API/PoW changes | Agent runs fail despite correct architecture | Medium | Medium | Isolate DeepSeek transport and surface explicit errors, not silent fallbacks |
| Over-gating tool execution | Agent stops after saying it will act | High | Medium | Preserve current no-tool nudge/finalization behavior but make it policy-driven |
| OfficeCLI-specific heuristics pollute generic agent | Future tasks inherit document-only assumptions | Medium | Medium | Move OfficeCLI completion checks behind task/tool policy hooks |
| MV3 service worker lifetime | Long runs may fail across suspension | Medium | Medium | Store run state and keep execution in page context; expose retryable failure phases |
| GitHub/spec workflow overhead | Large plan artifacts stall implementation | Medium | Low | Keep Phase 2 confirmation narrow and task decomposition compact |

## High-Severity Risks

### Agent Runner Identity Is Now A Core Invariant

The code now has a first-class `core/agent/*` runtime with contracts, store, scheduler, bridge messages, sidepanel page, service, engine, policy, prompt context, telemetry, and DeepSeek adapter. The remaining risk is mainly live browser coverage and large entrypoint files.

### Page Adapter Owns Too Much Policy

`entrypoints/content.ts` decides when to continue, constructs managed-agent prompts, renders pending/result blocks, and filters descriptors. A Codex-style Agent run should make those decisions in a core run service; content should only bridge page events and render run state.

### DeepSeek Transport Must Remain Page-Context Aware

Direct background fetch is risky because DeepSeek login, localStorage token, PoW, locale, and history behavior are page-context dependent. The refactor should not move raw DeepSeek completion calls into the background service worker. Instead, background should orchestrate and persist, while main-world/page transport executes DeepSeek calls.

### OfficeCLI Exposes The Continuation Gap

OfficeCLI-specific nudging remains because a chat model often stops after `status` or `create_document`. That behavior now lives behind `core/agent/policy.ts`, while the generic engine only sees policy-state decisions.

## Technical Debt

- No unit test runner in `package.json`; only compile/build/smoke scripts exist.
- Runtime messages are not centralized as a typed command protocol.
- Several files are too large for safe incremental policy changes.
- Legacy `Automation*` runtime files have been removed; references that remain should be treated as stale documentation or archived history.
- Agent prompts and markers live in shared constants/content code rather than a run module.
- Prompt augmentation is reused but not framed as a stable `PromptContext` port.
- AgentRun prompt context, tab dispatch, bridge, auth, PoW, session, completion, and history boundaries now surface explicit failure phases; remaining silent guards are limited to non-run UI refresh/broadcast paths.

## Migration Boundary

- Legacy automation storage is intentionally not read after the no-compatibility pivot; new Agent state uses `deepseek_pp_agent_runs`.
- Existing MCP configuration, allowlists, cache invalidation, and secret redaction behavior must be preserved.
- Existing manual chat tool-call result blocks and history cleanup should not regress.
- README and MCP notes must keep describing AgentRun as the primary task model.
- Browser targets remain Chrome, Edge, and Firefox MV3.
- WebDAV sync should not start syncing MCP secrets or Agent run secrets by default.

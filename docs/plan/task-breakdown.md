# Task Breakdown

## Overview

- **Total Phases**: 6
- **Total Tasks**: 21
- **Estimated Total Effort**: XL
- **Decomposition Strategy**: Direct AgentRun refactor. Establish `AgentRun` as the invariant, delete the legacy `Automation*` runtime, and route scheduled tasks, manual continuations, and page execution through the same Agent contracts.

## Confirmed Task Definition

Refactor DeepSeek++ from a chatbot/page-augmentation architecture into a Codex-style Agent run architecture. A run must have an explicit task, session state, steps, tool loop, continuation policy, telemetry, failure phases, cancellation/status surface, and final result. DeepSeek chat remains a supported runtime surface, but not the core abstraction.

Scope constraints:

- Existing MCP, memory tools, manual chat tool calls, and Agent task storage must keep working.
- Legacy `deepseek_pp_automations` compatibility is explicitly out of scope after user confirmation; new storage uses `deepseek_pp_agent_runs`.
- DeepSeek web API execution must stay in page/main-world context unless a future explicit token/provider port is introduced.
- Do not keep a second runner beside AgentRun; legacy automation runtime is deleted instead of wrapped.
- Silent fallback at Agent run boundaries must become explicit run events or errors.

## S.U.P.E.R Design Constraints

- **S (Single Purpose)**: Agent contracts, engine, DeepSeek adapter, background lifecycle, page bridge, scheduler, storage, and UI each own one job.
- **U (Unidirectional Flow)**: `AgentRunRequest -> AgentRunEngine -> AgentRunStep/Event -> AgentRunResult`. Adapters call inward; core does not import React, Chrome tabs, DOM, or DeepSeek page globals.
- **P (Ports over Implementation)**: Define serializable contracts before migration: `AgentRun*`, `ModelTransport`, `ToolExecutor`, `PromptContextProvider`, `RunStore`, and `EventSink`.
- **E (Environment-Agnostic)**: Core run logic cannot read `localStorage`, `document`, `chrome`, or DeepSeek URLs directly.
- **R (Replaceable Parts)**: DeepSeek XML prompt protocol is an adapter. Tool providers, model transports, run stores, and renderers remain replaceable.

## Phase 1: Direct AgentRun Foundation

**Goal**: Define the Agent run invariant, direct message contracts, and run context without legacy compatibility shims.

**Prerequisite**: Phase 1 analysis and confirmed scope.

**S.U.P.E.R Focus**: P, R, U.

| # | Task | Priority | Effort | Depends On | Lane | S.U.P.E.R | Acceptance Criteria |
|:--|:--|:--|:--|:--|:--|:--|:--|
| T1.1 | Define `AgentRun` core contracts | P0 | M | - | A | P, R | `core/agent/types.ts` defines task/session/step/tool/final/telemetry/error/trigger contracts; all are serializable; no DeepSeek, DOM, React, or Chrome imports. |
| T1.2 | Remove legacy compatibility scope | P0 | M | T1.1 | A | P, R | No `core/agent/compat` layer exists; legacy `core/automation` runtime is removed; new task/run storage is `deepseek_pp_agent_runs`. |
| T1.3 | Add Agent run message/bridge contracts | P0 | S | T1.1 | B | U, P | New messages express start/result/cancel/status; legacy `DPP_AUTOMATION_*` messages are removed. |
| T1.4 | Define prompt/tool context port | P0 | M | T1.1 | C | S, U, P | Memory, preset, and MCP descriptors are provided as explicit run context inputs; manual chat and Agent tasks can share context construction without copying logic. |

### Parallel Lanes

| Lane | Tasks | Combined Effort | Merge Risk | Key Files |
|:--|:--|:--|:--|:--|
| A | T1.1, T1.2 | M+M | Medium | `core/agent/types.ts`, `core/agent/store.ts`, `core/agent/scheduler.ts`, `core/agent/types.ts` |
| B | T1.3 | S | Medium | `core/agent/messages.ts`, `core/types.ts`, `entrypoints/content.ts`, `entrypoints/main-world.content.ts` |
| C | T1.4 | M | Medium | `core/agent/prompt-context.ts`, `core/prompt/augmentation.ts`, `core/tool/runtime.ts` |

## Phase 2: Generic Engine Extraction

**Goal**: Move generic Agent loop, policy, and telemetry out of the DeepSeek AgentRun runner.

**Prerequisite**: Phase 1 complete.

**S.U.P.E.R Focus**: S, U, P, R.

| # | Task | Priority | Effort | Depends On | Lane | S.U.P.E.R | Acceptance Criteria |
|:--|:--|:--|:--|:--|:--|:--|:--|
| T2.1 | Extract generic Agent run engine loop | P0 | L | T1.1, T1.4 | A | S, U, P | `core/agent/engine.ts` owns step sequencing, max iterations, model/tool step recording, and finalization flow; engine depends only on ports; DeepSeek execution produces AgentRun steps, events, telemetry, and final result directly. |
| T2.2 | Extract continuation and finalization policy | P0 | M | T2.1 | B | S, R | No-tool nudge, finalish detection, finalization prompt, and OfficeCLI completion checks are policy modules; document-specific logic is not embedded in generic engine. |
| T2.3 | Add run step telemetry sink | P1 | M | T2.1 | C | P, R | Model/tool/policy/error steps produce telemetry records; outputs are truncated/redacted where needed; no secrets are stored in telemetry. |

### Parallel Lanes

| Lane | Tasks | Combined Effort | Merge Risk | Key Files |
|:--|:--|:--|:--|:--|
| A | T2.1 | L | High | `core/agent/deepseek-runner.ts`, `core/agent/messages.ts` |
| B | T2.2 | M | High | `core/agent/deepseek-runner.ts`, `core/officecli/*` |
| C | T2.3 | M | Medium | `core/agent/telemetry.ts`, `core/tool/history.ts` |

## Phase 3: DeepSeek And Chat Surface Adapters

**Goal**: Isolate DeepSeek web transport and downgrade the fetch hook/content scripts to adapters that observe, bridge, and render.

**Prerequisite**: Phase 2 complete.

**S.U.P.E.R Focus**: E, R, S, U.

| # | Task | Priority | Effort | Depends On | Lane | S.U.P.E.R | Acceptance Criteria |
|:--|:--|:--|:--|:--|:--|:--|:--|
| T3.1 | Extract DeepSeek page transport adapter | P0 | L | T2.1 | A | E, R | DeepSeek session creation, completion stream, history read, and response parsing live behind a transport adapter; engine can replace the transport. |
| T3.2 | Surface PoW/auth/history failures explicitly | P0 | M | T3.1 | A | E, P | Auth, PoW, session, completion, and history errors map to structured adapter/run failure phases; no silent success fallback at these boundaries. |
| T3.3 | Downgrade fetch hook to chat-surface adapter | P0 | L | T1.4, T2.1 | B | S, U, E | `fetch-hook` handles injection, stream parsing, XML hiding, and response events only; continuation/run policy is not owned there. |
| T3.4 | Switch main-world/content bridge to AgentRun requests | P0 | M | T1.3, T3.1 | B | U, R | Page context still executes DeepSeek transport; content/main-world bridge passes Agent run requests/results; legacy automation bridge is removed. |

### Parallel Lanes

| Lane | Tasks | Combined Effort | Merge Risk | Key Files |
|:--|:--|:--|:--|:--|
| A | T3.1, T3.2 | L+M | High | `core/agent/deepseek-runner.ts`, `core/agent/pow.ts`, `core/interceptor/sse-parser.ts` |
| B | T3.3, T3.4 | L+M | High | `core/interceptor/fetch-hook.ts`, `entrypoints/main-world.content.ts`, `entrypoints/content.ts` |

## Phase 4: Background Lifecycle And Callers

**Goal**: Make background the Agent run lifecycle coordinator and migrate scheduled/manual callers through the same service.

**Prerequisite**: Phase 3 complete.

**S.U.P.E.R Focus**: U, P, R.

| # | Task | Priority | Effort | Depends On | Lane | S.U.P.E.R | Acceptance Criteria |
|:--|:--|:--|:--|:--|:--|:--|:--|
| T4.1 | Add `AgentRunService` lifecycle coordinator | P0 | L | T2.1, T3.1 | A | U, P, R | Background coordinates create/start/running/complete/retry/timeout/cancel/status; it does not directly execute DeepSeek fetches. |
| T4.2 | Route scheduler and Agent task API through Agent service | P0 | M | T4.1 | B | R, U | Scheduled, manual, and retry Agent tasks retain current semantics through AgentRun state only. |
| T4.3 | Route manual chat continuation through Agent run | P0 | L | T3.4, T4.1 | C | S, U | Manual MCP continuation submits `AgentRunRequest`; content renders pending/result only; depth/limit/policy live in core. |
| T4.4 | Add typed command surface for Agent runs | P1 | M | T4.1 | D | P, U | Commands cover list/get/start/cancel/status and run-state broadcasts; UI no longer needs to patch legacy automation run objects directly for Agent operations. |

### Parallel Lanes

| Lane | Tasks | Combined Effort | Merge Risk | Key Files |
|:--|:--|:--|:--|:--|
| A | T4.1 | L | High | `core/agent/service.ts`, `core/agent/store.ts`, `entrypoints/background.ts` |
| B | T4.2 | M | Medium | `core/agent/scheduler.ts`, `core/agent/store.ts`, `core/agent/types.ts` |
| C | T4.3 | L | High | `entrypoints/content.ts`, `entrypoints/main-world.content.ts`, `core/interceptor/fetch-hook.ts` |
| D | T4.4 | M | Medium | `core/types.ts`, `entrypoints/background.ts`, `entrypoints/sidepanel/*` |

## Phase 5: UI, Storage Strangler, And Documentation

**Goal**: Expose Agent runs in the product, use Agent task storage only, and update external wording.

**Prerequisite**: Phase 4 complete.

**S.U.P.E.R Focus**: S, P, R, E.

| # | Task | Priority | Effort | Depends On | Lane | S.U.P.E.R | Acceptance Criteria |
|:--|:--|:--|:--|:--|:--|:--|:--|
| T5.1 | Add Agent Runs/Tasks sidepanel view | P1 | M | T4.4 | A | S, R | Users can inspect task, run steps, final result, and open session; Agent task CRUD is the only task UI. |
| T5.2 | Add new Agent run store | P0 | M | T4.1, T1.2 | B | P, R | New Agent runs persist independently in `deepseek_pp_agent_runs`; no legacy dual-read path remains. |
| T5.3 | Update README and operator notes for AgentRun model | P1 | S | T5.1, T5.2 | C | E, P | Docs describe Agent run as the primary model and Agent task scheduling as the primary caller; MCP/manual chat/storage boundaries are accurate. |

### Parallel Lanes

| Lane | Tasks | Combined Effort | Merge Risk | Key Files |
|:--|:--|:--|:--|:--|
| A | T5.1 | M | Medium | `entrypoints/sidepanel/pages/AgentRunsPage.tsx`, `entrypoints/sidepanel/App.tsx` |
| B | T5.2 | M | Medium | `core/agent/store.ts` |
| C | T5.3 | S | Low | `README.md`, `docs/verification/mcp-operator-notes.md`, `docs/releases/*` |

## Phase 6: Verification And Legacy Deletion Gates

**Goal**: Verify parity across entry points and delete legacy branches only where covered by equivalent Agent-run behavior.

**Prerequisite**: Phase 5 complete.

**S.U.P.E.R Focus**: P, E, U, R.

| # | Task | Priority | Effort | Depends On | Lane | S.U.P.E.R | Acceptance Criteria |
|:--|:--|:--|:--|:--|:--|:--|:--|
| T6.1 | Add targeted Agent run validation | P0 | M | T2.1, T5.2 | A | P, E | A reproducible script or test covers compile, MCP smoke/mock, and Agent engine contract smoke; failures are explicit. |
| T6.2 | Run live smoke matrix | P0 | L | T4.3, T5.1, T6.1 | B | U, E, R | Manual chat + MCP, scheduled Agent task, memory tools, history cleanup, and tool cards all route through AgentRun without regression. |
| T6.3 | Apply legacy deletion gates | P1 | M | T6.2 | C | S, R | Delete or collapse old runner/message/policy branches only when covered by equivalent Agent-run behavior; final diff has no second runner or duplicate policy. |

### Parallel Lanes

| Lane | Tasks | Combined Effort | Merge Risk | Key Files |
|:--|:--|:--|:--|:--|
| A | T6.1 | M | Low | `package.json`, `scripts/*`, `core/agent/*` |
| B | T6.2 | L | Medium | `docs/verification/*`, extension runtime |
| C | T6.3 | M | High | `core/agent/deepseek-runner.ts`, `core/agent/messages.ts`, `entrypoints/content.ts` |

## Milestone Acceptance Summary

- **M1 Contracts**: Agent run contracts, direct messages, prompt/tool context, store, scheduler, and bridge exist without direct AgentRun migration.
- **M2 Engine**: Generic loop, policy, and telemetry live in `core/agent/*`; DeepSeek execution lives under `core/agent/deepseek-runner.ts`.
- **M3 Adapters**: DeepSeek API/PoW/history/page bridge are transport adapters; fetch hook does not own run policy.
- **M4 Lifecycle**: Background owns Agent run lifecycle; scheduler/manual chat call the same service.
- **M5 AgentRun UI**: Agent Runs view and new store exist; legacy automation runtime is deleted.
- **M6 Verification**: Compile, smoke, live matrix, docs, and legacy deletion gates are complete.

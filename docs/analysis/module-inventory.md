# Module Inventory

| Module | Responsibility | Dependencies | Files | Lines | Complexity | S.U.P.E.R Score |
|:--|:--|:--|--:|--:|:--|:--|
| Entrypoints | Extension background, content, main-world, sidepanel shell | Chrome APIs, DOM, React, core modules | 5 | 3005 | Critical | S:red U:yellow P:yellow E:yellow R:red |
| Sidepanel pages/components | Management UI for memory, skill, preset, Agent tasks, MCP, settings | React, Chrome runtime messages, shared types | 16 | 3828 | High | S:yellow U:green P:yellow E:yellow R:yellow |
| Agent runtime | Contracts, store, scheduler, service, prompt context, engine, policy, telemetry, DeepSeek adapter | prompt, tool, storage, DeepSeek adapter, SSE parser | 12 | 1464 | High | S:green U:green P:green E:yellow R:green |
| Tool runtime | Provider-neutral tool contracts, invocation catalog, memory tools, history | memory store, MCP discovery, Chrome storage | 5 | 687 | Medium | S:green U:green P:green E:green R:green |
| MCP runtime | Server config, discovery, client, transports | tool contracts, Chrome permissions, fetch/native messaging | 8 | 1192 | High | S:green U:green P:green E:yellow R:green |
| Interceptor | Prompt mutation, SSE/XHR/fetch interception, history cleanup, tool stripping | prompt, skill, tool catalog, token estimator | 3 | 1483 | Critical | S:red U:yellow P:yellow E:red R:red |
| Prompt/memory/skill/preset | Prompt augmentation, memory selection/store, skill registry, preset/model config | Dexie, Chrome storage, token estimator | 11 | 786 | Medium | S:yellow U:green P:yellow E:green R:yellow |
| OfficeCLI provider | Local MCP contracts and policy for document operations | tool/MCP contracts, Node scripts | 3 | 199 | Medium | S:green U:green P:green E:yellow R:green |
| Sync/background/theme/browser helpers | WebDAV sync, extension-safe browser wrapper, background/theme config | Chrome APIs, fetch | 10 | 369 | Medium | S:green U:green P:yellow E:yellow R:yellow |
| Scripts/docs/assets | Smoke checks, MCP mock/provider, docs, release/archive assets | Node, local files | 8+ | n/a | Medium | S:yellow U:green P:yellow E:yellow R:yellow |

> Score key: `green` = compliant, `yellow` = partial, `red` = violation. Ratings are based on the S.U.P.E.R principles: Single Purpose, Unidirectional Flow, Ports over Implementation, Environment-Agnostic, Replaceable Parts.

## Module Details

### Entrypoints

- **Path**: `entrypoints/background.ts`, `entrypoints/content.ts`, `entrypoints/main-world.content.ts`, `entrypoints/sidepanel/App.tsx`, `entrypoints/sidepanel/main.tsx`
- **Responsibility**: Connect extension APIs, DeepSeek page context, DOM rendering, and sidepanel UI.
- **Public API**: runtime message switch in `background.ts`, window message protocol in content/main-world, React app routes.
- **Internal Dependencies**: Agent, tool, MCP, prompt, memory, skill, preset, sync, background, theme modules.
- **External Dependencies**: Chrome extension APIs, DOM, WXT content script runtime, React.
- **Complexity Rating**: Critical.
- **Transformation Notes**: `content.ts` is over 2000 lines and currently mixes DOM/UI, bridge, result rendering, extension invalidation, theme/token display, and manual Agent continuation. This is the largest barrier to a clean Agent-run model.
- **S.U.P.E.R Assessment**:
  - **S**: Red. Multiple responsibilities in `content.ts` and `background.ts`.
  - **U**: Yellow. Data flow is mostly page -> content -> background -> core, but manual continuation policy leaks into content.
  - **P**: Yellow. Message payloads are typed by convention but not centralized or validated.
  - **E**: Yellow. Entrypoints are browser/page-specific by design; DeepSeek DOM coupling needs isolation.
  - **R**: Red. Replacing renderer or runner policy still requires edits in large entrypoint files.

### Sidepanel Pages And Components

- **Path**: `entrypoints/sidepanel/`
- **Responsibility**: User-facing configuration for memories, skills, presets, Agent tasks, MCP, settings, and status.
- **Public API**: React pages calling `chrome.runtime.sendMessage`.
- **Internal Dependencies**: shared core types, schedule validator, constants.
- **External Dependencies**: React, Chrome runtime/tabs APIs.
- **Complexity Rating**: High.
- **Transformation Notes**: `AgentRunsPage.tsx` owns Agent task CRUD and recent run display, but execution policy belongs in `core/agent/*`. `McpPage.tsx` is large and should remain configuration-only.
- **S.U.P.E.R Assessment**:
  - **S**: Yellow. Pages are split, but several pages are large.
  - **U**: Green. UI talks outward to background.
  - **P**: Yellow. Message contracts are not schema-defined at runtime.
  - **E**: Yellow. Direct Chrome APIs in UI make isolated testing harder.
  - **R**: Yellow. UI replacement is possible, but command contract changes are broad.

### Agent Runtime

- **Path**: `core/agent/`
- **Responsibility**: Agent task/run definitions, scheduling, lifecycle service, prompt context, provider-neutral tool loop, policy, DeepSeek page adapter, run history.
- **Public API**: `runAgentTask`, `executeAgentRunThroughPage`, `runAgentRunEngine`, `runDeepSeekAgentRun`, store functions, schedule validation, message helpers.
- **Internal Dependencies**: prompt augmentation, tool descriptors, SSE parser, DeepSeek constants through `deepseek-web-adapter.ts`.
- **External Dependencies**: DeepSeek web APIs, browser localStorage/page context, Chrome storage through callers, `js-sha3`.
- **Complexity Rating**: Critical.
- **Transformation Notes**: This is now the first-class Agent runtime. The engine/policy/transport/service seams are split; remaining work is mostly live validation and reducing UI/content size.
- **S.U.P.E.R Assessment**:
  - **S**: Green. Contracts, engine, policy, transport adapter, scheduler, and service are separate modules.
  - **U**: Green. Scheduler/background call service/executor; runner composes inward through adapter and engine.
  - **P**: Green. Request/result/run types are serializable.
  - **E**: Yellow. DeepSeek URLs, PoW worker URLs, and page localStorage are isolated but still page-specific by design.
  - **R**: Green. DeepSeek transport is now replaceable at the adapter boundary.

### Tool Runtime

- **Path**: `core/tool/`
- **Responsibility**: Provider-neutral tool descriptor/call/result types, XML invocation names, memory tool provider, runtime execution, history.
- **Public API**: `ToolDescriptor`, `ToolCall`, `ToolResult`, `getRuntimeToolDescriptors`, `executeRuntimeToolCall`, invocation catalog helpers.
- **Internal Dependencies**: memory store, MCP discovery.
- **External Dependencies**: Chrome storage through history/store callers.
- **Complexity Rating**: Medium.
- **Transformation Notes**: This module is already aligned with the desired Agent run design and should become the run loop's tool port.
- **S.U.P.E.R Assessment**:
  - **S**: Green. Clear contracts and execution helpers.
  - **U**: Green. Runtime delegates to providers.
  - **P**: Green. Serializable descriptor/call/result contracts exist.
  - **E**: Green. Mostly environment-agnostic core types.
  - **R**: Green. Providers are replaceable.

### MCP Runtime

- **Path**: `core/mcp/`
- **Responsibility**: MCP server configuration, discovery cache, execution, and HTTP/SSE/bridge/native transports.
- **Public API**: server store, discovery refresh, `executeMcpToolCall`, transport helpers.
- **Internal Dependencies**: tool contracts.
- **External Dependencies**: fetch, Chrome permissions/native messaging.
- **Complexity Rating**: High.
- **Transformation Notes**: Reuse as-is for Agent tools. Avoid confusing browser-supported transports with desktop-native stdio process spawning.
- **S.U.P.E.R Assessment**:
  - **S**: Green. Transport/store/discovery/client are split.
  - **U**: Green. Tool runtime depends on MCP execution, not the reverse.
  - **P**: Green. Tool descriptors define the boundary.
  - **E**: Yellow. Browser permission and native messaging constraints are explicit but platform-specific.
  - **R**: Green. Transport implementations are replaceable.

### Interceptor

- **Path**: `core/interceptor/`
- **Responsibility**: Intercept DeepSeek requests/responses, mutate prompts, parse SSE, strip tool tags, hide internal managed-agent messages, emit response metadata.
- **Public API**: `installFetchHook`, `updateHookState`, parser helpers.
- **Internal Dependencies**: prompt, skill, tool, token estimator, constants.
- **External Dependencies**: DeepSeek request/stream/history formats, browser fetch/XHR/IndexedDB.
- **Complexity Rating**: Critical.
- **Transformation Notes**: The fetch hook should become a thin chat-surface adapter. Agent-run policy should move out of content/interceptor into a core runner.
- **S.U.P.E.R Assessment**:
  - **S**: Red. Prompt mutation, stream parsing, DOM/history cleanup, telemetry and hidden-message filtering coexist.
  - **U**: Yellow. The page adapter imports substantial core policy.
  - **P**: Yellow. Stream and history shapes are inferred from DeepSeek payloads.
  - **E**: Red. DeepSeek API details and browser monkey-patching dominate the module.
  - **R**: Red. Replacing DeepSeek surface has high blast radius.

### Prompt / Memory / Skill / Preset

- **Path**: `core/prompt/`, `core/memory/`, `core/skill/`, `core/preset/`, `core/model/`
- **Responsibility**: Build augmented prompts and manage user context/config.
- **Public API**: `buildPromptAugmentation`, memory store/selector, skill registry/parser, preset/model stores.
- **Internal Dependencies**: tool descriptors, token estimator, constants.
- **External Dependencies**: Dexie, Chrome storage.
- **Complexity Rating**: Medium.
- **Transformation Notes**: Agent runs should consume a prepared prompt context rather than having every surface recalculate memories/presets differently.
- **S.U.P.E.R Assessment**:
  - **S**: Yellow. Modules are mostly split; prompt augmentation still knows memory/tool presentation details.
  - **U**: Green. Reads state and returns serializable prompt data.
  - **P**: Yellow. Prompt context type exists but needs a run-oriented contract.
  - **E**: Green. Storage dependencies are localized.
  - **R**: Yellow. Prompt renderer replacement is moderate.

### OfficeCLI Provider

- **Path**: `core/officecli/`, `scripts/officecli-mcp-server.mjs`, `scripts/officecli-smoke.mjs`
- **Responsibility**: Provide local document tools through a bounded MCP provider and smoke checks.
- **Public API**: OfficeCLI contracts/policy and MCP server script.
- **Internal Dependencies**: MCP/tool contracts.
- **External Dependencies**: local filesystem and officecli runtime.
- **Complexity Rating**: Medium.
- **Transformation Notes**: This is the strongest real-world Agent-run use case because multi-step document tasks expose chatbot continuation weaknesses.
- **S.U.P.E.R Assessment**:
  - **S**: Green. Provider, policy, contracts are separated.
  - **U**: Green. Exposed through MCP/tool port.
  - **P**: Green. Explicit tool contracts.
  - **E**: Yellow. Local runtime and root allowlist are environment-bound by nature.
  - **R**: Green. Can be replaced by another MCP provider.

### Sync / Background / Theme / Browser Helpers

- **Path**: `core/sync/`, `core/background/`, `core/theme/`, `core/browser/`, `core/version.ts`, `core/messaging.ts`
- **Responsibility**: Peripheral configuration, sync, browser compatibility, versioning.
- **Public API**: small store/helper functions.
- **Internal Dependencies**: shared types.
- **External Dependencies**: Chrome APIs, fetch/WebDAV.
- **Complexity Rating**: Medium.
- **Transformation Notes**: Not central to Agent run refactor except where run state persistence needs the same storage patterns.
- **S.U.P.E.R Assessment**:
  - **S**: Green.
  - **U**: Green.
  - **P**: Yellow. Config values are typed but lightly validated.
  - **E**: Yellow. Browser/WebDAV-specific.
  - **R**: Yellow. Replacement cost is low to moderate.

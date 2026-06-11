# Better DeepSeek Capability Adoption — Progress Tracker

> **Task**: Incorporate high-value Better DeepSeek capabilities that DeepSeek++ does not currently support, with Android WebView support explicitly in scope.
> **Started**: 2026-06-11
> **Last Updated**: 2026-06-11
> **Mode**: GITHUB_STANDARD
> **Repo**: zhu1090093659/deepseek-pp

## GitHub Resources

- **All Issues**: `gh issue list -R zhu1090093659/deepseek-pp --label "spec-driven" --state all`
- **Current Spec Issues**: `gh issue list -R zhu1090093659/deepseek-pp --milestone "Phase 1: Foundation Contracts and Seams" --state open`
- **Project Board**: unavailable in current `gh` auth scope; mode is `GITHUB_STANDARD`.

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
| 1 | Foundation Contracts and Seams | https://github.com/zhu1090093659/deepseek-pp/milestone/31 | 5 | 0 | 5 |
| 2 | P0 Project Context and Artifact Delivery | https://github.com/zhu1090093659/deepseek-pp/milestone/32 | 6 | 0 | 6 |
| 3 | Android WebView Baseline | https://github.com/zhu1090093659/deepseek-pp/milestone/33 | 5 | 0 | 5 |
| 4 | P1 Interactive Agent Tools | https://github.com/zhu1090093659/deepseek-pp/milestone/34 | 6 | 0 | 6 |
| 5 | P2 Organization, Export, and Product Surfaces | https://github.com/zhu1090093659/deepseek-pp/milestone/35 | 5 | 0 | 5 |
| 6 | Hardening, Documentation, and Release Readiness | https://github.com/zhu1090093659/deepseek-pp/milestone/36 | 3 | 0 | 3 |

> GitHub open/closed counts reflect remote issue state. The P0 pass below has been implemented locally on `main`; GitHub Issues remain open until commit/push reconciliation.

## Issue Mapping

| Task ID | Issue | Title | Status |
|:--|:--|:--|:--|
| T1.1 | #152 | Define platform service contracts for storage, runtime messaging, downloads, file picking, asset URLs, and environment capabilities | implemented locally |
| T1.2 | #153 | Add runtime bridge message schemas for MAIN/content/background/platform communication | implemented locally |
| T1.3 | #154 | Define prompt context ordering contract for preset, Skill, memory, project context, and tool instructions | implemented locally |
| T1.4 | #155 | Extract content card renderer registry from the large content entrypoint | implemented locally |
| T1.5 | #156 | Add minimal browser e2e fixture harness for DOM injections | open |
| T2.1 | #157 | Add Project and ProjectFile schemas, stores, migrations, and sync boundary rules | implemented locally |
| T2.2 | #158 | Add GitHub repo, web page, and local folder source readers for project context | implemented locally |
| T2.3 | #159 | Add project RAG retrieval and prompt injection budget integration | implemented locally |
| T2.4 | #160 | Add Projects UI and attach menu for active project/files | implemented locally |
| T2.5 | #161 | Add generated artifact local tool provider for single-file outputs | implemented locally |
| T2.6 | #162 | Add multi-file project bundle workflow equivalent to LONG_WORK | implemented locally |
| T3.1 | #163 | Add Android web-bundle build target and asset staging | implemented locally |
| T3.2 | #164 | Add Kotlin WebView host, asset loader, cookie/login handling, and injection lifecycle | implemented locally; APK build blocked locally by missing JDK |
| T3.3 | #165 | Implement Android bridge for storage, downloads, file/folder picking, theme, and locale | implemented locally |
| T3.4 | #166 | Add Android capability gating for native messaging, Shell, sidePanel-only UI, and unsupported browser APIs | implemented locally |
| T3.5 | #167 | Add Android test/CI documentation and smoke commands | open |
| T4.1 | #168 | Add user-approved browser sandbox code runner for JS/TS/Python where available | open |
| T4.2 | #169 | Add optional voice input and response read-aloud | open |
| T4.3 | #170 | Add AI-assisted Skill creator tool with review-before-save | open |
| T4.4 | #171 | Add memory import from another AI workflow | open |
| T4.5 | #172 | Add saved items, bookmarks, and snippets with prompt insertion | open |
| T4.6 | #173 | Add prompt injection controls: disable memory/system prompt, preset cadence, force response language | open |
| T5.1 | #174 | Add chat tags, filtering, and history search adapters for DeepSeek sidebar | open |
| T5.2 | #175 | Extend export to message-level, saved-item, and image outputs | open |
| T5.3 | #176 | Add API playground behind explicit developer/user setting | open |
| T5.4 | #177 | Add small UX polish: code block downloads, native navigation patch, local what's-new panel | open |
| T5.5 | #178 | Decide custom CSS/theme preset policy; implement only if compatible with store/product posture | open |
| T6.1 | #179 | Run and fix full validation matrix across compile, tests, prompt freeze, browser builds, smoke checks, and Android best-available checks | best-available local validation complete; Android Gradle blocked by missing JDK |
| T6.2 | #180 | Update README, README_EN, store-facing docs, and Android install/developer docs | open |
| T6.3 | #181 | Final progress reconciliation and archive preparation | open |

## Quick Status Commands

```bash
# Phase progress
gh api repos/zhu1090093659/deepseek-pp/milestones \
  --jq '.[] | select(.number >= 31 and .number <= 36) | "\(.title): \(.open_issues) open, \(.closed_issues) closed"'

# Open tasks for the active phase
gh issue list -R zhu1090093659/deepseek-pp \
  --milestone "Phase 1: Foundation Contracts and Seams" \
  --state open \
  --json number,title

# All current spec tasks
gh issue list -R zhu1090093659/deepseek-pp \
  --label "spec-driven" \
  --state all \
  --json number,title,state,milestone
```

## Phase Checklist

- [x] Phase 1: Foundation Contracts and Seams (local P0 4/4 implemented; T1.5 remains P1) — [milestone](https://github.com/zhu1090093659/deepseek-pp/milestone/31)
- [x] Phase 2: P0 Project Context and Artifact Delivery (local 6/6 implemented) — [milestone](https://github.com/zhu1090093659/deepseek-pp/milestone/32)
- [x] Phase 3: Android WebView Baseline (local P0 4/4 implemented; APK validation blocked by missing JDK; T3.5 remains P1 docs/CI) — [milestone](https://github.com/zhu1090093659/deepseek-pp/milestone/33)
- [ ] Phase 4: P1 Interactive Agent Tools (0/6 tasks) — [milestone](https://github.com/zhu1090093659/deepseek-pp/milestone/34)
- [ ] Phase 5: P2 Organization, Export, and Product Surfaces (0/5 tasks) — [milestone](https://github.com/zhu1090093659/deepseek-pp/milestone/35)
- [ ] Phase 6: Hardening, Documentation, and Release Readiness (0/3 tasks) — [milestone](https://github.com/zhu1090093659/deepseek-pp/milestone/36)

## Current Status

**Active Phase**: P0 local implementation complete; next user-requested pass should start P1.
**Active Task**: Next pass begins with Phase 4 / T4.1 (#168) unless the user asks to reconcile/commit P0 first.
**Blockers**: Android APK/Gradle validation is blocked on this machine because `java -version` reports no Java Runtime. `npm run android:assemble:debug` stops at the explicit JDK check.

## Latest P0 Validation

| Command | Result | Notes |
|:--|:--|:--|
| `npm run compile` | pass | TypeScript contracts compile |
| `npm test` | pass | 18 test files, 84 tests |
| `npm run prompt:freeze` | pass | Updated hash for intentional project-context prompt ordering |
| `npm run verify:i18n` | pass | Locale parity and hardcoded Chinese audit pass |
| `npm run verify:automation` | pass | Automation contract smoke pass |
| `npm run smoke:pow` | pass | DeepSeek PoW smoke pass |
| `npm run smoke:mcp` | pass | MCP descriptor/parser/timeout smoke pass |
| `npm run verify:mcp:mock` | pass | Manual and automation continuation mock pass |
| `npm run smoke:shell` | pass | 12 Shell host smoke checks pass |
| `npm run build:android` | pass | Chrome MV3 build and Android asset staging pass |
| `npm run build:all` | pass | Chrome, Edge, Firefox MV3 builds pass |
| `npm run verify:manifest-policy` | pass | Manifest policy check pass |
| `npm run audit:prod` | pass | 0 high production vulnerabilities |
| `npm run android:assemble:debug` | blocked | Missing local JDK; APK not built |
| `git diff --check` | pass | No whitespace errors |

## Governance Status

**Shared instruction surface**: `AGENTS.md`, auto-generated from Claude project memory. Do not hand-edit for durable rules unless the sync source is also updated.
**Claude Code instruction surface**: no root `CLAUDE.md`; `.claude/settings.local.json` exists.
**Other platform rule surfaces**: `.codex/skills/` exists but has no project skill files; no Cursor/Windsurf/Cline rules found.
**Memory surface**: Codex native memory.
**Memory fallback path**: none. Do not create repo-local fallback memory unless explicitly selected.

## Execution Telemetry

Per-task telemetry should be written to the corresponding GitHub Issue as comments. Adaptive drift state lives in Milestone descriptions under the `adaptive` YAML block.

## Notes

- Better DeepSeek reference snapshot: `EdgeTypE/better-deepseek` commit `450168e` from 2026-06-09.
- Do not copy Better DeepSeek's BDS tag system wholesale. New capabilities should map to DeepSeek++ ToolDescriptor, prompt augmentation, platform, and renderer contracts.
- Android is in scope, but validation must be explicit: TypeScript tests, Gradle/Kotlin tests, APK build, and emulator/WebView smoke are separate evidence levels.
- Previous active multilingual runtime support spec artifacts were complete and archived locally under `docs/archives/multilingual-english-runtime-support/`; milestones #26-#30 are closed.

## Next Steps

1. Reconcile/commit P0 local implementation when ready.
2. Install a local JDK before claiming Android APK validation.
3. Continue with P1 tasks in Phase 4, starting from T4.1 (#168).

## Session Log

| Date | Session | Summary |
|:--|:--|:--|
| 2026-06-11 | Planning | Archived completed multilingual runtime support artifacts, analyzed DeepSeek++ and Better DeepSeek, wrote analysis and plan docs, created GitHub Milestones #31-#36 and Issues #152-#181, and initialized this progress tracker. |
| 2026-06-11 | P0 implementation | Implemented platform contracts, bridge schemas, prompt project-context ordering, renderer registry, Project Context/RAG, artifact file/zip tools, Projects UI, Android WebView scaffold, Android asset staging scripts, and capability gating. Validation passed except Android APK build, which is blocked by missing local JDK. |

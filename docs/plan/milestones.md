# Milestones

| # | Milestone | Target Phase | Criteria | Status |
|:--|:--|:--|:--|:--|
| 1 | Direct AgentRun Foundation | After Phase 1 | Agent run contracts, direct messages, prompt/tool context, store, scheduler, and bridge exist without legacy compatibility. | Complete |
| 2 | Generic Engine Extraction | After Phase 2 | Generic loop, continuation/finalization policy, and telemetry live in `core/agent/*`; DeepSeek execution delegates to the Agent engine. | Complete |
| 3 | DeepSeek And Chat Surface Adapters | After Phase 3 | DeepSeek API/PoW/history/page bridge are adapters; fetch hook and content scripts no longer own run policy. | Complete |
| 4 | Background Lifecycle And Callers | After Phase 4 | Background owns Agent run lifecycle; scheduler and manual chat continuation call the same AgentRun path. | Complete |
| 5 | UI, Storage Strangler, And Documentation | After Phase 5 | Agent Runs view and new run store exist; legacy automation runtime is deleted; docs describe AgentRun as the primary model. | Complete |
| 6 | Verification And Legacy Deletion Gates | After Phase 6 | Compile, MCP smoke/mock, live manual/scheduled matrix, docs, and legacy deletion gates are complete. | Complete |

## GitHub Tracking

Tracking mode: `GITHUB_STANDARD`

GitHub resources are synchronized after these local plan documents are created:

- One GitHub Milestone per phase.
- One GitHub Issue per task.
- Labels for priority, size, phase, lane, and `spec-driven`.
- Adaptive control YAML stored in each Milestone description.

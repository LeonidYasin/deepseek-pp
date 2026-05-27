## MCP Live Mock Verification

Date: 2026-05-27

### Commands

```bash
npm run verify:mcp:mock
npm run smoke:mcp
npm run compile
npm run build:all
```

### Result

All commands passed locally.

`npm run verify:mcp:mock` starts a live loopback MCP HTTP server and verifies:

- manual-chat style automatic MCP execution from an XML tool block
- compact `<tool_results>` continuation prompt construction
- AgentRun-style MCP continuation loop
- AgentRun call-history record shape with MCP provider/tool context

### Chrome Live Smoke

On 2026-05-27, Chrome loaded `dist/chrome-mv3` as unpacked extension `dcmbfbnfefgjbhpflcnjbjoikacphpmi` and the DeepSeek page was refreshed after the extension reload. The OfficeCLI Streamable HTTP provider at `http://127.0.0.1:26316/mcp` reported ready with 7 discovered tools.

Live prompt:

```text
请调用 officecli_status 工具，工具结果返回后只用一句话说明 provider、roots 数量和 writeEnabled。不要创建或修改文件。
```

Observed result:

- `officecli_status` rendered as an executed MCP tool card instead of visible raw XML.
- The tool result reported `provider: deepseek-pp-officecli`, one root under `/Users/zcl/code/deepseek-pp`, and `writeEnabled: true`.
- DeepSeek continued after the tool result and answered in one sentence with provider/root/write status.

`npm run smoke:mcp` verifies:

- JSON-RPC initialize/list/call flow against a mock MCP server
- descriptor rendering into prompt tool schemas
- descriptor-driven XML parsing and filtering
- disabled tool exclusion from rendered prompt tools
- bounded transport timeout error path

### Browser Policy Notes

Full DeepSeek UI verification requires a user browser profile with:

- the matching unpacked build reloaded in the browser extension manager
- an active authenticated `https://chat.deepseek.com/` session
- explicit host permission approval for the MCP server origin from the MCP sidepanel

The CLI verification cannot grant browser extension host permissions or assert the user's DeepSeek login state. To reproduce manually:

1. Run `node scripts/mcp-live-mock.mjs --serve` and keep the process running.
2. Reload the unpacked extension for the target browser: `dist/chrome-mv3/`, `dist/edge-mv3/`, or `dist/firefox-mv3/manifest.json`.
3. Open the sidepanel MCP tab and add a Streamable HTTP server using the printed loopback URL.
4. Click `授权`, then `测试`, then `刷新工具`.
5. Send a DeepSeek prompt that asks it to call `mcp_mock_echo` with `{"text":"manual"}` and confirm the tool result block appears and continuation is sent.
6. Create an Agent task that asks for the same tool call, run it manually, and confirm the run records one MCP execution.

import type { McpServerCreateInput } from '../mcp/types';
import {
  OFFICECLI_MCP_ENDPOINT,
  OFFICECLI_MCP_SERVER_NAME,
  OFFICECLI_READ_TOOL_NAMES,
} from './contracts';

export interface OfficeCliMcpPresetOptions {
  url?: string;
  enabled?: boolean;
}

export function createOfficeCliMcpPresetInput(
  options: OfficeCliMcpPresetOptions = {},
): McpServerCreateInput {
  return {
    displayName: OFFICECLI_MCP_SERVER_NAME,
    enabled: options.enabled ?? true,
    transport: {
      kind: 'streamable_http',
      url: options.url ?? OFFICECLI_MCP_ENDPOINT,
    },
    headers: [],
    secrets: [],
    timeouts: {
      connectMs: 10_000,
      requestMs: 120_000,
      discoveryMs: 20_000,
    },
    limits: {
      maxResultBytes: 64_000,
      maxToolCount: 16,
    },
    allowlist: {
      mode: 'allow',
      toolNames: [...OFFICECLI_READ_TOOL_NAMES],
    },
    execution: {
      enabled: true,
      mode: 'auto',
    },
  };
}

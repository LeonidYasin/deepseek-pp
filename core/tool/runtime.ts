import {
  deleteMemory,
  getMemoryById,
  saveMemory,
  updateMemory,
} from '../memory/store';
import {
  executeMcpToolCall,
  getMcpToolDescriptors,
  refreshMcpServerDiscovery,
} from '../mcp/discovery';
import { DEFAULT_LOCALE, translate, type SupportedLocale } from '../i18n';
import { getAllMcpServers } from '../mcp/store';
import type { Memory, NewMemory } from '../types';
import { appendToolCallHistory } from './history';
import {
  createMemoryToolDescriptors,
  executeMemoryToolCall,
  isMemoryToolName,
  type MemoryToolRuntime,
} from './memory';
import {
  createWebSearchToolDescriptors,
  executeWebSearchToolCall,
  isWebSearchToolName,
} from './web-search';
import {
  createArtifactToolDescriptors,
  executeArtifactToolCall,
  isArtifactToolName,
} from '../artifact';
import { getWebToolSettings } from './web-settings';
import type { ToolCall, ToolDescriptor, ToolExecutionTrigger, ToolResult } from './types';

const memoryRuntime: MemoryToolRuntime = {
  async saveMemory(input: NewMemory) {
    const id = await saveMemory(input);
    return { id };
  },
  async getMemoryById(id: number) {
    return (await getMemoryById(id)) ?? null;
  },
  async updateMemory(memory: Memory) {
    await updateMemory(memory);
  },
  async deleteMemory(id: number) {
    await deleteMemory(id);
  },
};

export async function getRuntimeToolDescriptors(
  locale: SupportedLocale = DEFAULT_LOCALE,
): Promise<ToolDescriptor[]> {
  const webSettings = await getWebToolSettings();
  const enabledWebDescriptors = createWebSearchToolDescriptors(locale).filter(
    (d) => webSettings[d.name as keyof typeof webSettings] !== false,
  );
  return [
    ...createMemoryToolDescriptors(locale),
    ...enabledWebDescriptors,
    ...createArtifactToolDescriptors(locale),
    ...await getMcpToolDescriptors(),
  ];
}

export async function refreshRuntimeToolDescriptors(
  locale: SupportedLocale = DEFAULT_LOCALE,
): Promise<ToolDescriptor[]> {
  const servers = await getAllMcpServers({ includeSecrets: false });
  await Promise.all(
    servers
      .filter((server) => server.enabled)
      .map((server) => refreshMcpServerDiscovery(server.id)),
  );
  return getRuntimeToolDescriptors(locale);
}

export async function executeRuntimeToolCall(
  call: ToolCall,
  source: ToolExecutionTrigger,
  locale: SupportedLocale = DEFAULT_LOCALE,
): Promise<ToolResult> {
  const result = await executeToolCallWithoutHistory(call, locale);
  await appendToolCallHistory(call, result, source);
  return result;
}

async function executeToolCallWithoutHistory(
  call: ToolCall,
  locale: SupportedLocale,
): Promise<ToolResult> {
  if (call.parseError) {
    return {
      ok: false,
      summary: translate(locale, 'tool.runtime.invalidFormat'),
      detail: call.parseError.message,
      name: call.name,
      provider: call.provider,
      descriptorId: call.descriptorId,
      error: call.parseError,
    };
  }

  if (isMemoryToolName(call.name)) {
    return executeMemoryToolCall(memoryRuntime, call, locale);
  }

  if (isWebSearchToolName(call.name)) {
    return executeWebSearchToolCall(call, locale);
  }

  if (isArtifactToolName(call.name)) {
    return executeArtifactToolCall(call, locale);
  }

  if (call.provider?.kind === 'mcp' || call.descriptorId?.startsWith('mcp:')) {
    return executeMcpToolCall(call);
  }

  return {
    ok: false,
    summary: translate(locale, 'tool.runtime.unknownTool'),
    detail: `Unsupported tool: ${call.name}`,
    name: call.name,
    provider: call.provider,
    descriptorId: call.descriptorId,
    error: {
      code: 'tool_unsupported',
      message: `Unsupported tool: ${call.name}`,
      retryable: false,
    },
  };
}

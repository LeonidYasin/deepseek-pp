import { DPP_MANAGED_AGENT_PROMPT_MARKER } from '../constants';
import { sanitizeInternalPromptText } from '../prompt';
import type { ToolCallRestoreRecord, ToolDescriptor } from '../types';
import { createToolInvocationCatalog, hasXmlToolMarker } from '../tool';
import { extractToolCalls, stripToolCalls } from './tool-parser';

export interface HistoryCleanupOptions {
  toolDescriptors: readonly ToolDescriptor[];
  onToolCallsRestored: (records: ToolCallRestoreRecord[]) => void;
}

export function stripToolCallsFromHistory(json: any, options: HistoryCleanupOptions) {
  if (!json || !json.data) return;
  const data = json.data.biz_data || json.data;
  const messages = data.chat_messages;
  if (!Array.isArray(messages)) return;

  const restoredRecords: ToolCallRestoreRecord[] = [];
  stripMessageToolCalls(messages, restoredRecords, options.toolDescriptors);

  if (restoredRecords.length > 0) {
    options.onToolCallsRestored(restoredRecords);
  }
}

export function stripToolCallsFromIDBResult(result: any, options: HistoryCleanupOptions) {
  const restoredRecords: ToolCallRestoreRecord[] = [];

  if (Array.isArray(result)) {
    for (const item of result) {
      stripSingleIDBRecord(item, restoredRecords, options.toolDescriptors);
    }
  } else {
    stripSingleIDBRecord(result, restoredRecords, options.toolDescriptors);
  }

  if (restoredRecords.length > 0) {
    options.onToolCallsRestored(restoredRecords);
  }
}

function stripSingleIDBRecord(
  record: any,
  restoredRecords: ToolCallRestoreRecord[],
  toolDescriptors: readonly ToolDescriptor[],
) {
  if (!record || !record.data) return;
  const data = record.data;
  const messages = data.chat_messages;
  if (!Array.isArray(messages)) return;

  stripMessageToolCalls(messages, restoredRecords, toolDescriptors);
}

function stripMessageToolCalls(
  messages: any[],
  restoredRecords: ToolCallRestoreRecord[],
  toolDescriptors: readonly ToolDescriptor[],
) {
  const visibleMessages = messages.filter((msg: any) => !isRemovableInternalManagedAgentMessage(msg));
  if (visibleMessages.length !== messages.length) {
    messages.splice(0, messages.length, ...visibleMessages);
  }

  let assistantMessageIndex = 0;
  visibleMessages.forEach((msg: any, index: number) => {
    sanitizeInlineAgentContinuationMessage(msg);
    sanitizeStoredMessageInternalPrompt(msg);
    const hasStoredToolCall = storedMessageHasToolCallMarker(msg, toolDescriptors);
    const isAssistant = isAssistantStoredMessage(msg) || hasStoredToolCall;
    const currentAssistantMessageIndex = isAssistant ? assistantMessageIndex++ : null;
    const metadata = createMessageRestoreMetadata(msg, index, currentAssistantMessageIndex);
    const messageKey = getMessageRestoreKey(msg, index);
    if (typeof msg.content === 'string' && hasToolCallMarker(msg.content, toolDescriptors)) {
      const record = collectToolCallRestoreRecord(msg.content, `${messageKey}:content`, toolDescriptors, metadata);
      if (record) restoredRecords.push(record);
      msg.content = stripToolCalls(msg.content, { descriptors: toolDescriptors });
    }
    if (msg.fragments && Array.isArray(msg.fragments)) {
      msg.fragments.forEach((frag: any, fragIndex: number) => {
        if (typeof frag.content === 'string' && hasToolCallMarker(frag.content, toolDescriptors)) {
          const record = collectToolCallRestoreRecord(
            frag.content,
            `${messageKey}:fragment:${fragIndex}`,
            toolDescriptors,
            metadata,
          );
          if (record) restoredRecords.push(record);
          frag.content = stripToolCalls(frag.content, { descriptors: toolDescriptors });
        }
      });
    }
  });
}

function hasToolCallMarker(text: string, toolDescriptors: readonly ToolDescriptor[]): boolean {
  const catalog = createToolInvocationCatalog(toolDescriptors);
  if (hasXmlToolMarker(text, catalog)) return true;
  return text.includes('｜DSML｜');
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function getMessageRestoreKey(msg: any, index: number): string {
  return String(msg?.id ?? msg?.message_id ?? msg?.uuid ?? msg?.parent_message_id ?? index);
}

function createMessageRestoreMetadata(
  msg: any,
  messageIndex: number,
  assistantMessageIndex: number | null,
): Record<string, unknown> {
  return {
    messageId: msg?.id ?? msg?.message_id ?? msg?.messageId ?? msg?.uuid ?? null,
    parentMessageId: msg?.parent_id ?? msg?.parent_message_id ?? msg?.parentMessageId ?? null,
    messageIndex,
    assistantMessageIndex,
    role: firstString(msg?.message_role, msg?.role, msg?.type),
  };
}

function storedMessageHasToolCallMarker(msg: any, toolDescriptors: readonly ToolDescriptor[]): boolean {
  if (typeof msg?.content === 'string' && hasToolCallMarker(msg.content, toolDescriptors)) return true;
  if (!Array.isArray(msg?.fragments)) return false;
  return msg.fragments.some((frag: any) => typeof frag?.content === 'string' && hasToolCallMarker(frag.content, toolDescriptors));
}

function isAssistantStoredMessage(msg: any): boolean {
  return firstString(msg?.message_role, msg?.role, msg?.type)?.toLowerCase() === 'assistant';
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function collectToolCallRestoreRecord(
  text: string,
  key: string,
  toolDescriptors: readonly ToolDescriptor[],
  metadata: Record<string, unknown>,
): ToolCallRestoreRecord | null {
  if (!hasToolCallMarker(text, toolDescriptors)) return null;

  const calls = extractToolCalls(text, { descriptors: toolDescriptors });
  if (calls.length === 0) return null;

  const content = stripToolCalls(text, { descriptors: toolDescriptors });
  const id = hashString(`${key}\n${content}\n${calls.map((call) => call.raw).join('\n')}`);
  return {
    id,
    calls,
    content,
    source: 'history',
    metadata,
  };
}

function sanitizeStoredMessageInternalPrompt(msg: any) {
  if (!msg || typeof msg !== 'object') return;

  if (typeof msg.content === 'string') {
    msg.content = sanitizeInternalPromptText(msg.content);
  }

  if (!Array.isArray(msg.fragments)) return;

  const textFragments = msg.fragments
    .filter((frag: any) => frag && typeof frag.content === 'string');

  if (textFragments.length === 0) return;

  const joined = textFragments.map((frag: any) => frag.content).join('');
  const sanitizedJoined = sanitizeInternalPromptText(joined);
  if (sanitizedJoined !== joined) {
    textFragments.forEach((frag: any, index: number) => {
      frag.content = index === 0 ? sanitizedJoined : '';
    });
    return;
  }

  for (const frag of textFragments) {
    frag.content = sanitizeInternalPromptText(frag.content);
  }
}

function isInternalManagedAgentMessage(msg: any): boolean {
  if (!msg || typeof msg !== 'object') return false;
  if (typeof msg.content === 'string' && isInternalManagedAgentContent(msg.content)) return true;
  if (!Array.isArray(msg.fragments)) return false;
  return msg.fragments.some((frag: any) => typeof frag?.content === 'string' && isInternalManagedAgentContent(frag.content));
}

function isRemovableInternalManagedAgentMessage(msg: any): boolean {
  return isInternalManagedAgentMessage(msg) && !isInlineAgentContinuationMessage(msg);
}

function isInlineAgentContinuationMessage(msg: any): boolean {
  if (!msg || typeof msg !== 'object') return false;
  if (typeof msg.content === 'string' && isInlineAgentContinuationPrompt(msg.content)) return true;
  if (!Array.isArray(msg.fragments)) return false;
  return msg.fragments.some((frag: any) => typeof frag?.content === 'string' && isInlineAgentContinuationPrompt(frag.content));
}

function sanitizeInlineAgentContinuationMessage(msg: any) {
  if (!isInlineAgentContinuationMessage(msg)) return;

  if (typeof msg.content === 'string' && isInlineAgentContinuationPrompt(msg.content)) {
    msg.content = '\u200b';
  }

  if (!Array.isArray(msg.fragments)) return;

  let replaced = false;
  for (const frag of msg.fragments) {
    if (!frag || typeof frag.content !== 'string' || !isInlineAgentContinuationPrompt(frag.content)) continue;
    frag.content = replaced ? '' : '\u200b';
    replaced = true;
  }
}

function isInternalManagedAgentContent(content: string): boolean {
  if (content.includes(DPP_MANAGED_AGENT_PROMPT_MARKER)) return true;
  if (content.includes('DeepSeek++ 托管 Agent Runner') && content.includes('<tool_results>')) return true;
  if (isInlineAgentContinuationPrompt(content)) return true;
  return content.includes('Tool call format reminder:') &&
    content.includes('Available tool tag names:') &&
    content.includes('<original_user_task>') &&
    content.includes('</original_user_task>');
}

function isInlineAgentContinuationPrompt(content: string): boolean {
  if (!content.includes('<original_task>') || !content.includes('</original_task>')) return false;
  if (!content.includes('<tool_results>') && !content.includes('<tool_results_so_far>')) return false;

  return content.includes('工具续跑任务') ||
    content.includes('工具结果') ||
    content.includes('Continue like a real agent') ||
    content.includes('tool results') ||
    content.includes('do not call any tools') ||
    content.includes('不要调用任何工具');
}

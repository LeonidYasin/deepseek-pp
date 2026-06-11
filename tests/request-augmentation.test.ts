import { describe, expect, it } from 'vitest';
import { DEFAULT_TOOL_DESCRIPTORS } from '../core/tool';
import { augmentRequestBody } from '../core/interceptor/request-augmentation';
import { buildPromptAugmentation } from '../core/prompt';

describe('augmentRequestBody', () => {
  it('applies expert mode and advances request message count without exposing state to main-world', () => {
    const result = augmentRequestBody(JSON.stringify({
      prompt: 'hello',
      parent_message_id: null,
      thinking_enabled: false,
    }), {
      memories: [],
      skills: [],
      activePreset: null,
      modelType: 'expert',
      toolDescriptors: DEFAULT_TOOL_DESCRIPTORS,
      messageCount: 0,
    });

    expect(result?.messageCount).toBe(1);
    expect(JSON.parse(result?.body ?? '{}').model_type).toBe('expert');
    expect(result?.usedMemoryIds).toEqual([]);
  });

  it('emits English prompt scaffolding while keeping XML tool tags stable', () => {
    const result = buildPromptAugmentation('search latest DeepSeek news', {
      memories: [],
      toolDescriptors: DEFAULT_TOOL_DESCRIPTORS,
      locale: 'en',
    });

    expect(result.augmented).toContain('## Role');
    expect(result.augmented).toContain('(No memories yet)');
    expect(result.augmented).toContain('## Web Search Rules');
    expect(result.augmented).toContain('Available tool tag names: memory_save');
    expect(result.augmented).toContain('<memory_save>');
    expect(result.augmented).toContain('</memory_save>');
    expect(result.augmented).toContain('Invalid formats: <invoke name="memory_save">...</invoke>, <tool_call>...</tool_call>');
    expect(result.augmented).not.toContain('## 角色');
  });

  it('uses locale-aware default tool descriptors when none are provided', () => {
    const result = buildPromptAugmentation('search latest DeepSeek news', {
      memories: [],
      locale: 'en',
    });

    expect(result.augmented).toContain('Title: Save memory');
    expect(result.augmented).toContain('Description: Save a new long-term memory');
    expect(result.augmented).toContain('Parameters JSON Schema: {"type":"object"');
    expect(result.augmented).not.toContain('Title: 保存记忆');
    expect(result.augmented).not.toContain('Description: 保存一条新的长期记忆');
  });

  it('keeps project context after base system scaffolding and before web-search guidance', () => {
    const result = buildPromptAugmentation('where is the Android entry point?', {
      memories: [],
      presetContent: 'You are a repo-aware assistant.',
      projectContext: '## Project Context\nProject: DeepSeek++\n--- android/MainActivity.kt:1-2 ---',
      locale: 'en',
    });

    const presetIndex = result.augmented.indexOf('You are a repo-aware assistant.');
    const roleIndex = result.augmented.indexOf('## Role');
    const projectIndex = result.augmented.indexOf('## Project Context');
    const webSearchIndex = result.augmented.indexOf('## Web Search Rules');
    const visibleUserIndex = result.augmented.indexOf('where is the Android entry point?');

    expect(presetIndex).toBeGreaterThanOrEqual(0);
    expect(roleIndex).toBeGreaterThan(presetIndex);
    expect(projectIndex).toBeGreaterThan(roleIndex);
    expect(webSearchIndex).toBeGreaterThan(projectIndex);
    expect(visibleUserIndex).toBeGreaterThan(webSearchIndex);
  });

  it('keeps Chinese prompt scaffolding available under zh-CN', () => {
    const result = buildPromptAugmentation('搜索 DeepSeek 新闻', {
      memories: [],
      toolDescriptors: DEFAULT_TOOL_DESCRIPTORS,
      locale: 'zh-CN',
    });

    expect(result.augmented).toContain('## 角色');
    expect(result.augmented).toContain('(暂无记忆)');
    expect(result.augmented).toContain('## 网络搜索规则');
    expect(result.augmented).toContain('可用工具标签名：memory_save');
    expect(result.augmented).toContain('<memory_save>');
    expect(result.augmented).not.toContain('## Role');
  });

  it('localizes skill user-input wrapper without mutating the user input', () => {
    const result = augmentRequestBody(JSON.stringify({
      prompt: '/writer Draft about {raw_user_value}',
      parent_message_id: null,
      thinking_enabled: false,
    }), {
      memories: [],
      skills: [{
        name: 'writer',
        instructions: 'Write clearly.',
        memoryEnabled: false,
      }],
      activePreset: null,
      modelType: null,
      toolDescriptors: [],
      messageCount: 0,
      locale: 'en',
    });

    const body = JSON.parse(result?.body ?? '{}') as { prompt?: string };
    expect(body.prompt).toContain('The following is the user input for this turn');
    expect(body.prompt).toContain('Draft about {raw_user_value}');
  });
});

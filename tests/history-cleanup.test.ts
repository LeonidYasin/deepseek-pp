import { describe, expect, it } from 'vitest';
import { stripToolCallsFromHistory } from '../core/interceptor/history-cleanup';
import { createDefaultToolDescriptors } from '../core/tool';

describe('history cleanup', () => {
  it('keeps inline-agent continuation prompt nodes but hides their internal prompt text', () => {
    const json = {
      data: {
        biz_data: {
          chat_messages: [
            {
              message_id: 1,
              message_role: 'user',
              content: '看一下深圳的房价',
            },
            {
              message_id: 2,
              message_role: 'assistant',
              parent_message_id: 1,
              content: '我帮你查一下深圳最近的房价情况。',
            },
            {
              message_id: 3,
              message_role: 'user',
              content: [
                '以下是工具续跑任务刚刚执行的工具结果。请像真正的 Agent 一样继续推进。',
                '',
                '<original_task>',
                '看一下深圳的房价',
                '</original_task>',
                '',
                '<tool_results>',
                '[]',
                '</tool_results>',
              ].join('\n'),
            },
            {
              message_id: 4,
              message_role: 'assistant',
              parent_message_id: 3,
              content: '根据最新市场数据，深圳房价如下。',
            },
          ],
        },
      },
    };

    stripToolCallsFromHistory(json, {
      toolDescriptors: createDefaultToolDescriptors(),
      onToolCallsRestored: () => undefined,
    });

    expect(json.data.biz_data.chat_messages.map((message: { message_id: number }) => message.message_id)).toEqual([1, 2, 3, 4]);
    expect(json.data.biz_data.chat_messages[2].content).toBe('\u200b');
    expect(json.data.biz_data.chat_messages[3].parent_message_id).toBe(3);
  });

  it('adds assistant message anchors to restored tool-call records', () => {
    const records: unknown[] = [];
    const json = {
      data: {
        biz_data: {
          chat_messages: [
            {
              message_id: 10,
              message_role: 'user',
              content: 'Save this',
            },
            {
              message_id: 11,
              message_role: 'assistant',
              parent_message_id: 10,
              content: [
                'Saved.',
                '<memory_save>',
                '{"type":"topic","name":"anchor","content":"ok","tags":[]}',
                '</memory_save>',
              ].join('\n'),
            },
          ],
        },
      },
    };

    stripToolCallsFromHistory(json, {
      toolDescriptors: createDefaultToolDescriptors(),
      onToolCallsRestored: (next) => records.push(...next),
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      metadata: {
        messageId: 11,
        parentMessageId: 10,
        assistantMessageIndex: 0,
        role: 'assistant',
      },
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createArtifactToolDescriptors,
  executeArtifactToolCall,
  getArtifact,
} from '../core/artifact';
import type { ToolCall } from '../core/tool/types';

let storage: Record<string, unknown>;

beforeEach(() => {
  storage = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
        set: vi.fn(async (values: Record<string, unknown>) => {
          storage = { ...storage, ...values };
        }),
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('artifact tool provider', () => {
  it('exposes single-file and bundle descriptors through stable tool names', () => {
    expect(createArtifactToolDescriptors().map((tool) => tool.name)).toEqual([
      'artifact_create',
      'artifact_bundle_create',
    ]);
  });

  it('creates a sanitized downloadable single-file artifact', async () => {
    const result = await executeArtifactToolCall(toolCall('artifact_create', {
      filename: '../reports/summary.md',
      content: '# Summary',
      mimeType: 'text/markdown',
    }), 'en');

    expect(result.ok).toBe(true);
    expect(result.summary).toBe('File ready');
    const output = result.output as { artifactId: string; filename: string; artifactKind: string };
    expect(output.filename).toBe('reports/summary.md');
    expect(output.artifactKind).toBe('file');

    const record = await getArtifact(output.artifactId);
    expect(record?.content).toBe('# Summary');
    expect(record?.mimeType).toBe('text/markdown');
  });

  it('creates a stored zip bundle for multi-file project output', async () => {
    const result = await executeArtifactToolCall(toolCall('artifact_bundle_create', {
      filename: 'demo',
      files: [
        { path: 'src/index.ts', content: 'export const ok = true;' },
        { path: '../README.md', content: '# Demo' },
      ],
    }));

    expect(result.ok).toBe(true);
    const output = result.output as { artifactId: string; filename: string; fileCount: number };
    expect(output.filename).toBe('demo.zip');
    expect(output.fileCount).toBe(2);

    const record = await getArtifact(output.artifactId);
    expect(record?.kind).toBe('bundle');
    expect(record?.content.slice(0, 4)).toBe('UEsD');
    expect(record?.files?.map((file) => file.path)).toEqual(['src/index.ts', 'README.md']);
  });

  it('fails visibly on malformed bundle payloads', async () => {
    const result = await executeArtifactToolCall(toolCall('artifact_bundle_create', {
      filename: 'empty.zip',
      files: [],
    }));

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('artifact_failed');
    expect(result.detail).toContain('files must be a non-empty array');
  });
});

function toolCall(name: string, payload: Record<string, unknown>): ToolCall {
  return {
    name,
    payload,
    raw: `<${name}>`,
  };
}

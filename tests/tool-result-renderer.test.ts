import { describe, expect, it, vi } from 'vitest';
import {
  registerDefaultToolResultRenderers,
  renderToolResultWithRegistry,
} from '../core/ui/tool-result-renderer';
import type { ToolCardResult } from '../core/types';

describe('tool result renderer registry', () => {
  it('renders artifact outputs without hardcoding artifact UI in content.ts', () => {
    registerDefaultToolResultRenderers();
    const target = document.createElement('div');
    const result: ToolCardResult = {
      ok: true,
      summary: 'File ready',
      output: {
        kind: 'artifact',
        artifactId: 'artifact-1',
        artifactKind: 'file',
        filename: 'report.md',
        mimeType: 'text/markdown',
        sizeBytes: 12,
      },
    };

    const rendered = renderToolResultWithRegistry({
      target,
      result,
      sendMessage: vi.fn(),
    });

    expect(rendered).toBe(true);
    expect(target.querySelector('.dpp-artifact-result')).not.toBeNull();
    expect(target.textContent).toContain('report.md');
    expect(target.textContent).toContain('Download');
  });
});

import { describe, expect, it } from 'vitest';
import {
  parseValidatedArray,
  validateImportedMemory,
  validatePreset,
  validateProjectContext,
  validateProjectContextState,
  validateProjectFile,
  validateStoredMemory,
} from '../core/sync/schema';

const validMemory = {
  syncId: 'sync-1',
  type: 'topic',
  name: 'Memory',
  content: 'Useful fact',
  description: 'Memory',
  tags: ['test'],
  pinned: false,
  createdAt: 1,
  updatedAt: 1,
  accessCount: 0,
  lastAccessedAt: 1,
};

describe('sync schema validators', () => {
  it('validates stored memories and imported memory payloads', () => {
    expect(validateStoredMemory(validMemory).syncId).toBe('sync-1');
    expect(validateImportedMemory(validMemory)).toEqual({
      syncId: 'sync-1',
      type: 'topic',
      name: 'Memory',
      content: 'Useful fact',
      description: 'Memory',
      tags: ['test'],
      pinned: false,
    });
  });

  it('rejects malformed array items with path context', () => {
    expect(() => parseValidatedArray('memories.json', JSON.stringify([validMemory, { ...validMemory, tags: [1] }]), validateStoredMemory))
      .toThrow('memories.json[1].tags');
  });

  it('rejects invalid presets before storage writes', () => {
    expect(() => validatePreset({ id: 'p1', name: 'Preset' }, 'presets[0]'))
      .toThrow('presets[0].content');
  });

  it('validates project context and project files at sync boundaries', () => {
    const project = validateProjectContext({
      id: 'project-1',
      name: 'DeepSeek++',
      description: '',
      instructions: 'Use repo context.',
      source: {
        kind: 'github',
        label: 'zhu1090093659/deepseek-pp',
        owner: 'zhu1090093659',
        repo: 'deepseek-pp',
        ref: 'main',
        importedAt: 1,
      },
      createdAt: 1,
      updatedAt: 2,
    }, 'projects[0]');
    const file = validateProjectFile({
      id: 'file-1',
      projectId: 'project-1',
      path: 'README.md',
      content: '# DeepSeek++',
      sizeBytes: 12,
      sourceKind: 'github',
      createdAt: 3,
    }, 'projectFiles[0]');

    expect(project.source.kind).toBe('github');
    expect(file.path).toBe('README.md');
    expect(() => validateProjectFile({ ...file, sourceKind: 'binary' }, 'projectFiles[1]'))
      .toThrow('projectFiles[1].sourceKind');
  });

  it('validates full project context sync state', () => {
    const state = validateProjectContextState({
      schemaVersion: 1,
      projects: [{
        id: 'project-1',
        name: 'DeepSeek++',
        description: '',
        instructions: 'Use repo context.',
        source: {
          kind: 'manual',
          label: 'Manual project',
          importedAt: 1,
        },
        createdAt: 1,
        updatedAt: 2,
      }],
      files: [{
        id: 'file-1',
        projectId: 'project-1',
        path: 'README.md',
        content: '# DeepSeek++',
        sizeBytes: 12,
        sourceKind: 'manual',
        createdAt: 3,
      }],
      activeProjectId: 'project-1',
      activeFileIds: ['file-1'],
    }, 'project-context.json');

    expect(state.activeProjectId).toBe('project-1');
    expect(state.activeFileIds).toEqual(['file-1']);
    expect(() => validateProjectContextState({ ...state, activeFileIds: ['missing'] }, 'project-context.json'))
      .toThrow('project-context.json.activeFileIds contains an unknown file');
  });
});

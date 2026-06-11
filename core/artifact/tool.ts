import { DEFAULT_LOCALE, translate, type SupportedLocale } from '../i18n';
import type { JsonValue, ToolCall, ToolDescriptor, ToolProviderIdentity, ToolResult } from '../tool/types';
import { saveArtifact } from './store';
import type { ArtifactFile, ArtifactOutput } from './types';
import { bytesToBase64, createStoredZip } from './zip';

export const ARTIFACT_TOOL_PROVIDER: ToolProviderIdentity = {
  kind: 'local',
  id: 'artifact',
  displayName: 'Artifacts',
  transport: 'in_process',
};

export const ARTIFACT_TOOL_NAMES = ['artifact_create', 'artifact_bundle_create'] as const;

export type ArtifactToolName = typeof ARTIFACT_TOOL_NAMES[number];

export function isArtifactToolName(name: string): name is ArtifactToolName {
  return (ARTIFACT_TOOL_NAMES as readonly string[]).includes(name);
}

export function createArtifactToolDescriptors(_locale: SupportedLocale = DEFAULT_LOCALE): ToolDescriptor[] {
  return [
    {
      id: 'local:artifact:artifact_create',
      provider: ARTIFACT_TOOL_PROVIDER,
      name: 'artifact_create',
      invocationName: 'artifact_create',
      title: translate(_locale, 'tool.artifact.createTitle'),
      description: translate(_locale, 'tool.artifact.createDescription'),
      inputSchema: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: translate(_locale, 'tool.artifact.filenameDescription') },
          content: { type: 'string', description: translate(_locale, 'tool.artifact.contentDescription') },
          mimeType: { type: 'string', description: translate(_locale, 'tool.artifact.mimeTypeDescription') },
        },
        required: ['filename', 'content'],
        additionalProperties: false,
      },
      execution: { mode: 'auto', enabled: true, risk: 'low', maxResultBytes: 4096 },
    },
    {
      id: 'local:artifact:artifact_bundle_create',
      provider: ARTIFACT_TOOL_PROVIDER,
      name: 'artifact_bundle_create',
      invocationName: 'artifact_bundle_create',
      title: translate(_locale, 'tool.artifact.bundleTitle'),
      description: translate(_locale, 'tool.artifact.bundleDescription'),
      inputSchema: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: translate(_locale, 'tool.artifact.bundleFilenameDescription') },
          files: {
            type: 'array',
            description: translate(_locale, 'tool.artifact.filesDescription'),
          },
        },
        required: ['filename', 'files'],
        additionalProperties: false,
      },
      execution: { mode: 'auto', enabled: true, risk: 'medium', maxResultBytes: 4096 },
    },
  ];
}

export async function executeArtifactToolCall(
  call: ToolCall,
  locale: SupportedLocale = DEFAULT_LOCALE,
): Promise<ToolResult> {
  try {
    if (call.name === 'artifact_create') return await createSingleFile(call, locale);
    if (call.name === 'artifact_bundle_create') return await createBundle(call, locale);
  } catch (error) {
    return {
      ok: false,
      name: call.name,
      provider: call.provider ?? ARTIFACT_TOOL_PROVIDER,
      summary: translate(locale, 'tool.artifact.failed'),
      detail: error instanceof Error ? error.message : String(error),
      error: {
        code: 'artifact_failed',
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
      },
    };
  }

  return {
    ok: false,
    name: call.name,
    provider: call.provider ?? ARTIFACT_TOOL_PROVIDER,
    summary: translate(locale, 'tool.runtime.unknownTool'),
    error: {
      code: 'artifact_tool_unsupported',
      message: `Unsupported artifact tool: ${call.name}`,
      retryable: false,
    },
  };
}

async function createSingleFile(call: ToolCall, locale: SupportedLocale): Promise<ToolResult> {
  const filename = safeFilename(call.payload.filename, 'artifact.txt');
  const content = requiredString(call.payload.content, 'content');
  const mimeType = optionalString(call.payload.mimeType) || inferMimeType(filename);
  const record = await saveArtifact({ kind: 'file', filename, mimeType, content });
  const output: ArtifactOutput = {
    kind: 'artifact',
    artifactId: record.id,
    artifactKind: 'file',
    filename,
    mimeType,
    sizeBytes: record.sizeBytes,
  };
  return {
    ok: true,
    name: call.name,
    provider: call.provider ?? ARTIFACT_TOOL_PROVIDER,
    summary: translate(locale, 'tool.artifact.fileReady'),
    detail: `${filename} (${record.sizeBytes} bytes)`,
    output: output as unknown as JsonValue,
  };
}

async function createBundle(call: ToolCall, locale: SupportedLocale): Promise<ToolResult> {
  const filename = ensureZipFilename(safeFilename(call.payload.filename, 'project.zip'));
  const files = normalizeArtifactFiles(call.payload.files);
  const zipBytes = createStoredZip(files);
  const content = bytesToBase64(zipBytes);
  const record = await saveArtifact({
    kind: 'bundle',
    filename,
    mimeType: 'application/zip',
    content,
    files,
  });
  const output: ArtifactOutput = {
    kind: 'artifact',
    artifactId: record.id,
    artifactKind: 'bundle',
    filename,
    mimeType: 'application/zip',
    sizeBytes: zipBytes.length,
    fileCount: files.length,
  };
  return {
    ok: true,
    name: call.name,
    provider: call.provider ?? ARTIFACT_TOOL_PROVIDER,
    summary: translate(locale, 'tool.artifact.bundleReady'),
    detail: `${filename} (${files.length} files, ${zipBytes.length} bytes)`,
    output: output as unknown as JsonValue,
  };
}

function normalizeArtifactFiles(value: unknown): ArtifactFile[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('files must be a non-empty array');
  }
  return value.slice(0, 100).map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`files[${index}] must be an object`);
    const file = item as Record<string, unknown>;
    return {
      path: safeFilename(file.path, `file-${index + 1}.txt`),
      content: requiredString(file.content, `files[${index}].content`),
      mimeType: optionalString(file.mimeType),
    };
  });
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function safeFilename(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '').split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
  if (!normalized) return fallback;
  return normalized.slice(0, 180);
}

function ensureZipFilename(filename: string): string {
  return filename.toLowerCase().endsWith('.zip') ? filename : `${filename}.zip`;
}

function inferMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.html')) return 'text/html';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.css')) return 'text/css';
  if (lower.endsWith('.js') || lower.endsWith('.ts')) return 'text/plain';
  return 'text/plain';
}

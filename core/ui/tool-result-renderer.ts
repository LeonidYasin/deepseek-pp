import type { ToolCardResult } from '../types';
import type { ArtifactOutput } from '../artifact';

export type ToolResultRenderer = (input: {
  target: HTMLElement;
  result: ToolCardResult;
  sendMessage: <T = unknown>(message: unknown) => Promise<T | undefined>;
}) => boolean;

const renderers: ToolResultRenderer[] = [];

export function registerToolResultRenderer(renderer: ToolResultRenderer): void {
  if (!renderers.includes(renderer)) renderers.push(renderer);
}

export function renderToolResultWithRegistry(input: {
  target: HTMLElement;
  result: ToolCardResult;
  sendMessage: <T = unknown>(message: unknown) => Promise<T | undefined>;
}): boolean {
  for (const renderer of renderers) {
    if (renderer(input)) return true;
  }
  return false;
}

export function registerDefaultToolResultRenderers(): void {
  registerToolResultRenderer(renderArtifactResult);
}

function renderArtifactResult(input: {
  target: HTMLElement;
  result: ToolCardResult;
  sendMessage: <T = unknown>(message: unknown) => Promise<T | undefined>;
}): boolean {
  const artifact = getArtifactOutput(input.result.output);
  if (!artifact) return false;

  const wrapper = document.createElement('div');
  wrapper.className = 'dpp-artifact-result';
  const meta = document.createElement('div');
  meta.className = 'dpp-artifact-meta';
  meta.textContent = `${artifact.filename} · ${formatBytes(artifact.sizeBytes)}${artifact.fileCount ? ` · ${artifact.fileCount} files` : ''}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dpp-artifact-download';
  button.textContent = 'Download';
  button.addEventListener('click', () => {
    void downloadArtifact(artifact, input.sendMessage, button);
  });
  wrapper.append(meta, button);
  input.target.appendChild(wrapper);
  ensureArtifactStyles();
  return true;
}

async function downloadArtifact(
  artifact: ArtifactOutput,
  sendMessage: <T = unknown>(message: unknown) => Promise<T | undefined>,
  button: HTMLButtonElement,
): Promise<void> {
  button.disabled = true;
  const previous = button.textContent;
  button.textContent = 'Downloading...';
  try {
    const record = await sendMessage<{ ok?: boolean; artifact?: { filename: string; mimeType: string; content: string; kind: string } }>({
      type: 'GET_ARTIFACT',
      payload: { id: artifact.artifactId },
    });
    if (!record?.artifact) throw new Error('Artifact not found');
    const content = record.artifact.kind === 'bundle'
      ? base64ToBlob(record.artifact.content, record.artifact.mimeType)
      : new Blob([record.artifact.content], { type: record.artifact.mimeType });
    const url = URL.createObjectURL(content);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = record.artifact.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    button.textContent = 'Downloaded';
  } catch (error) {
    button.textContent = error instanceof Error ? error.message : 'Download failed';
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = previous;
    }, 2000);
  }
}

function getArtifactOutput(value: unknown): ArtifactOutput | null {
  if (!value || typeof value !== 'object') return null;
  const output = value as ArtifactOutput;
  if (output.kind !== 'artifact') return null;
  if (typeof output.artifactId !== 'string' || typeof output.filename !== 'string') return null;
  if (typeof output.mimeType !== 'string' || typeof output.sizeBytes !== 'number') return null;
  return output;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ensureArtifactStyles(): void {
  if (document.getElementById('dpp-artifact-result-css')) return;
  const style = document.createElement('style');
  style.id = 'dpp-artifact-result-css';
  style.textContent = `
.dpp-artifact-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(77, 107, 254, 0.18);
  border-radius: 8px;
  background: rgba(77, 107, 254, 0.06);
}
.dpp-artifact-meta {
  min-width: 0;
  font-size: 12px;
  color: #1D1D1F;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dpp-artifact-download {
  border: 0;
  border-radius: 7px;
  background: #4D6BFE;
  color: white;
  font-size: 11px;
  font-weight: 600;
  padding: 5px 9px;
  cursor: pointer;
}
.dpp-artifact-download:disabled {
  opacity: 0.65;
  cursor: default;
}
body.dpp-theme-dark .dpp-artifact-meta { color: #F5F5F5; }
`;
  document.head.appendChild(style);
}

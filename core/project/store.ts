import type {
  ProjectContext,
  ProjectContextCreateInput,
  ProjectContextState,
  ProjectFile,
  ProjectFileInput,
  ProjectPromptContext,
  ProjectSource,
} from './types';
import { PROJECT_CONTEXT_SCHEMA_VERSION } from './types';
import { normalizeProjectFiles } from './sources';
import { searchProjectFiles } from './rag';
import { estimateTokens } from '../memory/selector';

const STORAGE_KEY = 'deepseek_pp_project_context';

const DEFAULT_STATE: ProjectContextState = {
  schemaVersion: PROJECT_CONTEXT_SCHEMA_VERSION,
  projects: [],
  files: [],
  activeProjectId: null,
  activeFileIds: [],
};

export async function getProjectContextState(): Promise<ProjectContextState> {
  const data = await chrome.storage.local.get(STORAGE_KEY) as Record<string, unknown>;
  return normalizeProjectContextState(data[STORAGE_KEY]);
}

export async function saveProjectContextState(state: ProjectContextState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalizeProjectContextState(state) });
}

export async function createProjectContext(input: ProjectContextCreateInput): Promise<ProjectContext> {
  const now = Date.now();
  const state = await getProjectContextState();
  const project: ProjectContext = {
    id: crypto.randomUUID(),
    name: requiredTrimmed(input.name, 'Project name'),
    description: String(input.description ?? '').trim(),
    instructions: String(input.instructions ?? '').trim(),
    source: normalizeSource(input.source, now),
    createdAt: now,
    updatedAt: now,
  };
  await saveProjectContextState({
    ...state,
    projects: [...state.projects, project],
    activeProjectId: state.activeProjectId ?? project.id,
  });
  return project;
}

export async function deleteProjectContext(projectId: string): Promise<void> {
  const state = await getProjectContextState();
  const nextFiles = state.files.filter((file) => file.projectId !== projectId);
  await saveProjectContextState({
    ...state,
    projects: state.projects.filter((project) => project.id !== projectId),
    files: nextFiles,
    activeProjectId: state.activeProjectId === projectId ? null : state.activeProjectId,
    activeFileIds: state.activeFileIds.filter((id) => nextFiles.some((file) => file.id === id)),
  });
}

export async function setActiveProjectContext(projectId: string | null): Promise<void> {
  const state = await getProjectContextState();
  const exists = projectId === null || state.projects.some((project) => project.id === projectId);
  if (!exists) throw new Error(`Project not found: ${projectId}`);
  await saveProjectContextState({
    ...state,
    activeProjectId: projectId,
    activeFileIds: [],
  });
}

export async function addProjectFiles(
  projectId: string,
  inputFiles: readonly ProjectFileInput[],
): Promise<ProjectFile[]> {
  const state = await getProjectContextState();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const now = Date.now();
  const files = normalizeProjectFiles(inputFiles, inputFiles[0]?.sourceKind ?? 'manual').map((file): ProjectFile => ({
    id: crypto.randomUUID(),
    projectId,
    path: file.path,
    content: file.content,
    sizeBytes: new TextEncoder().encode(file.content).length,
    sourceKind: file.sourceKind ?? 'manual',
    createdAt: now,
  }));
  await saveProjectContextState({
    ...state,
    files: [...state.files.filter((file) => file.projectId !== projectId || !files.some((incoming) => incoming.path === file.path)), ...files],
    projects: state.projects.map((item) => item.id === projectId ? { ...item, updatedAt: now } : item),
    activeFileIds: [...new Set([...state.activeFileIds, ...files.map((file) => file.id)])],
  });
  return files;
}

export async function setActiveProjectFiles(projectId: string, fileIds: string[]): Promise<void> {
  const state = await getProjectContextState();
  const validIds = new Set(state.files.filter((file) => file.projectId === projectId).map((file) => file.id));
  await saveProjectContextState({
    ...state,
    activeProjectId: projectId,
    activeFileIds: fileIds.filter((id) => validIds.has(id)),
  });
}

export async function getActiveProjectPromptContext(query: string): Promise<ProjectPromptContext | null> {
  const state = await getProjectContextState();
  const project = state.projects.find((item) => item.id === state.activeProjectId);
  if (!project) return null;
  const activeFiles = state.files.filter((file) =>
    file.projectId === project.id &&
    (state.activeFileIds.length === 0 || state.activeFileIds.includes(file.id)),
  );
  const chunks = searchProjectFiles(query, activeFiles, 6);
  const instructions = project.instructions.trim();
  if (!instructions && chunks.length === 0) return null;
  const totalTokensEstimate = estimateTokens([
    instructions,
    ...chunks.map((chunk) => chunk.content),
  ].join('\n'));
  return {
    projectId: project.id,
    projectName: project.name,
    instructions,
    chunks,
    totalTokensEstimate,
  };
}

export function normalizeProjectContextState(value: unknown): ProjectContextState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_STATE };
  const object = value as Partial<ProjectContextState>;
  const projects = Array.isArray(object.projects) ? object.projects.filter(isProjectContext) : [];
  const files = Array.isArray(object.files) ? object.files.filter(isProjectFile) : [];
  const projectIds = new Set(projects.map((project) => project.id));
  const fileIds = new Set(files.map((file) => file.id));
  const activeProjectId = typeof object.activeProjectId === 'string' && projectIds.has(object.activeProjectId)
    ? object.activeProjectId
    : null;
  return {
    schemaVersion: PROJECT_CONTEXT_SCHEMA_VERSION,
    projects,
    files: files.filter((file) => projectIds.has(file.projectId)),
    activeProjectId,
    activeFileIds: Array.isArray(object.activeFileIds)
      ? object.activeFileIds.filter((id): id is string => typeof id === 'string' && fileIds.has(id))
      : [],
  };
}

function normalizeSource(source: Partial<ProjectSource> | undefined, now: number): ProjectSource {
  return {
    kind: source?.kind ?? 'manual',
    label: String(source?.label ?? 'Manual project').trim() || 'Manual project',
    url: source?.url,
    owner: source?.owner,
    repo: source?.repo,
    ref: source?.ref,
    importedAt: typeof source?.importedAt === 'number' ? source.importedAt : now,
  };
}

function requiredTrimmed(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function isProjectContext(value: unknown): value is ProjectContext {
  if (!value || typeof value !== 'object') return false;
  const item = value as ProjectContext;
  return typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.description === 'string' &&
    typeof item.instructions === 'string' &&
    Boolean(item.source && typeof item.source === 'object') &&
    typeof item.createdAt === 'number' &&
    typeof item.updatedAt === 'number';
}

function isProjectFile(value: unknown): value is ProjectFile {
  if (!value || typeof value !== 'object') return false;
  const item = value as ProjectFile;
  return typeof item.id === 'string' &&
    typeof item.projectId === 'string' &&
    typeof item.path === 'string' &&
    typeof item.content === 'string' &&
    typeof item.sizeBytes === 'number' &&
    typeof item.sourceKind === 'string' &&
    typeof item.createdAt === 'number';
}

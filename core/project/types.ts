export const PROJECT_CONTEXT_SCHEMA_VERSION = 1 as const;

export type ProjectSourceKind = 'manual' | 'local_folder' | 'github' | 'web_page';

export interface ProjectSource {
  kind: ProjectSourceKind;
  label: string;
  url?: string;
  owner?: string;
  repo?: string;
  ref?: string;
  importedAt: number;
}

export interface ProjectContext {
  id: string;
  name: string;
  description: string;
  instructions: string;
  source: ProjectSource;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  path: string;
  content: string;
  sizeBytes: number;
  sourceKind: ProjectSourceKind;
  createdAt: number;
}

export interface ProjectContextState {
  schemaVersion: typeof PROJECT_CONTEXT_SCHEMA_VERSION;
  projects: ProjectContext[];
  files: ProjectFile[];
  activeProjectId: string | null;
  activeFileIds: string[];
}

export interface ProjectFileInput {
  path: string;
  content: string;
  sourceKind?: ProjectSourceKind;
}

export interface ProjectContextCreateInput {
  name: string;
  description?: string;
  instructions?: string;
  source?: Partial<ProjectSource>;
}

export interface ProjectPromptContext {
  projectId: string;
  projectName: string;
  instructions: string;
  chunks: ProjectRagChunk[];
  totalTokensEstimate: number;
}

export interface ProjectRagChunk {
  fileId?: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  score: number;
}

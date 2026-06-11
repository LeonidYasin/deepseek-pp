export const ARTIFACT_SCHEMA_VERSION = 1 as const;

export type ArtifactKind = 'file' | 'bundle';

export interface ArtifactFile {
  path: string;
  content: string;
  mimeType?: string;
}

export interface ArtifactRecord {
  id: string;
  kind: ArtifactKind;
  filename: string;
  mimeType: string;
  content: string;
  sizeBytes: number;
  createdAt: number;
  files?: ArtifactFile[];
}

export interface ArtifactOutput {
  kind: 'artifact';
  artifactId: string;
  artifactKind: ArtifactKind;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  fileCount?: number;
}

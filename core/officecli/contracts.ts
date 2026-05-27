import type { JsonValue, ToolRiskLevel } from '../tool/types';

export const OFFICECLI_MCP_SERVER_NAME = 'OfficeCLI Local';
export const OFFICECLI_MCP_ENDPOINT = 'http://127.0.0.1:26316/mcp';

export const OFFICECLI_ALLOWED_DOCUMENT_EXTENSIONS = ['.docx', '.xlsx', '.pptx'] as const;

export const OFFICECLI_READ_TOOL_NAMES = [
  'officecli_status',
  'officecli_inspect',
  'officecli_issues',
  'officecli_validate',
  'officecli_export_preview',
] as const;

export const OFFICECLI_WRITE_TOOL_NAMES = [
  'officecli_create_document',
  'officecli_apply_edit_plan',
] as const;

export const OFFICECLI_TOOL_NAMES = [
  ...OFFICECLI_READ_TOOL_NAMES,
  ...OFFICECLI_WRITE_TOOL_NAMES,
] as const;

export type OfficeCliDocumentExtension = typeof OFFICECLI_ALLOWED_DOCUMENT_EXTENSIONS[number];
export type OfficeCliReadToolName = typeof OFFICECLI_READ_TOOL_NAMES[number];
export type OfficeCliWriteToolName = typeof OFFICECLI_WRITE_TOOL_NAMES[number];
export type OfficeCliToolName = typeof OFFICECLI_TOOL_NAMES[number];
export type OfficeCliOperationKind = 'read' | 'write';

export interface OfficeCliArtifactRef {
  path: string;
  mimeType: string;
  kind: 'html' | 'screenshot' | 'json' | 'office-document';
  bytes?: number;
}

export interface OfficeCliStructuredError {
  code:
    | 'officecli_binary_missing'
    | 'officecli_command_failed'
    | 'officecli_file_exists'
    | 'officecli_file_locked'
    | 'officecli_output_invalid'
    | 'officecli_output_too_large'
    | 'officecli_path_denied'
    | 'officecli_extension_denied'
    | 'officecli_write_disabled'
    | 'officecli_timeout'
    | 'officecli_payload_invalid';
  message: string;
  retryable: boolean;
  details?: Record<string, JsonValue>;
}

export interface OfficeCliToolSpec {
  name: OfficeCliToolName;
  title: string;
  description: string;
  operation: OfficeCliOperationKind;
  risk: ToolRiskLevel;
  defaultAutoEnabled: boolean;
}

export const OFFICECLI_TOOL_SPECS: readonly OfficeCliToolSpec[] = [
  {
    name: 'officecli_status',
    title: 'OfficeCLI Status',
    description: 'Report OfficeCLI provider health, configured roots, relative path base, binary path, write status, and path guidance.',
    operation: 'read',
    risk: 'low',
    defaultAutoEnabled: true,
  },
  {
    name: 'officecli_inspect',
    title: 'OfficeCLI Inspect',
    description: 'Read document outline, stats, text, annotated text, or form summary from an allowed Office file.',
    operation: 'read',
    risk: 'low',
    defaultAutoEnabled: true,
  },
  {
    name: 'officecli_issues',
    title: 'OfficeCLI Issues',
    description: 'Detect formatting, content, or structure issues in an allowed Office file.',
    operation: 'read',
    risk: 'low',
    defaultAutoEnabled: true,
  },
  {
    name: 'officecli_validate',
    title: 'OfficeCLI Validate',
    description: 'Validate an allowed Office file against the OpenXML schema.',
    operation: 'read',
    risk: 'low',
    defaultAutoEnabled: true,
  },
  {
    name: 'officecli_create_document',
    title: 'OfficeCLI Create Document',
    description: 'Create a .docx, .xlsx, or .pptx file under an allowed root. If this tool is listed, call it directly; the provider returns a structured error if writes are disabled.',
    operation: 'write',
    risk: 'high',
    defaultAutoEnabled: false,
  },
  {
    name: 'officecli_apply_edit_plan',
    title: 'OfficeCLI Apply Edit Plan',
    description: 'Apply a bounded OfficeCLI batch edit plan to an allowed Office file. If this tool is listed, call it directly; the provider returns a structured error if writes are disabled.',
    operation: 'write',
    risk: 'high',
    defaultAutoEnabled: false,
  },
  {
    name: 'officecli_export_preview',
    title: 'OfficeCLI Export Preview',
    description: 'Export or render a preview for an allowed Office file with capped output and artifact references.',
    operation: 'read',
    risk: 'medium',
    defaultAutoEnabled: true,
  },
] as const;

export function isOfficeCliWriteTool(name: string): name is OfficeCliWriteToolName {
  return (OFFICECLI_WRITE_TOOL_NAMES as readonly string[]).includes(name);
}

export {
  OFFICECLI_ALLOWED_DOCUMENT_EXTENSIONS,
  OFFICECLI_MCP_ENDPOINT,
  OFFICECLI_MCP_SERVER_NAME,
  OFFICECLI_READ_TOOL_NAMES,
  OFFICECLI_TOOL_NAMES,
  OFFICECLI_TOOL_SPECS,
  OFFICECLI_WRITE_TOOL_NAMES,
  isOfficeCliWriteTool,
} from './contracts';

export type {
  OfficeCliArtifactRef,
  OfficeCliDocumentExtension,
  OfficeCliOperationKind,
  OfficeCliReadToolName,
  OfficeCliStructuredError,
  OfficeCliToolName,
  OfficeCliToolSpec,
  OfficeCliWriteToolName,
} from './contracts';

export {
  createOfficeCliMcpPresetInput,
} from './policy';

export type {
  OfficeCliMcpPresetOptions,
} from './policy';

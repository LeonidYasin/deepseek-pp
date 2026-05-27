#!/usr/bin/env node
import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const MCP_PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 26316;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64_000;
const OFFICE_EXTENSIONS = new Set(['.docx', '.xlsx', '.pptx']);
const PREVIEW_EXTENSIONS = new Set(['.html', '.svg', '.png', '.jpg', '.jpeg', '.webp']);
const READ_TOOL_NAMES = [
  'officecli_status',
  'officecli_inspect',
  'officecli_issues',
  'officecli_validate',
  'officecli_export_preview',
];
const WRITE_TOOL_NAMES = ['officecli_create_document', 'officecli_apply_edit_plan'];
const BATCH_COMMAND_NAMES = ['get', 'query', 'set', 'add', 'remove', 'move', 'view', 'raw', 'validate'];
const BATCH_COMMAND_ALIASES = ['op', 'action', 'verb', 'operation'];

const BASE_TOOL_DEFINITIONS = [
  {
    name: 'officecli_status',
    title: 'OfficeCLI Status',
    description: 'Report OfficeCLI provider health, configured roots, relative path base, binary path, write status, and path guidance. Call this first when the user did not provide an absolute Office file path.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    outputSchema: officeCliOutputSchema(),
    annotations: {
      operation: 'read',
      risk: 'low',
      defaultAutoEnabled: true,
    },
  },
  {
    name: 'officecli_inspect',
    title: 'OfficeCLI Inspect',
    description: 'Read document outline, stats, text, annotated text, or form summary from an allowed Office file.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to a .docx, .xlsx, or .pptx file under an allowed root.' },
        mode: { type: 'string', enum: ['outline', 'stats', 'text', 'annotated', 'forms'], default: 'outline' },
        start: { type: 'integer', minimum: 1 },
        end: { type: 'integer', minimum: 1 },
        maxLines: { type: 'integer', minimum: 1, maximum: 500 },
      },
      required: ['file'],
      additionalProperties: false,
    },
    outputSchema: officeCliOutputSchema(),
    annotations: {
      operation: 'read',
      risk: 'low',
      defaultAutoEnabled: true,
    },
  },
  {
    name: 'officecli_issues',
    title: 'OfficeCLI Issues',
    description: 'Detect formatting, content, or structure issues in an allowed Office file.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to a .docx, .xlsx, or .pptx file under an allowed root.' },
        type: {
          type: 'string',
          description: 'Optional issue filter: format, content, structure, f, c, s, or a specific subtype.',
        },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
      required: ['file'],
      additionalProperties: false,
    },
    outputSchema: officeCliOutputSchema(),
    annotations: {
      operation: 'read',
      risk: 'low',
      defaultAutoEnabled: true,
    },
  },
  {
    name: 'officecli_validate',
    title: 'OfficeCLI Validate',
    description: 'Validate an allowed Office file against the OpenXML schema.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to a .docx, .xlsx, or .pptx file under an allowed root.' },
      },
      required: ['file'],
      additionalProperties: false,
    },
    outputSchema: officeCliOutputSchema(),
    annotations: {
      operation: 'read',
      risk: 'low',
      defaultAutoEnabled: true,
    },
  },
  {
    name: 'officecli_create_document',
    title: 'OfficeCLI Create Document',
    description: 'Create a .docx, .xlsx, or .pptx file under an allowed root. If this tool is listed, call it directly; the provider returns a structured error if writes are disabled.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Concrete output path under an allowed root, including .docx, .xlsx, or .pptx. Do not pass a directory or placeholder path.',
        },
        type: { type: 'string', enum: ['docx', 'xlsx', 'pptx'], description: 'Optional document type; inferred from file extension when omitted.' },
        overwrite: { type: 'boolean', default: false },
        locale: { type: 'string', description: 'Optional locale for .docx creation, such as zh-CN.' },
      },
      required: ['file'],
      additionalProperties: false,
    },
    outputSchema: officeCliOutputSchema(),
    annotations: {
      operation: 'write',
      risk: 'high',
      defaultAutoEnabled: false,
    },
  },
  {
    name: 'officecli_apply_edit_plan',
    title: 'OfficeCLI Apply Edit Plan',
    description: 'Apply a bounded OfficeCLI batch edit plan. If this tool is listed, call it directly; the provider returns a structured error if writes are disabled.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Concrete .docx, .xlsx, or .pptx file path under an allowed root. Do not pass a directory or placeholder path.' },
        operationId: { type: 'string', description: 'Caller-supplied idempotency marker for the edit plan.' },
        commands: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: officeCliBatchCommandSchema(),
          description: 'OfficeCLI batch command objects. Canonical shape: {"command":"add","path":"/body","type":"paragraph","props":{"text":"..."}} or {"command":"set","path":"/body/p[1]","props":{"text":"..."}}. Do not replace command with type; type is the element kind for add commands. Raw shell commands are not accepted.',
        },
        stopOnError: { type: 'boolean', default: true },
      },
      required: ['file', 'commands'],
      additionalProperties: false,
    },
    outputSchema: officeCliOutputSchema(),
    annotations: {
      operation: 'write',
      risk: 'high',
      defaultAutoEnabled: false,
    },
  },
  {
    name: 'officecli_export_preview',
    title: 'OfficeCLI Export Preview',
    description: 'Render an HTML, SVG, or screenshot preview with capped output and optional artifact path.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to a .docx, .xlsx, or .pptx file under an allowed root.' },
        format: { type: 'string', enum: ['html', 'svg', 'screenshot'], default: 'html' },
        out: { type: 'string', description: 'Optional artifact path under an allowed root.' },
        page: { type: 'string', description: 'Optional OfficeCLI page filter, for example 1, 1-3, or 1,3,5.' },
        start: { type: 'integer', minimum: 1 },
        end: { type: 'integer', minimum: 1 },
      },
      required: ['file'],
      additionalProperties: false,
    },
    outputSchema: officeCliOutputSchema(),
    annotations: {
      operation: 'read',
      risk: 'medium',
      defaultAutoEnabled: true,
    },
  },
];

export function startOfficeCliMcpServer(input = {}) {
  const config = normalizeConfig(input);
  const server = http.createServer((request, response) => {
    void handleRequest(config, request, response);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : config.port;
      resolve({
        server,
        config: { ...config, port },
        url: `http://${config.host}:${port}/mcp`,
      });
    });
  });
}

function officeCliOutputSchema() {
  return {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      command: { type: 'array', items: { type: 'string' } },
      data: {},
      artifact: { type: 'object' },
      error: { type: 'object' },
    },
    additionalProperties: true,
  };
}

function officeCliBatchCommandSchema() {
  return {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        enum: BATCH_COMMAND_NAMES,
        description: 'Required canonical OfficeCLI batch verb. Valid values: get, query, set, add, remove, move, view, raw, validate.',
      },
      path: {
        type: 'string',
        description: 'OfficeCLI document path or parent path, such as /body, /body/p[1], /slide[1], or /Sheet1/A1.',
      },
      props: {
        type: 'object',
        additionalProperties: true,
        description: 'Properties to add or set, for example {"text":"Hello"} or {"value":"hello"}.',
      },
      type: {
        type: 'string',
        description: 'Element kind for add commands, such as paragraph, run, slide, shape, textbox, table, row, col, or cell. This is not the batch verb.',
      },
      selector: { type: 'string', description: 'Selector for query commands.' },
      part: { type: 'string', description: 'Raw Office part for raw commands.' },
      to: { type: 'string', description: 'Destination path for move commands.' },
      position: { type: 'string', description: 'Optional insertion or move position.' },
      parent: {
        type: 'string',
        description: 'Accepted shorthand for path on add commands. The provider normalizes this to path and reports that normalization in the result.',
      },
      element: {
        type: 'string',
        description: 'Accepted shorthand for type on add commands. The provider normalizes this to type and reports that normalization in the result.',
      },
      op: {
        type: 'string',
        enum: BATCH_COMMAND_NAMES,
        description: 'Accepted shorthand for command. Prefer command.',
      },
      action: {
        type: 'string',
        enum: BATCH_COMMAND_NAMES,
        description: 'Accepted shorthand for command. Prefer command.',
      },
      verb: {
        type: 'string',
        enum: BATCH_COMMAND_NAMES,
        description: 'Accepted shorthand for command. Prefer command.',
      },
      operation: {
        type: 'string',
        enum: BATCH_COMMAND_NAMES,
        description: 'Accepted shorthand for command. Prefer command.',
      },
    },
    required: ['command'],
    additionalProperties: true,
  };
}

async function handleRequest(config, request, response) {
  if (request.method === 'OPTIONS') {
    sendCorsPreflight(response);
    return;
  }

  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, createHealth(config));
    return;
  }

  if (request.method !== 'POST' || request.url !== '/mcp') {
    sendJson(response, 404, { error: 'not_found' });
    return;
  }

  let message;
  try {
    message = JSON.parse(await readBody(request, config.maxOutputBytes));
  } catch (error) {
    sendJson(response, 400, jsonRpcError(null, -32700, getErrorMessage(error)));
    return;
  }

  if (!isJsonRpcRequest(message)) {
    sendJson(response, 400, jsonRpcError(null, -32600, 'Invalid JSON-RPC request.'));
    return;
  }

  if (!('id' in message)) {
    await handleNotification(response);
    return;
  }

  try {
    const result = await handleJsonRpc(config, message);
    sendJson(response, 200, {
      jsonrpc: '2.0',
      id: message.id,
      result,
    });
  } catch (error) {
    const detail = normalizeError(error);
    sendJson(response, 200, {
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: detail.jsonRpcCode,
        message: detail.message,
        data: detail.data,
      },
    });
  }
}

async function handleNotification(response) {
  response.writeHead(204);
  response.end();
}

async function handleJsonRpc(config, message) {
  if (message.method === 'initialize') {
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: {
        name: 'deepseek-pp-officecli',
        version: '1.0.0',
      },
      instructions: createProviderInstructions(config),
    };
  }

  if (message.method === 'tools/list') {
    return { tools: createToolDefinitions(config) };
  }

  if (message.method === 'tools/call') {
    const params = objectValue(message.params);
    const name = stringValue(params.name);
    const args = objectValue(params.arguments);
    return callTool(config, name, args);
  }

  throw new RpcError(-32601, `Unsupported method: ${message.method}`);
}

async function callTool(config, name, args) {
  if (!createToolDefinitions(config).some((tool) => tool.name === name)) {
    throw new RpcError(-32602, `Unsupported OfficeCLI tool: ${name}`, {
      code: 'officecli_payload_invalid',
      retryable: false,
    });
  }

  if (WRITE_TOOL_NAMES.includes(name) && !config.writeEnabled) {
    return toolError('officecli_write_disabled', 'OfficeCLI write tools are disabled for this provider.', false, {
      hint: 'Restart scripts/officecli-mcp-server.mjs with --write enabled or OFFICECLI_WRITE_ENABLED=1.',
    });
  }

  if (name === 'officecli_status') return providerStatus(config);
  if (name === 'officecli_inspect') return inspectDocument(config, args);
  if (name === 'officecli_issues') return inspectIssues(config, args);
  if (name === 'officecli_validate') return validateDocument(config, args);
  if (name === 'officecli_create_document') return createDocument(config, args);
  if (name === 'officecli_apply_edit_plan') return applyEditPlan(config, args);
  if (name === 'officecli_export_preview') return exportPreview(config, args);
  throw new RpcError(-32602, `Unsupported OfficeCLI tool: ${name}`);
}

async function providerStatus(config) {
  const status = {
    ok: true,
    provider: 'deepseek-pp-officecli',
    protocolVersion: MCP_PROTOCOL_VERSION,
    cwd: config.cwd,
    relativePathBase: config.cwd,
    roots: config.roots,
    officecliBin: config.officecliBin,
    writeEnabled: config.writeEnabled,
    readTools: READ_TOOL_NAMES,
    writeTools: WRITE_TOOL_NAMES,
    pathRules: [
      `Use absolute Office file paths under one of these roots when possible: ${formatRoots(config.roots)}.`,
      `Relative paths resolve from ${config.cwd}.`,
      `file must be a concrete .docx, .xlsx, or .pptx path, not a directory or placeholder.`,
    ],
  };

  return {
    content: [{
      type: 'text',
      text: `OfficeCLI roots: ${formatRoots(config.roots)}; relative paths resolve from ${config.cwd}; writes ${config.writeEnabled ? 'enabled' : 'disabled'}.`,
    }],
    structuredContent: status,
  };
}

async function inspectDocument(config, args) {
  const file = resolveOfficeFile(config, args.file);
  const mode = enumValue(args.mode, ['outline', 'stats', 'text', 'annotated', 'forms'], 'outline');
  const command = ['view', file, mode, '--json'];
  appendOptionalInteger(command, '--start', args.start);
  appendOptionalInteger(command, '--end', args.end);
  appendOptionalInteger(command, '--max-lines', args.maxLines);
  return runJsonOfficeCli(config, command);
}

async function inspectIssues(config, args) {
  const file = resolveOfficeFile(config, args.file);
  const command = ['view', file, 'issues', '--json'];
  if (args.type !== undefined) command.push('--type', nonEmptyString(args.type, 'type'));
  appendOptionalInteger(command, '--limit', args.limit);
  return runJsonOfficeCli(config, command);
}

async function validateDocument(config, args) {
  const file = resolveOfficeFile(config, args.file);
  return runJsonOfficeCli(config, ['validate', file, '--json'], { allowOfficeCliFailure: true });
}

async function createDocument(config, args) {
  const file = resolveNewOfficeFile(config, args.file, args.overwrite === true);
  const command = ['create', file, '--json'];
  if (args.type !== undefined) command.push('--type', enumValue(args.type, ['docx', 'xlsx', 'pptx'], 'pptx'));
  if (args.locale !== undefined) command.push('--locale', nonEmptyString(args.locale, 'locale'));
  if (args.overwrite === true) command.push('--force');
  const result = await runJsonOfficeCli(config, command);
  if (result.structuredContent && typeof result.structuredContent === 'object' && !Array.isArray(result.structuredContent)) {
    result.structuredContent.artifact = {
      path: file,
      mimeType: officeMimeType(file),
      kind: 'office-document',
    };
  }
  return result;
}

async function applyEditPlan(config, args) {
  const file = resolveOfficeFile(config, args.file);
  const commands = arrayValue(args.commands, 'commands');
  if (commands.length === 0) {
    return toolError('officecli_payload_invalid', 'commands must contain at least one batch command.', false);
  }
  if (commands.length > 100) {
    return toolError('officecli_payload_invalid', 'commands is capped at 100 batch commands.', false);
  }
  const normalized = normalizeBatchCommands(commands);

  const command = ['batch', file, '--commands', JSON.stringify(normalized.commands), '--json'];
  if (args.stopOnError !== false) command.push('--stop-on-error');
  const result = await runJsonOfficeCli(config, command);
  const content = result.structuredContent;
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    content.operationId = stringValue(args.operationId) || null;
    if (normalized.notes.length > 0) {
      content.normalizedInput = {
        applied: true,
        notes: normalized.notes,
      };
    }
  }
  return result;
}

function normalizeBatchCommands(commands) {
  const notes = [];
  return {
    commands: commands.map((command, index) => normalizeBatchCommand(command, index, notes)),
    notes,
  };
}

function normalizeBatchCommand(value, index, notes) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OfficeCliToolError(
      'officecli_payload_invalid',
      `commands[${index}] must be an object with a command field.`,
      false,
      { item: value },
    );
  }

  const normalized = { ...value };
  const commandSource = readBatchCommandSource(value);
  if (!commandSource) {
    throw new OfficeCliToolError(
      'officecli_payload_invalid',
      `commands[${index}].command is required. Use {"command":"add","path":"/body","type":"paragraph","props":{"text":"..."}} or {"command":"set","path":"/body/p[1]","props":{"text":"..."}}.`,
      false,
      { item: value, allowedCommands: BATCH_COMMAND_NAMES },
    );
  }

  const command = enumValue(commandSource.value, BATCH_COMMAND_NAMES, undefined);
  normalized.command = command;
  if (commandSource.key !== 'command') {
    delete normalized[commandSource.key];
    notes.push(`commands[${index}]: normalized ${commandSource.key} to command=${command}`);
  }

  if (normalized.path === undefined && value.parent !== undefined) {
    normalized.path = nonEmptyString(value.parent, `commands[${index}].parent`);
    delete normalized.parent;
    notes.push(`commands[${index}]: normalized parent to path`);
  }

  if (command === 'add' && value.element !== undefined) {
    normalized.type = nonEmptyString(value.element, `commands[${index}].element`);
    delete normalized.element;
    notes.push(`commands[${index}]: normalized element to type`);
  }

  return normalized;
}

function readBatchCommandSource(value) {
  const command = stringValue(value.command).trim();
  if (command) return { key: 'command', value: command };

  for (const key of BATCH_COMMAND_ALIASES) {
    const alias = stringValue(value[key]).trim();
    if (alias) return { key, value: alias };
  }

  const type = stringValue(value.type).trim();
  if (BATCH_COMMAND_NAMES.includes(type)) return { key: 'type', value: type };

  if ((value.parent !== undefined || value.path !== undefined) && type) {
    return { key: 'inferred', value: 'add' };
  }

  return null;
}

async function exportPreview(config, args) {
  const file = resolveOfficeFile(config, args.file);
  const format = enumValue(args.format, ['html', 'svg', 'screenshot'], 'html');
  const command = ['view', file, format];
  appendOptionalString(command, '--page', args.page);
  appendOptionalInteger(command, '--start', args.start);
  appendOptionalInteger(command, '--end', args.end);

  let artifact = null;
  if (args.out !== undefined) {
    const output = resolvePreviewOutput(config, args.out);
    command.push('--out', output);
    artifact = {
      path: output,
      mimeType: previewMimeType(output, format),
      kind: format === 'screenshot' ? 'screenshot' : format,
    };
  }

  const result = format === 'screenshot'
    ? await runTextOfficeCli(config, command)
    : await runPreviewOfficeCli(config, command);

  if (artifact && result.structuredContent && typeof result.structuredContent === 'object') {
    result.structuredContent.artifact = artifact;
  }
  return result;
}

async function runJsonOfficeCli(config, args, options = {}) {
  const execution = await runOfficeCli(config, args);

  let parsed;
  try {
    parsed = JSON.parse(execution.stdout || 'null');
  } catch {
    if (execution.exitCode !== 0) return commandFailure(execution);
    return toolError('officecli_output_invalid', 'OfficeCLI returned non-JSON output for a JSON command.', false, {
      command: execution.command,
      stdout: execution.stdout.slice(0, 2_000),
      stderr: execution.stderr.slice(0, 2_000),
    });
  }

  if (execution.exitCode !== 0 && !options.allowOfficeCliFailure) {
    return commandFailure(execution);
  }

  return {
    content: [{ type: 'text', text: summarizeStructuredOutput(parsed) }],
    structuredContent: {
      ok: true,
      command: execution.command,
      data: parsed,
      stderr: execution.stderr || undefined,
    },
  };
}

async function runPreviewOfficeCli(config, args) {
  const execution = await runOfficeCli(config, args);
  if (execution.exitCode !== 0) {
    return commandFailure(execution);
  }
  return {
    content: [{ type: 'text', text: execution.stdout.slice(0, config.maxOutputBytes) }],
    structuredContent: {
      ok: true,
      command: execution.command,
      data: {
        text: execution.stdout.slice(0, config.maxOutputBytes),
        truncated: execution.stdout.length >= config.maxOutputBytes,
      },
      stderr: execution.stderr || undefined,
    },
  };
}

async function runTextOfficeCli(config, args) {
  const execution = await runOfficeCli(config, args);
  if (execution.exitCode !== 0) {
    return commandFailure(execution);
  }
  return {
    content: [{ type: 'text', text: execution.stdout || 'OfficeCLI command completed.' }],
    structuredContent: {
      ok: true,
      command: execution.command,
      data: {
        text: execution.stdout,
      },
      stderr: execution.stderr || undefined,
    },
  };
}

function runOfficeCli(config, args) {
  return new Promise((resolve, reject) => {
    const command = [config.officecliBin, ...args];
    const child = spawn(config.officecliBin, args, {
      cwd: config.cwd,
      env: {
        ...process.env,
        OFFICECLI_BATCH_ALLOW_STDIN_REDIRECT: '1',
        OFFICECLI_NO_AUTO_RESIDENT: process.env.OFFICECLI_NO_AUTO_RESIDENT ?? '1',
      },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let outputTooLarge = false;

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new OfficeCliToolError('officecli_timeout', `OfficeCLI command exceeded ${config.timeoutMs} ms.`, false, {
        command,
      }));
    }, config.timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timeout);
      if (error.code === 'ENOENT') {
        reject(new OfficeCliToolError('officecli_binary_missing', `OfficeCLI binary not found: ${config.officecliBin}`, false, {
          command,
        }));
        return;
      }
      reject(error);
    });

    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes + stderrBytes > config.maxOutputBytes * 2) {
        outputTooLarge = true;
        child.kill('SIGTERM');
        return;
      }
      stdout.push(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
      if (stdoutBytes + stderrBytes > config.maxOutputBytes * 2) {
        outputTooLarge = true;
        child.kill('SIGTERM');
        return;
      }
      stderr.push(chunk);
    });

    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      if (outputTooLarge) {
        reject(new OfficeCliToolError('officecli_output_too_large', 'OfficeCLI output exceeded the provider cap.', false, {
          command,
          maxOutputBytes: config.maxOutputBytes,
        }));
        return;
      }
      resolve({
        command,
        exitCode,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  }).catch((error) => {
    if (error instanceof OfficeCliToolError) {
      return {
        command: [config.officecliBin, ...args],
        exitCode: -1,
        stdout: '',
        stderr: error.message,
        toolError: error,
      };
    }
    throw error;
  }).then((result) => {
    if (result.toolError) throw result.toolError;
    return result;
  });
}

function resolveOfficeFile(config, rawPath) {
  const raw = stringValue(rawPath).trim();
  const extension = path.extname(raw).toLowerCase();
  if (!OFFICE_EXTENSIONS.has(extension)) {
    throw new OfficeCliToolError('officecli_extension_denied', `file must be a concrete Office file path ending in ${[...OFFICE_EXTENSIONS].join(', ')}. Do not pass a directory or placeholder path.`, false, {
      path: raw,
      roots: config.roots,
    });
  }
  const file = resolveExistingPath(config, rawPath, 'file');
  if (!statSync(file).isFile()) {
    throw new OfficeCliToolError('officecli_extension_denied', 'file must point to an Office document, not a directory.', false, {
      path: file,
      roots: config.roots,
    });
  }
  return file;
}

function resolveNewOfficeFile(config, rawPath, overwrite) {
  const file = resolveNewPath(config, rawPath, 'file');
  if (!OFFICE_EXTENSIONS.has(path.extname(file).toLowerCase())) {
    throw new OfficeCliToolError('officecli_extension_denied', `file must end in ${[...OFFICE_EXTENSIONS].join(', ')}.`, false, {
      path: file,
      roots: config.roots,
    });
  }
  if (existsSync(file) && !overwrite) {
    throw new OfficeCliToolError('officecli_file_exists', 'file already exists; pass overwrite=true to replace it.', false, {
      path: file,
    });
  }
  return file;
}

function resolvePreviewOutput(config, rawPath) {
  const output = resolveNewPath(config, rawPath, 'out');
  if (!PREVIEW_EXTENSIONS.has(path.extname(output).toLowerCase())) {
    throw new OfficeCliToolError('officecli_extension_denied', `Preview output must use one of ${[...PREVIEW_EXTENSIONS].join(', ')}.`, false, {
      path: output,
    });
  }
  return output;
}

function resolveExistingPath(config, rawPath, fieldName) {
  const value = nonEmptyString(rawPath, fieldName);
  const resolved = path.resolve(config.cwd, value);
  if (!existsSync(resolved)) {
    throw new OfficeCliToolError('officecli_path_denied', `${fieldName} does not exist: ${resolved}. Use a real path under one of the configured roots: ${config.roots.join(', ')}`, false, {
      path: resolved,
      roots: config.roots,
    });
  }
  const real = realpathSync.native(resolved);
  assertInsideRoots(config, real);
  return real;
}

function resolveNewPath(config, rawPath, fieldName) {
  const value = nonEmptyString(rawPath, fieldName);
  const resolved = path.resolve(config.cwd, value);
  const parent = path.dirname(resolved);
  if (!existsSync(parent)) {
    throw new OfficeCliToolError('officecli_path_denied', `${fieldName} parent does not exist: ${parent}`, false, {
      path: resolved,
    });
  }
  const realParent = realpathSync.native(parent);
  assertInsideRoots(config, realParent);
  assertInsideRoots(config, resolved);
  return resolved;
}

function assertInsideRoots(config, candidate) {
  const allowed = config.roots.some((root) => {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
  if (!allowed) {
    throw new OfficeCliToolError('officecli_path_denied', 'Path is outside the configured OfficeCLI roots.', false, {
      path: candidate,
      roots: config.roots,
    });
  }
}

function normalizeConfig(input) {
  const roots = normalizeRoots(input.roots ?? readRootsFromEnv() ?? [process.cwd()]);
  return {
    host: stringValue(input.host) || DEFAULT_HOST,
    port: integerValue(input.port, DEFAULT_PORT),
    cwd: roots[0],
    roots,
    officecliBin: stringValue(input.officecliBin) || process.env.OFFICECLI_BIN || 'officecli',
    writeEnabled: booleanValue(input.writeEnabled, process.env.OFFICECLI_WRITE_ENABLED === '1'),
    timeoutMs: integerValue(input.timeoutMs, integerValue(process.env.OFFICECLI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)),
    maxOutputBytes: integerValue(input.maxOutputBytes, integerValue(process.env.OFFICECLI_MAX_OUTPUT_BYTES, DEFAULT_MAX_OUTPUT_BYTES)),
  };
}

function normalizeRoots(rawRoots) {
  const roots = Array.isArray(rawRoots) ? rawRoots : [rawRoots];
  const normalized = roots
    .map((item) => stringValue(item).trim())
    .filter(Boolean)
    .map((item) => {
      const resolved = path.resolve(item);
      if (!existsSync(resolved)) mkdirSync(resolved, { recursive: true });
      const stats = statSync(resolved);
      if (!stats.isDirectory()) {
        throw new Error(`OfficeCLI root is not a directory: ${resolved}`);
      }
      return realpathSync.native(resolved);
    });
  if (normalized.length === 0) {
    const fallback = mkdtempSync(path.join(tmpdir(), 'deepseek-pp-officecli-'));
    return [realpathSync.native(fallback)];
  }
  return [...new Set(normalized)];
}

function readRootsFromEnv() {
  const raw = process.env.OFFICECLI_ROOTS;
  if (!raw) return null;
  return raw.split(path.delimiter).map((item) => item.trim()).filter(Boolean);
}

function createHealth(config) {
  return {
    ok: true,
    provider: 'deepseek-pp-officecli',
    protocolVersion: MCP_PROTOCOL_VERSION,
    endpoint: `http://${config.host}:${config.port}/mcp`,
    officecliBin: config.officecliBin,
    roots: config.roots,
    writeEnabled: config.writeEnabled,
    readTools: READ_TOOL_NAMES,
    writeTools: WRITE_TOOL_NAMES,
  };
}

function createToolDefinitions(config) {
  return BASE_TOOL_DEFINITIONS.map((tool) => annotateToolDefinition(config, tool));
}

function annotateToolDefinition(config, tool) {
  if (tool.name === 'officecli_status') return tool;
  const pathHint = createPathHint(config);
  const writeHint = WRITE_TOOL_NAMES.includes(tool.name)
    ? ` ${config.writeEnabled ? 'Write tools are enabled for this provider.' : 'Write tools are currently disabled and return officecli_write_disabled until the provider is restarted with --write enabled.'}`
    : '';
  return {
    ...tool,
    description: `${tool.description} ${pathHint}${writeHint}`,
    inputSchema: annotateInputSchema(config, tool.inputSchema),
  };
}

function annotateInputSchema(config, schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(properties).map(([key, value]) => {
        if ((key !== 'file' && key !== 'out') || !value || typeof value !== 'object') return [key, value];
        const description = typeof value.description === 'string' ? value.description : 'Path under an allowed OfficeCLI root.';
        return [key, {
          ...value,
          description: `${description} Use an absolute path under ${formatRoots(config.roots)} when possible; relative paths resolve from ${config.cwd}.`,
        }];
      }),
    ),
  };
}

function createProviderInstructions(config) {
  return [
    'OfficeCLI provider with fixed document tools, root allowlist, capped output, and explicit write enablement.',
    `Allowed roots: ${formatRoots(config.roots)}.`,
    `Relative paths resolve from: ${config.cwd}.`,
    `Write tools: ${config.writeEnabled ? 'enabled' : 'disabled'}.`,
    'Call officecli_status first when the user did not provide an absolute Office file path.',
  ].join(' ');
}

function createPathHint(config) {
  return `Allowed roots: ${formatRoots(config.roots)}. Use absolute paths under an allowed root when possible; relative paths resolve from ${config.cwd}.`;
}

function formatRoots(roots) {
  return roots.join(', ');
}

function toolError(code, message, retryable, details = {}) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    structuredContent: {
      ok: false,
      error: {
        code,
        message,
        retryable,
        details,
      },
    },
  };
}

function commandFailure(execution) {
  const message = execution.stderr || execution.stdout || `officecli exited with ${execution.exitCode}.`;
  const code = isLockError(message) ? 'officecli_file_locked' : 'officecli_command_failed';
  return toolError(code, message, code === 'officecli_file_locked', {
    command: execution.command,
    exitCode: execution.exitCode,
    stderr: execution.stderr,
  });
}

function normalizeError(error) {
  if (error instanceof RpcError) {
    return {
      jsonRpcCode: error.jsonRpcCode,
      message: error.message,
      data: error.data,
    };
  }
  if (error instanceof OfficeCliToolError) {
    return {
      jsonRpcCode: -32000,
      message: error.message,
      data: {
        code: error.code,
        retryable: error.retryable,
        details: error.details,
      },
    };
  }
  return {
    jsonRpcCode: -32603,
    message: getErrorMessage(error),
    data: undefined,
  };
}

class RpcError extends Error {
  constructor(jsonRpcCode, message, data) {
    super(message);
    this.name = 'RpcError';
    this.jsonRpcCode = jsonRpcCode;
    this.data = data;
  }
}

class OfficeCliToolError extends Error {
  constructor(code, message, retryable, details = {}) {
    super(message);
    this.name = 'OfficeCliToolError';
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

function summarizeStructuredOutput(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.success === false) return `OfficeCLI failed: ${JSON.stringify(value.error ?? value.message ?? value).slice(0, 1_000)}`;
    if (value.message) return String(value.message);
    if (value.data && typeof value.data === 'object' && 'issues' in value.data) {
      const count = typeof value.data.count === 'number' ? value.data.count : value.data.issues?.length ?? 0;
      return `OfficeCLI issues: ${count}`;
    }
  }
  return JSON.stringify(value).slice(0, 1_000);
}

function previewMimeType(output, format) {
  const ext = path.extname(output).toLowerCase();
  if (format === 'screenshot' || ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  return 'text/html';
}

function officeMimeType(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

function isLockError(message) {
  return /being used by another process|file lock|locked|resource busy/i.test(message);
}

function appendOptionalString(command, flag, value) {
  if (value !== undefined) command.push(flag, nonEmptyString(value, flag));
}

function appendOptionalInteger(command, flag, value) {
  if (value === undefined) return;
  command.push(flag, String(positiveInteger(value, flag)));
}

function enumValue(value, allowed, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === 'string' && allowed.includes(value)) return value;
  throw new OfficeCliToolError('officecli_payload_invalid', `Invalid enum value: ${value}. Expected one of ${allowed.join(', ')}.`, false);
}

function arrayValue(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new OfficeCliToolError('officecli_payload_invalid', `${fieldName} must be an array.`, false);
  }
  return value;
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function nonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new OfficeCliToolError('officecli_payload_invalid', `${fieldName} must be a non-empty string.`, false);
  }
  return value.trim();
}

function positiveInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new OfficeCliToolError('officecli_payload_invalid', `${fieldName} must be a positive integer.`, false);
  }
  return parsed;
}

function integerValue(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function booleanValue(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function stringValue(value) {
  return typeof value === 'string' ? value : '';
}

function isJsonRpcRequest(value) {
  return value && typeof value === 'object' && value.jsonrpc === '2.0' && typeof value.method === 'string';
}

function jsonRpcError(id, code, message) {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  };
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function readBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error(`Request body exceeded ${maxBytes} bytes.`));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'accept, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  response.end(JSON.stringify(body));
}

function sendCorsPreflight(response) {
  response.writeHead(204, {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'accept, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
  });
  response.end();
}

function parseCliArgs(argv) {
  const config = {};
  const roots = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === '--host') config.host = next();
    else if (arg === '--port') config.port = Number(next());
    else if (arg === '--root') roots.push(next());
    else if (arg === '--roots') roots.push(...next().split(path.delimiter));
    else if (arg === '--officecli') config.officecliBin = next();
    else if (arg === '--write') config.writeEnabled = next() === 'enabled';
    else if (arg === '--timeout-ms') config.timeoutMs = Number(next());
    else if (arg === '--max-output-bytes') config.maxOutputBytes = Number(next());
    else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (roots.length > 0) config.roots = roots;
  return config;
}

function printHelp() {
  console.log(`Usage: node scripts/officecli-mcp-server.mjs [options]

Options:
  --host <host>                 Host to bind, default ${DEFAULT_HOST}
  --port <port>                 Port to bind, default ${DEFAULT_PORT}; use 0 for a random port
  --root <path>                 Allowed document root; repeatable
  --roots <path${path.delimiter}path>        Allowed roots using the platform delimiter
  --officecli <path>            officecli binary path, default OFFICECLI_BIN or officecli
  --write enabled|disabled      Enable mutation tools, default disabled
  --timeout-ms <ms>             Per-command timeout, default ${DEFAULT_TIMEOUT_MS}
  --max-output-bytes <bytes>    Output cap, default ${DEFAULT_MAX_OUTPUT_BYTES}

Environment:
  OFFICECLI_ROOTS               Allowed roots, split by ${path.delimiter}
  OFFICECLI_WRITE_ENABLED=1     Enable mutation tools
  OFFICECLI_BIN                 officecli binary path
`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const started = await startOfficeCliMcpServer(parseCliArgs(process.argv.slice(2)));
    console.log(`officecli MCP server: ${started.url}`);
    console.log(`roots: ${started.config.roots.join(path.delimiter)}`);
    console.log(`write enabled: ${started.config.writeEnabled ? 'yes' : 'no'}`);
  } catch (error) {
    console.error(getErrorMessage(error));
    process.exit(1);
  }
}

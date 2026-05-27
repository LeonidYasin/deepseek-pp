#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { startOfficeCliMcpServer } from './officecli-mcp-server.mjs';

const root = await realpath(await mkdtemp(path.join(tmpdir(), 'deepseek-pp-officecli-smoke-')));
const outsideRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'deepseek-pp-officecli-outside-')));
let server;

try {
  const sample = path.join(root, 'sample.docx');
  await run('officecli', ['create', sample, '--json']);

  const started = await startOfficeCliMcpServer({
    roots: [root],
    port: 0,
    writeEnabled: false,
    timeoutMs: 120_000,
  });
  server = started.server;

  const initialized = await requestJsonRpc(started.url, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: { tools: {} },
    clientInfo: { name: 'officecli-smoke', version: '1.0.0' },
  });
  assert.equal(initialized.protocolVersion, '2025-06-18');

  await notifyJsonRpc(started.url, 'notifications/initialized');

  const listed = await requestJsonRpc(started.url, 'tools/list');
  assert.deepEqual(
    listed.tools.map((tool) => tool.name).sort(),
    [
      'officecli_apply_edit_plan',
      'officecli_create_document',
      'officecli_export_preview',
      'officecli_inspect',
      'officecli_issues',
      'officecli_status',
      'officecli_validate',
    ],
  );
  assert.ok(listed.tools.find((tool) => tool.name === 'officecli_create_document')?.inputSchema.properties.file.description.includes(root));

  const status = await callTool(started.url, 'officecli_status', {});
  assert.equal(status.isError, undefined);
  assert.equal(status.structuredContent.ok, true);
  assert.equal(status.structuredContent.cwd, root);
  assert.deepEqual(status.structuredContent.roots, [root]);
  assert.equal(status.structuredContent.writeEnabled, false);

  const inspect = await callTool(started.url, 'officecli_inspect', {
    file: sample,
    mode: 'outline',
  });
  assert.equal(inspect.isError, undefined);
  assert.equal(inspect.structuredContent.ok, true);

  const issues = await callTool(started.url, 'officecli_issues', {
    file: sample,
    limit: 5,
  });
  assert.equal(issues.isError, undefined);
  assert.equal(issues.structuredContent.ok, true);

  const validate = await callTool(started.url, 'officecli_validate', {
    file: sample,
  });
  assert.equal(validate.isError, undefined);
  assert.equal(validate.structuredContent.ok, true);

  const preview = await callTool(started.url, 'officecli_export_preview', {
    file: sample,
    format: 'html',
  });
  assert.equal(preview.isError, undefined);
  assert.equal(preview.structuredContent.ok, true);

  const deniedWrite = await callTool(started.url, 'officecli_apply_edit_plan', {
    file: sample,
    operationId: 'smoke-denied-write',
    commands: [{ op: 'add', parent: '/body', type: 'paragraph', props: { text: 'Denied' } }],
  });
  assert.equal(deniedWrite.isError, true);
  assert.equal(deniedWrite.structuredContent.error.code, 'officecli_write_disabled');

  const deniedCreate = await callTool(started.url, 'officecli_create_document', {
    file: path.join(root, 'denied-create.pptx'),
  });
  assert.equal(deniedCreate.isError, true);
  assert.equal(deniedCreate.structuredContent.error.code, 'officecli_write_disabled');

  const outsideSample = path.join(outsideRoot, 'outside.docx');
  await run('officecli', ['create', outsideSample, '--json']);
  const deniedPath = await callTool(started.url, 'officecli_inspect', {
    file: outsideSample,
    mode: 'outline',
  });
  assert.equal(deniedPath.code, -32000);
  assert.equal(deniedPath.data.code, 'officecli_path_denied');

  await new Promise((resolve) => server.close(resolve));
  server = null;

  const writeStarted = await startOfficeCliMcpServer({
    roots: [root],
    port: 0,
    writeEnabled: true,
    timeoutMs: 120_000,
  });
  server = writeStarted.server;

  const applied = await callTool(writeStarted.url, 'officecli_apply_edit_plan', {
    file: sample,
    operationId: 'smoke-write-normalized-plan',
    commands: [
      { parent: '/body', type: 'paragraph', props: { text: 'Inferred add command' } },
      { op: 'add', parent: '/body', element: 'paragraph', props: { text: 'Alias add command' } },
    ],
  });
  assert.equal(applied.isError, undefined);
  assert.equal(applied.structuredContent.ok, true);
  assert.equal(applied.structuredContent.operationId, 'smoke-write-normalized-plan');
  assert.equal(applied.structuredContent.normalizedInput.applied, true);

  const edited = await callTool(writeStarted.url, 'officecli_inspect', {
    file: sample,
    mode: 'text',
  });
  assert.equal(edited.isError, undefined);
  assert.equal(edited.structuredContent.ok, true);
  assert.match(JSON.stringify(edited.structuredContent.data), /Inferred add command/);
  assert.match(JSON.stringify(edited.structuredContent.data), /Alias add command/);

  console.log('officecli smoke: initialize/list ok');
  console.log('officecli smoke: status/root guidance ok');
  console.log('officecli smoke: inspect/issues/validate/preview ok');
  console.log('officecli smoke: denied write and denied path ok');
  console.log('officecli smoke: write edit-plan normalization ok');
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
  await rm(outsideRoot, { recursive: true, force: true });
}

async function callTool(url, name, args) {
  return requestJsonRpc(url, 'tools/call', {
    name,
    arguments: args,
  });
}

async function requestJsonRpc(url, method, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method,
      ...(params ? { params } : {}),
    }),
  });
  assert.equal(response.ok, true);
  const payload = await response.json();
  if (payload.error) return payload.error;
  return payload.result;
}

async function notifyJsonRpc(url, method, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      ...(params ? { params } : {}),
    }),
  });
  assert.equal(response.status, 204);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: {
        ...process.env,
        OFFICECLI_NO_AUTO_RESIDENT: '1',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      if (exitCode === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with ${exitCode}: ${stderr || stdout}`));
    });
  });
}

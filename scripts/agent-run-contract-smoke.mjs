#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const failures = [];

const requiredFiles = [
  'core/agent/types.ts',
  'core/agent/store.ts',
  'core/agent/scheduler.ts',
  'core/agent/service.ts',
  'core/agent/engine.ts',
  'core/agent/deepseek-web-adapter.ts',
  'core/agent/prompt-context.ts',
  'core/agent/policy.ts',
  'core/agent/deepseek-runner.ts',
  'entrypoints/sidepanel/pages/AgentRunsPage.tsx',
];

const removedPaths = [
  'core/automation',
  'entrypoints/sidepanel/pages/AutomationPage.tsx',
  'assets/screenshot-sidepanel-automation.svg',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    failures.push(`missing required AgentRun file: ${file}`);
  }
}

for (const removed of removedPaths) {
  if (fs.existsSync(path.join(root, removed))) {
    failures.push(`legacy automation path still exists: ${removed}`);
  }
}

const sourceFiles = [
  'core/agent/messages.ts',
  'core/agent/service.ts',
  'core/agent/prompt-context.ts',
  'core/agent/deepseek-runner.ts',
  'entrypoints/background.ts',
  'entrypoints/content.ts',
  'entrypoints/main-world.content.ts',
  'entrypoints/sidepanel/App.tsx',
  'scripts/mcp-live-mock.mjs',
];

const forbidden = [
  /\bDPP_AUTOMATION\b/,
  /\bGET_AUTOMATION(?:S)?\b/,
  /\bRUN_AUTOMATION\b/,
  /\bSTART_AUTOMATION\b/,
  /\bAutomationPage\b/,
  /\bdeepseek_pp_automations\b/,
];

for (const file of sourceFiles) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) continue;
  const text = fs.readFileSync(absolute, 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      failures.push(`${file} contains legacy marker ${pattern}`);
    }
  }
}

assertContains('core/agent/messages.ts', 'DPP_AGENT_CONTENT_RUN');
assertContains('core/agent/deepseek-web-adapter.ts', 'submitDeepSeekPrompt');
assertContains('core/agent/service.ts', 'agent_prompt_context_failed');
assertContains('core/agent/prompt-context.ts', 'AgentPromptContextError');
assertContains('entrypoints/background.ts', 'executeAgentRunThroughPage');
assertContains('entrypoints/content.ts', 'isAgentContentRunMessage');
assertContains('entrypoints/main-world.content.ts', 'runDeepSeekAgentRun');
assertNotContains('core/agent/engine.ts', 'officecli');
assertNotContains('core/agent/engine.ts', 'fetch(');
assertNotContains('core/agent/deepseek-runner.ts', 'fetch(');

const background = readText('entrypoints/background.ts');
if (background.includes('DEFAULT_TOOL_DESCRIPTORS')) {
  failures.push('entrypoints/background.ts must not silently fall back to DEFAULT_TOOL_DESCRIPTORS');
}

if (failures.length > 0) {
  console.error('AgentRun contract smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('AgentRun contract smoke passed');

function assertContains(file, fragment) {
  if (!readText(file).includes(fragment)) {
    failures.push(`${file} does not contain required fragment: ${fragment}`);
  }
}

function assertNotContains(file, fragment) {
  if (readText(file).includes(fragment)) {
    failures.push(`${file} contains forbidden fragment: ${fragment}`);
  }
}

function readText(file) {
  const absolute = path.join(root, file);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
}

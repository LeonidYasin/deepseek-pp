import { DEEPSEEK_API_URL } from '../constants';
import {
  extractTextFromParsed,
  isStreamFinishedFromParsed,
  parseSSEChunk,
  parseSSEData,
} from '../interceptor/sse-parser';
import {
  solvePowChallengeLocally,
  type PowAnswer,
  type PowChallenge,
} from './pow';

const COMPLETION_PATH = new URL(DEEPSEEK_API_URL).pathname;
const POW_CHALLENGE_PATH = '/api/v0/chat/create_pow_challenge';
const CHAT_SESSION_CREATE_PATH = '/api/v0/chat_session/create';
const DEFAULT_MODEL_TYPE = 'default';
const DEFAULT_APP_VERSION = '2.0.0';
const DEEPSEEK_CLIENT_PLATFORM = 'web';
const USER_TOKEN_STORAGE_KEY = 'userToken';
const SUPPORTED_MODEL_TYPES = new Set(['DEFAULT', 'default', 'expert', 'vision']);
const KNOWN_POW_WORKER_URLS = [
  'https://fe-static.deepseek.com/chat/static/33614.570c5fac7d.js',
  'https://fe-static.deepseek.com/chat/static/38401.a8c4129551.js',
];
const POW_WORKER_TIMEOUT_MS = 15_000;
export const BYPASS_HOOK_HEADER = 'X-DPP-Bypass-Hook';

export interface ModelTurn {
  assistantText: string;
  responseMessageId: number | null;
  requestMessageId: number | null;
  finished: boolean;
}

export interface SubmitPromptInput {
  chatSessionId: string;
  parentMessageId: number | null;
  modelType: string | null;
  prompt: string;
  refFileIds: string[];
  thinkingEnabled: boolean;
  searchEnabled: boolean;
  clientHeaders: Record<string, string>;
  powHeaders: Record<string, string>;
}

export interface StreamCallbacks {
  onTextChunk?(text: string, fullText: string): void;
  onFinished?(): void;
}

export class DeepSeekAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeepSeekAuthError';
  }
}

export class DeepSeekPowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeepSeekPowError';
  }
}

export class DeepSeekSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeepSeekSessionError';
  }
}

export class DeepSeekPayloadError extends Error {
  readonly retryable: boolean;

  constructor(message: string, options?: { retryable?: boolean }) {
    super(message);
    this.name = 'DeepSeekPayloadError';
    this.retryable = options?.retryable ?? false;
  }
}

let powWorkerUrlsPromise: Promise<string[]> | null = null;

export async function createChatSession(clientHeaders: Record<string, string>): Promise<string> {
  const response = await fetch(CHAT_SESSION_CREATE_PATH, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...clientHeaders },
    body: JSON.stringify({}),
  });
  const json = await readJsonResponse(response, 'DeepSeek chat session create');
  const data = json?.data;
  const chatSessionId = firstString(data?.biz_data?.chat_session?.id);

  if (isAuthBizError(data, json)) {
    throw new DeepSeekAuthError(`DeepSeek auth token was rejected while creating chat session: ${JSON.stringify(data ?? json)}`);
  }

  if (!response.ok || data?.biz_code !== 0 || !chatSessionId) {
    throw new DeepSeekSessionError(`Failed to create DeepSeek chat session: ${JSON.stringify(data ?? json)}`);
  }

  return chatSessionId;
}

export async function createPowHeaders(clientHeaders: Record<string, string>): Promise<Record<string, string>> {
  try {
    const challenge = await createPowChallenge(clientHeaders);
    const answer = await solvePowChallenge(challenge);
    return {
      'X-DS-PoW-Response': base64EncodeUtf8(JSON.stringify({
        algorithm: answer.algorithm,
        challenge: answer.challenge,
        salt: answer.salt,
        answer: answer.answer,
        signature: answer.signature,
        target_path: COMPLETION_PATH,
      })),
    };
  } catch (err) {
    if (err instanceof DeepSeekPowError) throw err;
    if (err instanceof DeepSeekAuthError) throw err;
    throw new DeepSeekPowError(err instanceof Error ? err.message : String(err));
  }
}

export function createClientHeaders(): Record<string, string> {
  const token = readDeepSeekUserToken();
  if (!token) {
    throw new DeepSeekAuthError('DeepSeek login token is missing. Refresh chat.deepseek.com or sign in again.');
  }

  return {
    Authorization: `Bearer ${token}`,
    'X-App-Version': getDeepSeekAppVersion(),
    'x-client-platform': DEEPSEEK_CLIENT_PLATFORM,
    'x-client-version': getDeepSeekAppVersion(),
    'x-client-locale': getDeepSeekLocale(),
    'x-client-timezone-offset': String(-new Date().getTimezoneOffset() * 60),
  };
}

export async function submitPrompt(input: SubmitPromptInput, signal?: AbortSignal): Promise<ModelTurn> {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    credentials: 'include',
    signal,
    headers: {
      'content-type': 'application/json',
      [BYPASS_HOOK_HEADER]: '1',
      ...input.clientHeaders,
      ...input.powHeaders,
    },
    body: JSON.stringify({
      chat_session_id: input.chatSessionId,
      parent_message_id: input.parentMessageId,
      model_type: normalizeModelType(input.modelType),
      prompt: input.prompt,
      ref_file_ids: input.refFileIds,
      thinking_enabled: input.thinkingEnabled,
      search_enabled: input.searchEnabled,
      action: null,
      preempt: false,
    }),
  });

  if (!response.ok) {
    throw new DeepSeekPayloadError(await readFailureMessage(response), { retryable: true });
  }

  if (!response.body) {
    throw new DeepSeekPayloadError('DeepSeek completion response did not include a stream body.', { retryable: true });
  }

  return readCompletionStream(response);
}

export async function submitPromptStreaming(
  input: SubmitPromptInput,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<ModelTurn> {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    credentials: 'include',
    signal,
    headers: {
      'content-type': 'application/json',
      [BYPASS_HOOK_HEADER]: '1',
      ...input.clientHeaders,
      ...input.powHeaders,
    },
    body: JSON.stringify({
      chat_session_id: input.chatSessionId,
      parent_message_id: input.parentMessageId,
      model_type: normalizeModelType(input.modelType),
      prompt: input.prompt,
      ref_file_ids: input.refFileIds,
      thinking_enabled: input.thinkingEnabled,
      search_enabled: input.searchEnabled,
      action: null,
      preempt: false,
    }),
  });

  if (!response.ok) {
    throw new DeepSeekPayloadError(await readFailureMessage(response), { retryable: true });
  }

  if (!response.body) {
    throw new DeepSeekPayloadError('DeepSeek completion response did not include a stream body.', { retryable: true });
  }

  return readCompletionStreamWithCallbacks(response, callbacks);
}

async function readCompletionStream(response: Response): Promise<ModelTurn> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const summary: ModelTurn = { assistantText: '', responseMessageId: null, requestMessageId: null, finished: false };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const boundary = buffer.lastIndexOf('\n\n');
    if (boundary === -1) continue;

    consumeSSEText(buffer.slice(0, boundary + 2), summary);
    buffer = buffer.slice(boundary + 2);
  }

  if (buffer.trim()) consumeSSEText(buffer, summary);
  return summary;
}

async function readCompletionStreamWithCallbacks(
  response: Response,
  callbacks: StreamCallbacks,
): Promise<ModelTurn> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const summary: ModelTurn = { assistantText: '', responseMessageId: null, requestMessageId: null, finished: false };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const boundary = buffer.lastIndexOf('\n\n');
    if (boundary === -1) continue;

    const complete = buffer.slice(0, boundary + 2);
    buffer = buffer.slice(boundary + 2);

    const prevLen = summary.assistantText.length;
    consumeSSEText(complete, summary);
    const newText = summary.assistantText.slice(prevLen);
    if (newText && callbacks.onTextChunk) {
      callbacks.onTextChunk(newText, summary.assistantText);
    }
  }

  if (buffer.trim()) {
    const prevLen = summary.assistantText.length;
    consumeSSEText(buffer, summary);
    const newText = summary.assistantText.slice(prevLen);
    if (newText && callbacks.onTextChunk) {
      callbacks.onTextChunk(newText, summary.assistantText);
    }
  }

  callbacks.onFinished?.();
  return summary;
}

function consumeSSEText(text: string, summary: ModelTurn) {
  const events = parseSSEChunk(text);
  for (const event of events) {
    const parsed = parseSSEData(event.data);
    if (!parsed) continue;

    const eventText = extractTextFromParsed(parsed);
    if (eventText) summary.assistantText += eventText;
    if (isStreamFinishedFromParsed(parsed)) summary.finished = true;
    collectMessageIds(parsed, summary);
  }
}

function collectMessageIds(parsed: unknown, summary: ModelTurn) {
  if (!parsed || typeof parsed !== 'object') return;
  const value = parsed as Record<string, unknown>;

  const responseId = firstMessageId(value.response_message_id, value.responseMessageId);
  if (responseId !== null) summary.responseMessageId = responseId;

  const requestId = firstMessageId(value.request_message_id, value.requestMessageId);
  if (requestId !== null) summary.requestMessageId = requestId;

  if (value.o === 'BATCH' && Array.isArray(value.v)) {
    for (const item of value.v) collectMessageIds(item, summary);
  }

  if (typeof value.p === 'string') {
    if (value.p.includes('response_message_id')) {
      const id = firstMessageId(value.v);
      if (id !== null) summary.responseMessageId = id;
    }
    if (value.p.includes('request_message_id')) {
      const id = firstMessageId(value.v);
      if (id !== null) summary.requestMessageId = id;
    }
  }

  if (Array.isArray(value.v)) {
    for (const item of value.v) collectMessageIds(item, summary);
  } else if (value.v && typeof value.v === 'object') {
    collectMessageIds(value.v, summary);
  }
}

function readDeepSeekUserToken(): string | null {
  try {
    const raw = localStorage.getItem(USER_TOKEN_STORAGE_KEY);
    if (!raw) return null;

    const parsed = tryParseJson(raw);
    if (typeof parsed === 'string') return parsed.trim() || null;
    if (parsed && typeof parsed === 'object') {
      return firstString(
        (parsed as Record<string, unknown>).token,
        (parsed as Record<string, unknown>).value,
        (parsed as Record<string, unknown>).accessToken,
      );
    }

    if (raw.trim() === 'null') return null;
    return raw.trim() || null;
  } catch {
    return null;
  }
}

function getDeepSeekAppVersion(): string {
  return DEFAULT_APP_VERSION;
}

function getDeepSeekLocale(): string {
  return document.documentElement.lang || navigator.language || 'en-US';
}

function normalizeModelType(modelType: string | null): string {
  if (!modelType) return DEFAULT_MODEL_TYPE;
  if (SUPPORTED_MODEL_TYPES.has(modelType)) return modelType;
  if (modelType === 'chat' || modelType === 'deepseek_chat') return DEFAULT_MODEL_TYPE;
  if (modelType === 'reasoner' || modelType === 'deepseek_reasoner') return 'expert';
  return DEFAULT_MODEL_TYPE;
}

async function createPowChallenge(clientHeaders: Record<string, string>): Promise<PowChallenge> {
  const response = await fetch(POW_CHALLENGE_PATH, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...clientHeaders },
    body: JSON.stringify({ target_path: COMPLETION_PATH }),
  });
  const json = await readJsonResponse(response, 'DeepSeek PoW challenge');
  const data = json?.data;
  const challenge = data?.biz_data?.challenge;

  if (isAuthBizError(data, json)) {
    throw new DeepSeekAuthError(`DeepSeek auth token was rejected while creating PoW challenge: ${JSON.stringify(data ?? json)}`);
  }

  if (!response.ok || data?.biz_code !== 0 || !challenge) {
    throw new DeepSeekPowError(`Failed to create DeepSeek PoW challenge: ${JSON.stringify(data ?? json)}`);
  }

  return {
    algorithm: String(challenge.algorithm),
    challenge: String(challenge.challenge),
    salt: String(challenge.salt),
    difficulty: Number(challenge.difficulty),
    signature: String(challenge.signature),
    expireAt: Number(challenge.expire_at ?? challenge.expireAt ?? 0),
    expireAfter: Number(challenge.expire_after ?? challenge.expireAfter ?? 0),
  };
}

async function solvePowChallenge(challenge: PowChallenge): Promise<PowAnswer> {
  const workerUrls = await getPowWorkerUrls();
  let lastError: unknown = null;

  for (const workerUrl of workerUrls) {
    try {
      return await solvePowWithWorker(workerUrl, challenge);
    } catch (err) {
      lastError = err;
    }
  }

  try {
    return await solvePowChallengeLocally(challenge);
  } catch (err) {
    const workerMessage = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown worker error');
    const localMessage = err instanceof Error ? err.message : String(err);
    throw new DeepSeekPowError(`DeepSeek PoW challenge failed. worker: ${workerMessage}; local: ${localMessage}`);
  }
}

function solvePowWithWorker(workerUrl: string, challenge: PowChallenge): Promise<PowAnswer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl);
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error('DeepSeek PoW worker timed out.'));
    }, POW_WORKER_TIMEOUT_MS);

    worker.onmessage = (event) => {
      if (event.data?.type === 'pow-answer') {
        window.clearTimeout(timeout);
        worker.terminate();
        resolve(event.data.answer as PowAnswer);
      } else if (event.data?.type === 'pow-error') {
        window.clearTimeout(timeout);
        worker.terminate();
        reject(event.data.error instanceof Error ? event.data.error : new Error(String(event.data.error)));
      }
    };

    worker.onerror = (event) => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error(event.message));
    };

    worker.postMessage({ type: 'pow-challenge', challenge });
  });
}

async function getPowWorkerUrls(): Promise<string[]> {
  powWorkerUrlsPromise ??= discoverPowWorkerUrls();
  return powWorkerUrlsPromise;
}

async function discoverPowWorkerUrls(): Promise<string[]> {
  const mainScriptUrl = getDeepSeekMainScriptUrl();
  if (!mainScriptUrl) return KNOWN_POW_WORKER_URLS;

  try {
    const source = await fetch(mainScriptUrl, { cache: 'force-cache' }).then((r) => r.text());
    const baseUrl = mainScriptUrl.replace(/static\/main\.[^/]+$/, '');
    const urls = ['33614', '38401']
      .map((chunkId) => {
        const match = source.match(new RegExp(`${chunkId}:"([^"]+)"`));
        return match ? `${baseUrl}static/${chunkId}.${match[1]}.js` : null;
      })
      .filter((url): url is string => url !== null);
    return urls.length > 0 ? urls : KNOWN_POW_WORKER_URLS;
  } catch {
    return KNOWN_POW_WORKER_URLS;
  }
}

function getDeepSeekMainScriptUrl(): string | null {
  const scripts = Array.from(document.scripts);
  const script = scripts.find((item) => item.src.includes('/chat/static/main.'));
  return script?.src ?? null;
}

function isAuthBizError(data: any, json: any): boolean {
  return data?.biz_code === 40002 || data?.biz_code === 40003 || json?.code === 40002 || json?.code === 40003;
}

async function readFailureMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  return text || `DeepSeek completion failed with HTTP ${response.status}.`;
}

async function readJsonResponse(response: Response, label: string): Promise<any> {
  const text = await response.text().catch(() => '');
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 240);
    throw new DeepSeekPowError(`${label} returned non-JSON HTTP ${response.status}: ${preview || response.statusText}`);
  }
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstMessageId(...values: unknown[]): number | null {
  for (const value of values) {
    const id = coerceMessageId(value);
    if (id !== null) return id;
  }
  return null;
}

function coerceMessageId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xFFFFFFFF) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 0xFFFFFFFF) return parsed;
  }
  return null;
}

function tryParseJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}

function base64EncodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

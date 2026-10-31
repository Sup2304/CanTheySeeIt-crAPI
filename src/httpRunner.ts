import type { TargetAdapter } from './adapter.ts';
import type { TestCase } from './contracts.ts';

export type Observation = { status: number | null; body: unknown; bytes: number; error?: string };
const MAX_BYTES = 32 * 1024;

function approvedPath(path: string, adapter: TargetAdapter): boolean {
  // Explicit path allowlist. Block query, fragments, URL encoding, traversal and protocol-relative URLs.
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('..') &&
    !/[?#\\%]/.test(path) && adapter.approvedPaths.has(path);
}

async function limitedBody(response: Response): Promise<{ body: unknown; bytes: number }> {
  const reader = response.body?.getReader();
  if (!reader) return { body: null, bytes: 0 };
  let total = 0;
  const pieces: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) throw new Error('RESPONSE_TOO_LARGE');
      pieces.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const text = new TextDecoder().decode(Buffer.concat(pieces));
  if (!text) return { body: null, bytes: total };
  try {
    return { body: JSON.parse(text) as unknown, bytes: total };
  } catch {
    return { body: null, bytes: total };
  }
}

export async function executeHttp(adapter: TargetAdapter, test: TestCase): Promise<Observation> {
  let status: number | null = null;
  try {
    const req = await adapter.resolve(test);
    if (req.method !== test.method || !approvedPath(req.path, adapter)) {
      return { status: null, body: null, bytes: 0, error: 'TARGET_OR_METHOD_NOT_APPROVED' };
    }
    if (test.method === 'PATCH' && (req.body === undefined || JSON.stringify(req.body).length > 8 * 1024)) {
      return { status: null, body: null, bytes: 0, error: 'MUTATION_BODY_NOT_APPROVED' };
    }
    const url = new URL(req.path, adapter.baseUrl);
    if (url.origin !== new URL(adapter.baseUrl).origin) {
      return { status: null, body: null, bytes: 0, error: 'TARGET_OR_METHOD_NOT_APPROVED' };
    }
    const headers = test.actorRef === 'anonymous' ? {} : await adapter.authHeaders(test.actorRef);
    // Header values come only from the trusted, server-side adapter.
    const response = await fetch(url, {
      method: test.method, redirect: 'manual', signal: AbortSignal.timeout(2500),
      headers: { ...headers, Accept: 'application/json', ...(test.method === 'PATCH' ? { 'Content-Type': 'application/json' } : {}), Connection: 'close' },
      body: test.method === 'PATCH' ? JSON.stringify(req.body) : undefined
    });
    status = response.status;
    if (status >= 300 && status < 400) {
      await response.body?.cancel().catch(() => {});
      return { status, body: null, bytes: 0, error: 'REDIRECT_BLOCKED' };
    }
    const data = await limitedBody(response);
    return { status, body: data.body, bytes: data.bytes };
  } catch (e) {
    const reason = e instanceof Error && ['RESPONSE_TOO_LARGE','MALFORMED_JSON'].includes(e.message)
      ? e.message : 'NETWORK_TIMEOUT_OR_ADAPTER_ERROR';
    return { status, body: null, bytes: 0, error: reason };
  }
}

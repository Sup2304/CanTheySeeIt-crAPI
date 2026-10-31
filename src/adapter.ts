import type { TestCase } from './contracts.ts';

/** Trusted, locally installed, application-specific adapter. NOT supplied by a browser request. */
export interface TargetAdapter {
  id: string;
  baseUrl: string;            // must be http://127.0.0.1:<port>/
  syntheticOnly: true;
  fixtureRevision: string; // change this if actors, known records or assertions change
  /** Exact resolved resource paths, not just a regex or arbitrary hostname. */
  approvedPaths: ReadonlySet<string>;
  ready(): Promise<{ ready: boolean; reason?: string }>;
  /** This must verify the actor's active synthetic identity independently. */
  validateActor(actorRef: string): Promise<boolean>;
  /** Return synthetic session headers; never log, persist or send these to frontend. */
  authHeaders(actorRef: string): Promise<Record<string, string>>;
  /** Resolve operation/resource into an approved GET/PATCH request. */
  resolve(test: TestCase): Promise<{ path: string; method: 'GET'|'PATCH'; body?: unknown }>;
  /** Match an EXACT known synthetic private fixture, never generic keys like 'grade'. */
  matchesProtectedFixture(test: TestCase, body: unknown): boolean;
  /** Trusted side-channel read: MUST verify committed state, not a possibly cached client value. */
  snapshot(test: TestCase): Promise<unknown>;
  /** Compare protected resource state and confirm the APPROVED change when expected. */
  compareState(test: TestCase, before: unknown, after: unknown): { changed: boolean; intendedChange: boolean };
  /** Restore an isolated/disposable fixture to the exact original state. */
  restore(test: TestCase, original: unknown): Promise<void>;
}

const adapters = new Map<string, TargetAdapter>();
export function registerAdapter(adapter: TargetAdapter): void {
  if (!adapter.syntheticOnly) throw new Error('Only disposable synthetic target adapters are allowed');
  const u = new URL(adapter.baseUrl);
  if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || !u.port ||
      u.username || u.password || u.pathname !== '/' || u.search || u.hash) {
    throw new Error('Only explicit http://127.0.0.1:<port>/ origins allowed');
  }
  adapters.set(adapter.id, adapter);
}
export function getAdapter(id: string) { return adapters.get(id); }
export function listAdapters() { return [...adapters.keys()]; }

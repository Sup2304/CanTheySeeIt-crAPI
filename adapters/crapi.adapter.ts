import { createHash } from 'node:crypto';
import type { TargetAdapter } from '../src/adapter.ts';
import type { TestCase } from '../src/contracts.ts';

/**
 * crAPI Phase 1 adapter: local, explicitly configured, GET-only.
 * Only approved fixture references and the observed identity-service paths are used.
 * No credential, token, VIN or vehicle response is logged or persisted.
 *
 * The expected VINs come from independent test setup (the two users' dashboards),
 * not from whatever the target happens to return during the test.
 */
const LOGIN_PATH = '/identity/api/auth/login';
const VEHICLES_PATH = '/identity/api/v2/vehicle/vehicles';
const TARGET_ID = 'crapi-local-benchmark';
const MAX_RESPONSE_BYTES = 32 * 1024;

type JsonObject = Record<string, unknown>;
function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type Actor = 'customer-a' | 'customer-b';
type Fixture = 'vehicle-a' | 'vehicle-b';
export type CrapiAccount = { email: string; password: string; vin: string; uuid?: string };
export type CrapiAdapterOptions = {
  /** Trusted test setup only. Never accept this from an HTTP request. */
  baseUrl?: string;
  accounts?: Record<Actor, CrapiAccount>;
};

function configuredAccounts(): Record<Actor, CrapiAccount> | undefined {
  const a = {
    email: process.env.CRAPI_A_EMAIL ?? '',
    password: process.env.CRAPI_A_PASSWORD ?? '',
    vin: process.env.CRAPI_A_VIN ?? '',
    uuid: process.env.CRAPI_A_UUID || undefined
  };
  const b = {
    email: process.env.CRAPI_B_EMAIL ?? '',
    password: process.env.CRAPI_B_PASSWORD ?? '',
    vin: process.env.CRAPI_B_VIN ?? '',
    uuid: process.env.CRAPI_B_UUID || undefined
  };
  if (![a.email, a.password, a.vin, b.email, b.password, b.vin].every(Boolean)) return undefined;
  return { 'customer-a': a, 'customer-b': b };
}

function safeConfig(accounts: Record<Actor, CrapiAccount> | undefined): boolean {
  if (!accounts) return false;
  const a = accounts['customer-a'];
  const b = accounts['customer-b'];
  return Boolean(a && b && a.email && a.password && a.vin && b.email && b.password && b.vin &&
    a.email.trim().toLowerCase() !== b.email.trim().toLowerCase() && a.vin !== b.vin &&
    (!a.uuid || a.uuid !== b.uuid));
}

function fixtureFor(ref: string): Actor {
  if (ref === 'vehicle-a') return 'customer-a';
  if (ref === 'vehicle-b') return 'customer-b';
  throw new Error('UNKNOWN_RESOURCE_REF');
}

function matches(record: unknown, fixture: CrapiAccount): boolean {
  return isObject(record) && record.vin === fixture.vin &&
    (fixture.uuid === undefined || record.uuid === fixture.uuid);
}

/**
 * Bounded, no-redirect JSON fetch. Deliberately does not expose response bodies
 * in errors; crAPI records can contain private PINs and other sensitive fields.
 */
async function requestJson(baseUrl: string, path: string,
  options: { method?: 'GET' | 'POST'; token?: string; body?: unknown } = {}): Promise<{ status: number; body: unknown }> {
  const response = await fetch(new URL(path, baseUrl), {
    method: options.method ?? 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.token === undefined ? {} : { Authorization: `Bearer ${options.token}` })
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => {});
    throw new Error('REDIRECT_NOT_ALLOWED');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('MISSING_RESPONSE_BODY');
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new Error('RESPONSE_TOO_LARGE');
      parts.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(Buffer.concat(parts))) as unknown; }
  catch { throw new Error('UNEXPECTED_NON_JSON_RESPONSE'); }
  return { status: response.status, body };
}

export function createCrapiAdapter(options: CrapiAdapterOptions = {}): TargetAdapter {
  const baseUrl = options.baseUrl ?? 'http://127.0.0.1:8888/';
  const url = new URL(baseUrl);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port ||
      url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('CRAPI_TARGET_MUST_BE_LOOPBACK');
  }
  const accounts = options.accounts ?? configuredAccounts();
  const configured = safeConfig(accounts);
  // Hash only non-secret fixture identifiers. This changes if the lab's known records change.
  const fixtureRevision = configured && accounts
    ? `crapi-phase1-${createHash('sha256').update(JSON.stringify([
        accounts['customer-a'].email.toLowerCase(), accounts['customer-a'].vin, accounts['customer-a'].uuid,
        accounts['customer-b'].email.toLowerCase(), accounts['customer-b'].vin, accounts['customer-b'].uuid
      ])).digest('hex').slice(0, 16)}`
    : 'UNCONFIGURED';
  const sessions: Partial<Record<Actor, string>> = {};
  let initialized = false;
  const approvedPaths = new Set([VEHICLES_PATH]);

  async function vehiclesFor(actor: Actor): Promise<unknown[]> {
    const token = sessions[actor];
    if (!token) throw new Error('NO_AUTHENTICATED_SESSION');
    const response = await requestJson(baseUrl, VEHICLES_PATH, { token });
    if (response.status !== 200 || !Array.isArray(response.body)) {
      throw new Error('OWN_VEHICLES_UNAVAILABLE');
    }
    return response.body;
  }

  async function actorHasKnownVehicle(actor: Actor): Promise<boolean> {
    if (!accounts) return false;
    const vehicles = await vehiclesFor(actor);
    return vehicles.some(vehicle => matches(vehicle, accounts[actor]));
  }

  return {
    id: TARGET_ID,
    baseUrl,
    syntheticOnly: true,
    fixtureRevision,
    approvedPaths,
    async ready() {
      initialized = false;
      delete sessions['customer-a'];
      delete sessions['customer-b'];
      if (!configured || !accounts) return { ready: false, reason: 'CRAPI_TEST_ACCOUNTS_OR_EXPECTED_VINS_NOT_CONFIGURED' };
      try {
        for (const actor of ['customer-a', 'customer-b'] as const) {
          const account = accounts[actor];
          const response = await requestJson(baseUrl, LOGIN_PATH, {
            method: 'POST', body: { email: account.email, password: account.password }
          });
          if (response.status !== 200 || !isObject(response.body) ||
              typeof response.body.token !== 'string' || response.body.token.length < 12) {
            throw new Error('LOGIN_FAILED');
          }
          sessions[actor] = response.body.token;
          if (!await actorHasKnownVehicle(actor)) throw new Error('EXPECTED_VEHICLE_NOT_FOUND');
        }
        initialized = true;
        return { ready: true };
      } catch {
        delete sessions['customer-a'];
        delete sessions['customer-b'];
        return { ready: false, reason: 'CRAPI_LOGIN_OR_INDEPENDENT_FIXTURE_CHECK_FAILED' };
      }
    },
    async validateActor(actorRef) {
      if (!initialized || (actorRef !== 'customer-a' && actorRef !== 'customer-b')) return false;
      try { return await actorHasKnownVehicle(actorRef); }
      catch { return false; }
    },
    async authHeaders(actorRef) {
      if (!initialized || (actorRef !== 'customer-a' && actorRef !== 'customer-b')) throw new Error('UNKNOWN_ACTOR');
      const token = sessions[actorRef];
      if (!token) throw new Error('SESSION_NOT_AVAILABLE');
      return { Authorization: `Bearer ${token}` };
    },
    async resolve(test: TestCase) {
      if (test.method !== 'GET' || test.operationRef !== 'vehicle.list') throw new Error('ONLY_APPROVED_READS_SUPPORTED');
      fixtureFor(test.resourceRef);
      if (test.actorRef !== 'customer-a' && test.actorRef !== 'customer-b' && test.actorRef !== 'anonymous') {
        throw new Error('UNKNOWN_ACTOR');
      }
      return { path: VEHICLES_PATH, method: 'GET' as const };
    },
    matchesProtectedFixture(test: TestCase, body: unknown) {
      if (!accounts || !Array.isArray(body)) return false;
      return body.some(vehicle => matches(vehicle, accounts[fixtureFor(test.resourceRef)]));
    },
    async snapshot(_test: TestCase): Promise<unknown> {
      throw new Error('CRAPI_READ_ONLY_ADAPTER_NO_SNAPSHOTS');
    },
    compareState(_test: TestCase, _before: unknown, _after: unknown) {
      throw new Error('CRAPI_READ_ONLY_ADAPTER_NO_WRITES');
    },
    async restore(_test: TestCase, _original: unknown): Promise<void> {
      throw new Error('CRAPI_READ_ONLY_ADAPTER_NO_WRITES');
    }
  };
}

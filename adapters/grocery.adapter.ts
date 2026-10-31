/**
 * Snehal (Member 2) -> Suprita Generic Verifier V2 TargetAdapter.
 * This file is the ONLY grocery-specific bridge into Suprita's reusable engine.
 * Target remains local; test keys, bearer tokens, fixture contents stay server-side.
 * Source contract: CanTheySeeIt_Generic_Verifier_v2.zip/src/adapter.ts
 */
import { isDeepStrictEqual } from 'node:util';
import type { TargetAdapter } from '../src/adapter.ts';
import type { TestCase } from '../src/contracts.ts';
import { createFixtureAdapter, validateLocalTarget } from '../apps/demo/security-test/fixture-adapter.mjs';

type RecordObject = Record<string, unknown>;
type PreparedProfile = { privateSessions: Record<string, string> };
type FixtureSource = {
  prepareFixtures(input: { approved: boolean }): Promise<{ privateProfile: PreparedProfile }>;
  inspectFixture(input: { type: 'address' | 'product'; resourceId: string }): Promise<RecordObject>;
  resetFixtures(input: { approved: boolean }): Promise<unknown>;
  expireSyntheticActor(input: { actorId: string }): Promise<unknown>;
};

const ROLES: Record<string, string> = Object.freeze({
  'customer-a': 'customer', 'customer-b': 'customer', 'staff-1': 'inventory_staff'
});
const ADDRESSES = new Set(['address-a-101', 'address-b-102']);
const PRODUCTS = new Set(['sku-apple-01']);
const ADDRESS_MARKERS: Record<string, string> = Object.freeze({
  'address-a-101': 'ADDRESS_A_TEST_MARKER_7K5N',
  'address-b-102': 'ADDRESS_B_TEST_MARKER_P9Q4'
});

const OPERATIONS = Object.freeze({
  'address.read': { method: 'GET', type: 'address', path: (id: string) => `/api/addresses/${id}` },
  'address.update': { method: 'PATCH', type: 'address', path: (id: string) => `/api/addresses/${id}` },
  'inventory.update': { method: 'PATCH', type: 'product', path: (id: string) => `/api/products/${id}/inventory` }
} as const);
const MUTATIONS: Record<string, RecordObject> = Object.freeze({
  'address.note.own': Object.freeze({ deliveryNote: 'CAN_THEY_SEE_IT_SYNTHETIC_ALLOWED_EDIT' }),
  'address.note.cross': Object.freeze({ deliveryNote: 'CAN_THEY_SEE_IT_SYNTHETIC_BLOCKED_EDIT' }),
  'address.owner.reassign': Object.freeze({ ownerUserId: 'customer-b' }),
  'address.note.fault': Object.freeze({ deliveryNote: 'CAN_THEY_SEE_IT_SYNTHETIC_FAULT_G11' }),
  'inventory.quantity.17': Object.freeze({ stockQuantity: 17 })
});

function exactRecordFor(test: TestCase): { type: 'address' | 'product'; resourceId: string } {
  if (ADDRESSES.has(test.resourceRef)) return { type: 'address', resourceId: test.resourceRef };
  if (PRODUCTS.has(test.resourceRef)) return { type: 'product', resourceId: test.resourceRef };
  throw new Error('Unsupported synthetic resource reference');
}
function isRecord(v: unknown): v is RecordObject {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Optional source injection exists ONLY for offline unit tests; never from HTTP input.
 * The default source is Snehal's private, loopback fixture adapter.
 */
export function createV2GroceryAdapter(options: {
  baseUrl?: string;
  keyFile?: string;
  fixtureSource?: FixtureSource;
  fetchImpl?: typeof fetch;
  setupApproved?: boolean;
  enableG12Fault?: boolean;
} = {}): TargetAdapter {
  const baseUrl = validateLocalTarget(options.baseUrl ?? process.env.GROCERY_TARGET_URL ?? 'http://127.0.0.1:4000/');
  const source: FixtureSource = options.fixtureSource ?? createFixtureAdapter({
    baseUrl: `${baseUrl}/`,
    ...(options.keyFile ?? process.env.GROCERY_ADAPTER_KEY_FILE
      ? { keyFile: options.keyFile ?? process.env.GROCERY_ADAPTER_KEY_FILE } : {})
  });
  const fetchImpl = options.fetchImpl ?? fetch;
  const setupApproved = options.setupApproved ?? process.env.GROCERY_APPROVE_SYNTHETIC_SETUP === '1';
  const enableG12Fault = options.enableG12Fault ?? process.env.GROCERY_ENABLE_G12_FAULT === '1';
  let sessions: Record<string, string> = Object.create(null);
  let prepared = false;
  const approvedPaths = new Set<string>([
    '/api/addresses/address-a-101', '/api/addresses/address-b-102',
    '/api/products/sku-apple-01/inventory'
  ]);

  const adapter: TargetAdapter = {
    id: 'local-grocery-v1',
    baseUrl: `${baseUrl}/`,
    syntheticOnly: true,
    fixtureRevision: 'grocery-fixtures-v1-generic-v2',
    approvedPaths,

    async ready() {
      if (!setupApproved) return { ready: false, reason: 'EXPLICIT_SYNTHETIC_SETUP_APPROVAL_REQUIRED' };
      prepared = false;
      sessions = Object.create(null);
      try {
        const result = await source.prepareFixtures({ approved: true });
        const fresh = result.privateProfile.privateSessions;
        for (const actor of Object.keys(ROLES)) {
          if (typeof fresh[actor] !== 'string' || fresh[actor].length < 20)
            throw new Error('ACTOR_SESSION_MISSING');
        }
        sessions = { ...fresh };
        prepared = true;
        return { ready: true };
      } catch {
        return { ready: false, reason: 'LOCAL_SYNTHETIC_FIXTURE_NOT_READY' };
      }
    },

    async validateActor(actorRef) {
      if (!prepared || !Object.hasOwn(ROLES, actorRef)) return false;
      const token = sessions[actorRef];
      if (typeof token !== 'string' || token.length < 20) return false;
      try {
        const res = await fetchImpl(`${baseUrl}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
          redirect: 'manual', signal: AbortSignal.timeout(2500)
        });
        if (res.status !== 200) return false;
        const data: unknown = await res.json();
        return isRecord(data) && data.userId === actorRef && data.role === ROLES[actorRef];
      } catch { return false; }
    },

    async authHeaders(actorRef) {
      if (!prepared || !Object.hasOwn(ROLES, actorRef) || !sessions[actorRef])
        throw new Error('Trusted actor credentials unavailable');
      return { Authorization: `Bearer ${sessions[actorRef]}` };
    },

    async resolve(test) {
      const op = OPERATIONS[test.operationRef as keyof typeof OPERATIONS];
      if (!op || op.method !== test.method) throw new Error('Operation/method not approved');
      const resource = exactRecordFor(test);
      if (op.type !== resource.type) throw new Error('Resource/operation mismatch');
      const path = op.path(resource.resourceId);
      if (!approvedPaths.has(path)) throw new Error('Path not approved');
      if (test.method === 'GET') {
        if (test.mutationRef) throw new Error('GET must not have mutation');
        if (test.testId === 'G12' && enableG12Fault) {
          if (test.actorRef !== 'customer-b' || resource.resourceId !== 'address-a-101')
            throw new Error('G12 fault configuration mismatch');
          // Controlled QA fault: expire AFTER the initial actor precheck and BEFORE GET.
          await source.expireSyntheticActor({ actorId: 'customer-b' });
        }
        return { path, method: 'GET' as const };
      }
      const mutation = test.mutationRef ? MUTATIONS[test.mutationRef] : undefined;
      if (!mutation) throw new Error('PATCH mutation reference not approved');
      if (resource.type === 'address' && !test.mutationRef?.startsWith('address.'))
        throw new Error('Address mutation mismatch');
      if (resource.type === 'product' && !test.mutationRef?.startsWith('inventory.'))
        throw new Error('Inventory mutation mismatch');
      return { path, method: 'PATCH' as const, body: { ...mutation } };
    },

    matchesProtectedFixture(test, body) {
      if (test.method !== 'GET' || !isRecord(body) || !ADDRESSES.has(test.resourceRef)) return false;
      const id = test.resourceRef;
      const expectedOwner = id === 'address-a-101' ? 'customer-a' : 'customer-b';
      return body.addressId === id && body.ownerUserId === expectedOwner &&
        body.privateMarker === ADDRESS_MARKERS[id];
    },

    async snapshot(test) {
      const fixture = exactRecordFor(test);
      const result = await source.inspectFixture(fixture);
      if (!isRecord(result)) throw new Error('Invalid trusted snapshot');
      if (result[fixture.type === 'address' ? 'addressId' : 'sku'] !== fixture.resourceId)
        throw new Error('Trusted snapshot ID mismatch');
      return structuredClone(result);
    },

    compareState(test, before, after) {
      if (!isRecord(before) || !isRecord(after))
        throw new Error('State comparison requires two trusted records');
      const fixture = exactRecordFor(test);
      const key = fixture.type === 'address' ? 'addressId' : 'sku';
      if (before[key] !== fixture.resourceId || after[key] !== fixture.resourceId)
        throw new Error('Snapshot resource mismatch');
      const changed = !isDeepStrictEqual(before, after);
      const mutation = test.mutationRef ? MUTATIONS[test.mutationRef] : undefined;
      if (!mutation || !changed) return { changed, intendedChange: false };
      // Require the entire resource to match the expected single-field update.
      const desired = { ...before, ...mutation };
      const allowedField = fixture.type === 'address' ? 'deliveryNote' : 'stockQuantity';
      const intendedChange = Object.keys(mutation).length === 1 &&
        Object.hasOwn(mutation, allowedField) && isDeepStrictEqual(desired, after);
      return { changed, intendedChange };
    },

    async restore(test, original) {
      // Reset is global, not a blind PATCH through a customer account. This is
      // safe only because ready() confirmed the canonical disposable baseline.
      await source.resetFixtures({ approved: true });
      const now = await this.snapshot(test);
      if (!isDeepStrictEqual(original, now))
        throw new Error('CLEANUP_FAILED: previous state not fully restored');
    }
  };
  return Object.freeze(adapter);
}

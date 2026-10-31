import { createHash, randomUUID } from 'node:crypto';
import type { TargetAdapter } from './adapter.ts';
import type { Result, Run, TestSuite, TestCase } from './contracts.ts';
import { executeHttp } from './httpRunner.ts';
import { aggregateVerdict, inconclusive, readVerdict, writeVerdict } from './verdict.ts';

function errorResult(test: TestCase, code: string) { return inconclusive(test, code); }

async function one(test: TestCase, adapter: TargetAdapter, allowSyntheticWrites: boolean): Promise<{ result: Result; cleanupFailure: boolean }> {
  if (test.method === 'PATCH' && !allowSyntheticWrites) {
    return { result: errorResult(test, 'SYNTHETIC_WRITE_NOT_APPROVED'), cleanupFailure: false };
  }
  let identityBefore = true;
  try { if (test.actorRef !== 'anonymous') identityBefore = await adapter.validateActor(test.actorRef); }
  catch { identityBefore = false; }
  if (!identityBefore) return { result: errorResult(test, 'INVALID_ACTOR_SESSION'), cleanupFailure: false };

  if (test.method === 'GET') {
    const obs = await executeHttp(adapter, test);
    let matched = false;
    try { matched = adapter.matchesProtectedFixture(test, obs.body); }
    catch { return { result: errorResult(test,'FIXTURE_EVIDENCE_UNAVAILABLE'), cleanupFailure:false }; }
    let result = readVerdict(test, obs, matched);
    if (test.actorRef !== 'anonymous') {
      try { if (!await adapter.validateActor(test.actorRef)) result = errorResult(test,'SESSION_EXPIRED_DURING_TEST'); }
      catch { result = errorResult(test,'SESSION_VERIFICATION_FAILED'); }
    }
    return { result, cleanupFailure: false };
  }

  // PATCH: never issue an edit if the trusted snapshot is unavailable.
  let before: unknown;
  try { before = await adapter.snapshot(test); }
  catch { return { result: errorResult(test, 'PREWRITE_SNAPSHOT_FAILED'), cleanupFailure: false }; }

  let result: Result = errorResult(test, 'POSTWRITE_READBACK_FAILED');
  let cleanupFailure = false;
  try {
    const obs = await executeHttp(adapter,test);
    const after = await adapter.snapshot(test);
    const comparison = adapter.compareState(test, before, after);
    result = writeVerdict(test, obs, comparison);
    if (test.actorRef !== 'anonymous') {
      if (!await adapter.validateActor(test.actorRef)) result = errorResult(test, 'SESSION_EXPIRED_DURING_TEST');
    }
  } catch {
    result = errorResult(test, 'POSTWRITE_READBACK_OR_SESSION_FAILED');
  } finally {
    // Even if the API said 403 or the test threw, always attempt trusted cleanup.
    try {
      await adapter.restore(test, before);
      const restored = await adapter.snapshot(test);
      const comparison = adapter.compareState(test, before, restored);
      if (comparison.changed) throw new Error('NOT_RESTORED');
    } catch {
      cleanupFailure = true;
      if (result.verdict !== 'FAIL') result = errorResult(test, 'CLEANUP_FAILED');
    }
  }
  return { result, cleanupFailure };
}

export async function runSuite(suite: TestSuite, adapter: TargetAdapter,
  revisionLabel: string, allowSyntheticWrites: boolean, prior?: Run): Promise<Run> {
  const ready = await adapter.ready().catch(() => ({ ready: false, reason:'ADAPTER_READINESS_ERROR' }));
  if (!ready.ready) throw new Error(`NEEDS_SETUP: ${ready.reason ?? 'adapter not ready'}`);
  if (suite.targetProfileId !== adapter.id) throw new Error('TARGET_PROFILE_MISMATCH');
  const contractHash = createHash('sha256').update(JSON.stringify({ suite, fixtureRevision: adapter.fixtureRevision })).digest('hex');
  const results: Result[] = [];
  let haltMutations = false;
  for (const test of suite.cases) {
    const dependsOnInvalid = test.requiredControls.some(c => results.find(r=>r.testId === c)?.verdict !== 'PASS');
    if (dependsOnInvalid) { results.push(inconclusive(test,'PREREQUISITE_FAILED')); continue; }
    if (test.method === 'PATCH' && haltMutations) { results.push(inconclusive(test,'EARLIER_CLEANUP_FAILED')); continue; }
    const outcome = await one(test,adapter,allowSyntheticWrites);
    results.push(outcome.result);
    if (outcome.cleanupFailure) haltMutations = true;
  }
  const isComparable = prior?.contractHash === contractHash;
  const older = isComparable && prior ? new Map(prior.results.map(r=>[r.testId,r.verdict])) : null;
  const aggregate = aggregateVerdict(results);
  return {
    runId:randomUUID(),suiteId:suite.suiteId,contractHash,revisionLabel,aggregateVerdict:aggregate,
    results,executedAt:new Date().toISOString(),haltedAfterCleanupFailure:haltMutations,
    comparison: !isComparable || !prior || !older ? null : {
      previousRunId: prior.runId, aggregateTransition:`${prior.aggregateVerdict} → ${aggregate}`,
      testTransitions: results.flatMap(r=>{
        const from=older.get(r.testId);
        return from && from !== r.verdict ? [{testId:r.testId,from,to:r.verdict}] : [];
      })
    }
  };
}

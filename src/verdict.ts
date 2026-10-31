import type { TestCase, Result, Verdict } from './contracts.ts';
import type { Observation } from './httpRunner.ts';

function result(test: TestCase, verdict: Verdict, reasonCode: string, explanation: string,
  observation: Observation, matched?: boolean, changed?: boolean, intended?: boolean): Result {
  return { testId: test.testId, verdict, reasonCode, explanation,
    observed: { status: observation.status,
      ...(matched === undefined ? {} : { fixtureMatched: matched }),
      ...(changed === undefined ? {} : { stateChanged: changed }),
      ...(intended === undefined ? {} : { intendedChange: intended }),
      ...(observation.error ? { error: observation.error } : {}) },
    checkedAt: new Date().toISOString() };
}
export function inconclusive(test: TestCase, why: string): Result {
  return result(test, 'INCONCLUSIVE', why, 'The test prerequisites or observations were not reliable enough for a security conclusion.',
    { status: null, body: null, bytes: 0 });
}
export function readVerdict(test: TestCase, observation: Observation, matched: boolean): Result {
  if (observation.error || observation.status === null || observation.status >= 500) {
    return result(test, 'INCONCLUSIVE', observation.error ?? 'TARGET_ERROR',
      'The HTTP response was not reliable.', observation, matched);
  }
  if (test.expectation === 'ALLOW') {
    return observation.status === 200 && matched
      ? result(test,'PASS','EXPECTED_PRIVATE_FIXTURE','Allowed user retrieved the exact expected synthetic record.',observation,matched)
      : result(test,'INCONCLUSIVE','ALLOW_NOT_PROVEN','Expected private record was not conclusively retrieved.',observation,matched);
  }
  // Exact protected data leakage is a violation EVEN if the response status pretends to be a denial.
  if (matched) return result(test,'FAIL','PRIVATE_FIXTURE_EXPOSED',
    'Forbidden actor received the exact synthetic protected record.',observation,matched);
  if (test.acceptedDenialStatuses.includes(observation.status as 401|403|404)) {
    return result(test,'PASS','ACCESS_DENIED_AS_CONFIGURED',
      'Forbidden actor was denied under the confirmed policy with valid controls.',observation,matched);
  }
  return result(test,'INCONCLUSIVE','AMBIGUOUS_READ',
    'A status code without exact fixture evidence does not prove allowed or forbidden access.',observation,matched);
}
export function writeVerdict(test: TestCase, observation: Observation,
  change: {changed:boolean; intendedChange:boolean}): Result {
  const { changed, intendedChange } = change;
  // For a forbidden edit, confirmed protected state mutation is a FAIL regardless of HTTP status.
  if (test.expectation === 'DENY' && changed) {
    return result(test,'FAIL','UNAUTHORIZED_STATE_CHANGED',
      'Protected synthetic state changed even though this actor must not edit it.',observation,undefined,changed,intendedChange);
  }
  if (observation.error || observation.status === null || observation.status >= 500) {
    return result(test,'INCONCLUSIVE',observation.error ?? 'TARGET_ERROR',
      'Request outcome was unreliable, even after state inspection.',observation,undefined,changed,intendedChange);
  }
  if (test.expectation === 'DENY') {
    return test.acceptedDenialStatuses.includes(observation.status as 401|403|404)
      ? result(test,'PASS','DENIED_AND_STATE_UNCHANGED',
          'Forbidden update was denied and the committed protected state remained unchanged.',observation,undefined,changed,intendedChange)
      : result(test,'INCONCLUSIVE','AMBIGUOUS_DENIED_WRITE',
          'No state change was found, but the response was not an accepted denial.',observation,undefined,changed,intendedChange);
  }
  return observation.status >= 200 && observation.status < 300 && changed && intendedChange
    ? result(test,'PASS','ALLOWED_UPDATE_VERIFIED',
        'Approved synthetic update succeeded and the expected committed field changed.',observation,undefined,changed,intendedChange)
    : result(test,'INCONCLUSIVE','ALLOWED_UPDATE_NOT_PROVEN',
        'The approved update or its expected persisted effect could not be confirmed.',observation,undefined,changed,intendedChange);
}
export function aggregateVerdict(results: Result[]): Verdict {
  if (results.some(r=>r.verdict === 'FAIL')) return 'FAIL';
  if (results.some(r=>r.verdict === 'INCONCLUSIVE')) return 'INCONCLUSIVE';
  return 'PASS';
}

import { readFile } from 'node:fs/promises';

const base = 'http://127.0.0.1:4100';
const suite = JSON.parse(await readFile(new URL('../suites/crapi/crapi-baseline.json', import.meta.url), 'utf8'));
async function api(path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(25000)
  });
  const result = await response.json();
  return { status: response.status, result };
}
try {
  const existing = await api('/api/suites');
  if (existing.status !== 200 || !Array.isArray(existing.result)) {
    throw new Error('CANNOT_READ_SUITES');
  }
  const saved = existing.result.find(s => s.suiteId === suite.suiteId);
  if (saved && JSON.stringify(saved) !== JSON.stringify(suite)) {
    console.error('The suite ID already exists with a different contract. Use a new suiteId; do not silently reuse old test definitions.');
    process.exitCode = 1;
  } else {
    if (!saved) {
      const registration = await api('/api/suites', 'POST', suite);
      if (registration.status !== 201) {
        console.error('Suite registration failed:', registration.result);
        process.exitCode = 1;
      }
    }
    if (!process.exitCode) {
      const run = await api(`/api/suites/${suite.suiteId}/run`, 'POST', {
        revisionLabel: 'crapi-phase1-baseline', approveSyntheticWrites: false
      });
      if (run.status !== 200) {
        console.log('crAPI is not ready for a run:', run.result);
        process.exitCode = 1;
      } else {
        console.log(`Run ${run.result.runId}: ${run.result.aggregateVerdict}`);
        console.table(run.result.results.map(({ testId, verdict, reasonCode, observed }) => ({
          testId, verdict, reasonCode, status: observed.status, fixtureMatched: observed.fixtureMatched ?? 'n/a'
        })));
        if (run.result.aggregateVerdict !== 'PASS') process.exitCode = 1;
      }
    }
  }
} catch (error) {
  console.error('Could not complete the demo. Confirm the backend is running on http://127.0.0.1:4100.');
  process.exitCode = 1;
}

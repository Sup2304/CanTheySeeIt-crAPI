import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createCrapiAdapter } from '../adapters/crapi.adapter.ts';
import { runSuite } from '../src/engine.ts';

const accounts = {
  'customer-a': { email: 'a@example.test', password: 'disposable-a', vin: 'VIN-OWNED-BY-A', uuid: 'uuid-a' },
  'customer-b': { email: 'b@example.test', password: 'disposable-b', vin: 'VIN-OWNED-BY-B', uuid: 'uuid-b' }
};
const vehicles = {
  'customer-a': [{ id: 1, uuid: 'uuid-a', vin: 'VIN-OWNED-BY-A', owner: { id: 1 }, pincode: 'not-to-log' }],
  'customer-b': [{ id: 2, uuid: 'uuid-b', vin: 'VIN-OWNED-BY-B', owner: { id: 2 }, pincode: 'not-to-log' }]
};

async function lab({ anonymousLeaks = false } = {}) {
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const send = (code, body) => { res.writeHead(code); res.end(JSON.stringify(body)); };
    if (req.url === '/identity/api/auth/login' && req.method === 'POST') {
      let body = '';
      for await (const part of req) body += part;
      let login;
      try { login = JSON.parse(body); } catch { send(400, { error: 'invalid json' }); return; }
      const actor = Object.keys(accounts).find(key => accounts[key].email === login.email && accounts[key].password === login.password);
      if (!actor) { send(401, { error: 'bad credentials' }); return; }
      send(200, { token: `synthetic-token-for-${actor}-1234567890` });
      return;
    }
    if (req.url === '/identity/api/v2/vehicle/vehicles' && req.method === 'GET') {
      const actor = Object.keys(accounts).find(key => req.headers.authorization === `Bearer synthetic-token-for-${key}-1234567890`);
      if (actor) { send(200, vehicles[actor]); return; }
      if (anonymousLeaks) { send(200, vehicles['customer-a']); return; }
      send(401, { error: 'Unauthorized' });
      return;
    }
    send(404, { error: 'not found' });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return { baseUrl: `http://127.0.0.1:${port}/`, close: () => new Promise(resolve => server.close(resolve)) };
}

const suite = JSON.parse(await readFile(new URL('../suites/crapi/crapi-baseline.json', import.meta.url), 'utf8'));

test('two real HTTP owner reads and anonymous denial produce evidence-backed PASS', async () => {
  const server = await lab();
  try {
    const adapter = createCrapiAdapter({ baseUrl: server.baseUrl, accounts });
    assert.equal((await adapter.ready()).ready, true);
    assert.equal(await adapter.validateActor('customer-a'), true);
    assert.equal(await adapter.validateActor('customer-b'), true);
    assert.equal(await adapter.validateActor('not-an-actor'), false);
    const run = await runSuite(suite, adapter, 'local-test', false);
    assert.equal(run.aggregateVerdict, 'PASS');
    assert.deepEqual(run.results.map(x => x.verdict), ['PASS', 'PASS', 'PASS']);
    assert.deepEqual(run.results.map(x => x.observed.status), [200, 200, 401]);
    assert.equal(JSON.stringify(run).includes('not-to-log'), false);
    assert.equal(JSON.stringify(run).includes('synthetic-token'), false);
  } finally { await server.close(); }
});

test('wrong independently configured VIN fails readiness closed', async () => {
  const server = await lab();
  try {
    const adapter = createCrapiAdapter({ baseUrl: server.baseUrl, accounts: {
      ...accounts, 'customer-b': { ...accounts['customer-b'], vin: 'WRONG-VIN' }
    } });
    assert.deepEqual(await adapter.ready(), { ready: false, reason: 'CRAPI_LOGIN_OR_INDEPENDENT_FIXTURE_CHECK_FAILED' });
    assert.equal(await adapter.validateActor('customer-a'), false);
  } finally { await server.close(); }
});

test('anonymous exposure of exact known private vehicle is a FAIL, not a PASS', async () => {
  const server = await lab({ anonymousLeaks: true });
  try {
    const adapter = createCrapiAdapter({ baseUrl: server.baseUrl, accounts });
    const run = await runSuite(suite, adapter, 'local-test', false);
    assert.equal(run.aggregateVerdict, 'FAIL');
    assert.equal(run.results[2].reasonCode, 'PRIVATE_FIXTURE_EXPOSED');
    assert.equal(run.results[2].observed.fixtureMatched, true);
  } finally { await server.close(); }
});

test('PATCH and unapproved operations cannot be resolved', async () => {
  const adapter = createCrapiAdapter({ accounts });
  await assert.rejects(() => adapter.resolve({ ...suite.cases[0], method: 'PATCH', mutationRef: 'anything' }));
  await assert.rejects(() => adapter.resolve({ ...suite.cases[0], operationRef: 'vehicle.modify' }));
  assert.deepEqual([...adapter.approvedPaths], ['/identity/api/v2/vehicle/vehicles']);
});

test('unconfigured adapter never pretends to be ready', async () => {
  const adapter = createCrapiAdapter({ accounts: {
    ...accounts, 'customer-b': { ...accounts['customer-b'], password: '' }
  } });
  assert.equal((await adapter.ready()).ready, false);
});

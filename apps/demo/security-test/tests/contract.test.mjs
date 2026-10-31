import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadGroceryTestPlan,publicTestPreview,validateTestPlan} from '../test-case-loader.mjs';

test('B: exact ordered G01–G12 plan loads and validates',async()=>{
  const p=await loadGroceryTestPlan();
  assert.deepEqual(p.cases.map(x=>x.id),Array.from({length:12},(_,i)=>`G${String(i+1).padStart(2,'0')}`));
  assert.equal(p.cases.filter(x=>x.request.method==='PATCH').length,8);
  assert.equal(p.cases.filter(x=>x.kind==='QA_FAULT').length,2);
  assert.equal(validateTestPlan(p),true);
});
test('B: statuses, owner guard and write readback requirements are specified',async()=>{
  const p=await loadGroceryTestPlan();const by=Object.fromEntries(p.cases.map(x=>[x.id,x]));
  assert.deepEqual(by.G02.expectedStatuses,[403]);
  assert.deepEqual(by.G03.expectedStatuses,[401]);
  assert.deepEqual(by.G10.request.jsonBody,{ownerUserId:'customer-b'});
  assert.deepEqual(by.G10.expectedStatuses,[400]);
  for(const c of p.cases.filter(x=>x.request.method==='PATCH')){
    assert.equal(c.requiresTrustedBeforeAfter,true,c.id);
    assert.equal(c.resetAfter,true,c.id);
  }
});
test('B: fault scenarios remain evidence-based and are not false PASS',async()=>{
  const p=await loadGroceryTestPlan();
  assert.equal(p.cases[10].expectedVerdictInScenario,'FAIL');
  assert.equal(p.cases[11].expectedVerdictInScenario,'INCONCLUSIVE');
  assert.match(p.cases[10].faultPrerequisite.mode,/controlled-regressed-backend/);
  assert.match(p.cases[11].faultPrerequisite.mode,/expire-private-session/);
});
test('B: invalid targets, unsafe writes and reordered IDs are rejected',async()=>{
  const p=await loadGroceryTestPlan();
  const unsafe=structuredClone(p);unsafe.cases[4].request.path='https://other.example/api/addresses/x';
  assert.throws(()=>validateTestPlan(unsafe),/Unsupported operation/);
  const noReset=structuredClone(p);noReset.cases[4].resetAfter=false;
  assert.throws(()=>validateTestPlan(noReset),/Write safety/);
  const changed=structuredClone(p);changed.cases[0].id='T1';
  assert.throws(()=>validateTestPlan(changed),/Invalid case/);
});
test('B: public preview contains no markers, private tokens, body or secrets',async()=>{
  const p=await loadGroceryTestPlan();const preview=publicTestPreview(p);
  assert.equal(preview.length,12);
  assert.equal(JSON.stringify(preview).includes('ADDRESS_A_TEST_MARKER'),false);
  assert.equal(JSON.stringify(preview).includes('jsonBody'),false);
  assert.equal(JSON.stringify(preview).includes('privateSessions'),false);
});

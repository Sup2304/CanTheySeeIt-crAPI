import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const DIR=new URL('../../suites/',import.meta.url);
const suites=await Promise.all(['grocery.g01-g10.json','grocery.g11-fault.json','grocery.g12-expiry.json'].map(async file=>JSON.parse(await readFile(new URL(file,DIR),'utf8'))));
const keys=['testId','actorRef','resourceRef','operationRef','method','expectation','requiredControls','acceptedDenialStatuses'];
const main=suites[0];
test('main suite contains exactly G01-G10, no changing verdicts in JSON',()=>{
  assert.equal(main.targetProfileId,'local-grocery-v1');
  assert.equal(main.confirmed,true);
  assert.deepEqual(main.cases.map(x=>x.testId),Array.from({length:10},(_,i)=>'G'+String(i+1).padStart(2,'0')));
  assert.ok(!JSON.stringify(main).includes('expectedVerdictInScenario'));
});
test('v2 schema matches strict confirmed SuiteSchema shape and prerequisite order',()=>{
  for(const suite of suites){
    assert.deepEqual(Object.keys(suite).sort(),['suiteId','title','originalRequirement','targetProfileId','confirmed','cases'].sort());
    assert.ok(suite.cases.length>=1&&suite.cases.length<=40);
    const seen=new Set();
    for(const item of suite.cases){
      assert.deepEqual(Object.keys(item).filter(k=>k!=='mutationRef').sort(),keys.sort());
      assert.ok(!seen.has(item.testId));
      assert.ok(item.requiredControls.every(k=>seen.has(k)));
      assert.ok(['GET','PATCH'].includes(item.method));
      assert.ok(['ALLOW','DENY'].includes(item.expectation));
      assert.ok(item.method==='GET'?!Object.hasOwn(item,'mutationRef'):typeof item.mutationRef==='string');
      assert.ok(item.acceptedDenialStatuses.every(x=>[400,401,403,404].includes(x)));
      if(item.actorRef!=='anonymous')assert.ok(!item.acceptedDenialStatuses.includes(401));
      seen.add(item.testId);
    }
  }
});
test('G10 requires explicitly patched 400 denial; G11 and G12 are isolated QA suites',()=>{
  assert.deepEqual(main.cases.find(x=>x.testId==='G10').acceptedDenialStatuses,[400]);
  assert.deepEqual(suites[1].cases.map(c=>c.testId),['G11']);
  assert.deepEqual(suites[2].cases.map(c=>c.testId),['G12']);
  assert.equal(suites[1].cases[0].mutationRef,'address.note.fault');
  assert.equal(suites[2].cases[0].method,'GET');
});

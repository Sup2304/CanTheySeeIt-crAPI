import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSproutStoneAdapter} from '../adapters/sprout-stone.adapter.ts';
import {runSuite} from '../src/engine.ts';
const adapter=createSproutStoneAdapter();
const suites=['sprout.g01-g10.json','sprout-known-vulnerabilities.json'];
for(const name of suites){
 const suite=JSON.parse(await readFile(new URL('../suites/'+name,import.meta.url),'utf8'));
 const run=await runSuite(suite,adapter,'sprout-vulnerable',true);
 console.log(`\n${suite.suiteId} => ${run.aggregateVerdict}`);
 for(const x of run.results)console.log(`${x.testId.padEnd(5)} ${x.verdict.padEnd(13)} ${x.reasonCode}`);
 assert.equal(run.results.length,suite.cases.length);
 assert.equal(run.haltedAfterCleanupFailure,false,'Fixture cleanup must always succeed');
 if(name==='sprout.g01-g10.json') assert.ok(run.results.every(r=>r.verdict==='PASS'),'Protected address/inventory checks must pass');
 else {
  assert.equal(run.aggregateVerdict,'FAIL','Known vulnerable lab must be detected');
  assert.equal(run.results.find(x=>x.testId==='S03').reasonCode,'PRIVATE_FIXTURE_EXPOSED');
  assert.equal(run.results.find(x=>x.testId==='S05').reasonCode,'UNAUTHORIZED_STATE_CHANGED');
 }
}
console.log('\nAll Sprout & Stone integration assertions passed.');

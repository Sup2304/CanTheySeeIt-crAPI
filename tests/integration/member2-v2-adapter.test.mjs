import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createV2GroceryAdapter } from '../../adapters/grocery.adapter.ts';

const initial={
  'address-a-101':{addressId:'address-a-101',ownerUserId:'customer-a',label:'Avery / Test Address',deliveryNote:'Leave with reception (synthetic)',privateMarker:'ADDRESS_A_TEST_MARKER_7K5N'},
  'address-b-102':{addressId:'address-b-102',ownerUserId:'customer-b',label:'Blake / Test Address',deliveryNote:'Call upon arrival (synthetic)',privateMarker:'ADDRESS_B_TEST_MARKER_P9Q4'},
  'sku-apple-01':{sku:'sku-apple-01',name:'Fresh Apples',priceInr:129,stockQuantity:42}
};
const tokens={'customer-a':'synthetic-a-session-abcdefghijklmnopqrstuvwxyz','customer-b':'synthetic-b-session-abcdefghijklmnopqrstuvwxyz','staff-1':'synthetic-staff-session-abcdefghijklmnopqrstuvwxyz'};
const roles={'customer-a':'customer','customer-b':'customer','staff-1':'inventory_staff'};
function makeFixtureSource(){
  let records=structuredClone(initial),expired=new Set(),prepareCount=0,resetCount=0;
  return {
    get prepareCount(){return prepareCount},get resetCount(){return resetCount},
    async prepareFixtures({approved}){assert.equal(approved,true);prepareCount++;records=structuredClone(initial);expired=new Set();return {privateProfile:{privateSessions:tokens}}},
    async inspectFixture({resourceId}){if(!records[resourceId])throw Error('unknown resource');return structuredClone(records[resourceId])},
    async resetFixtures({approved}){assert.equal(approved,true);resetCount++;records=structuredClone(initial);return {resetVerified:true}},
    async expireSyntheticActor({actorId}){expired.add(actorId);return {expired:true}},
    getRecord(id){return structuredClone(records[id])},
    setRecord(id,record){records[id]=record},
    isExpired(id){return expired.has(id)}
  };
}
function testcase(id,actorRef,resourceRef,operationRef,method,mutationRef){return {testId:id,actorRef,resourceRef,operationRef,method,expectation:'DENY',requiredControls:[],acceptedDenialStatuses:[403],...(mutationRef?{mutationRef}:{})};}
let server,port,source,adapter;
test.before(async()=>{
  source=makeFixtureSource();
  server=http.createServer((req,res)=>{
    const token=req.headers.authorization?.slice('Bearer '.length);
    const actor=Object.keys(tokens).find(k=>tokens[k]===token);
    if(req.url!=='/api/me'||!actor||source.isExpired(actor)){res.writeHead(401,{'content-type':'application/json'});res.end('{}');return;}
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({userId:actor,role:roles[actor]}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;
  adapter=createV2GroceryAdapter({baseUrl:`http://127.0.0.1:${port}/`,fixtureSource:source,setupApproved:true,enableG12Fault:true});
});
test.after(async()=>{await new Promise(r=>server.close(r))});
test('unapproved setup is NOT READY and does not call private prepare',async()=>{
  const disallowed=createV2GroceryAdapter({baseUrl:`http://127.0.0.1:${port}/`,fixtureSource:source,setupApproved:false});
  const before=source.prepareCount;assert.equal((await disallowed.ready()).ready,false);assert.equal(source.prepareCount,before);
});
test('preparation stores sessions server-side and validates exact actor roles',async()=>{
  assert.deepEqual(await adapter.ready(),{ready:true});
  for(const actor of Object.keys(tokens)){
    assert.equal(await adapter.validateActor(actor),true);
    assert.deepEqual(await adapter.authHeaders(actor),{Authorization:`Bearer ${tokens[actor]}`});
  }
  assert.equal(await adapter.validateActor('anonymous'),false);
  assert.equal(adapter.syntheticOnly,true);
  assert.equal(adapter.baseUrl,`http://127.0.0.1:${port}/`);
});
test('G01/G02 exact read path and private marker detection',async()=>{
  const a=testcase('G01','customer-a','address-a-101','address.read','GET');
  const b=testcase('G02','customer-b','address-a-101','address.read','GET');
  assert.deepEqual(await adapter.resolve(a),{path:'/api/addresses/address-a-101',method:'GET'});
  assert.equal(adapter.matchesProtectedFixture(a,source.getRecord('address-a-101')),true);
  assert.equal(adapter.matchesProtectedFixture(b,source.getRecord('address-a-101')),true);
  assert.equal(adapter.matchesProtectedFixture(b,{error:'Forbidden'}),false);
});
test('G04 allowed delivery note and G05 forbidden mutation use fixed payloads',async()=>{
  const g04=testcase('G04','customer-a','address-a-101','address.update','PATCH','address.note.own');
  const g05=testcase('G05','customer-b','address-a-101','address.update','PATCH','address.note.cross');
  const allowed=await adapter.resolve(g04),denied=await adapter.resolve(g05);
  assert.equal(allowed.body.deliveryNote,'CAN_THEY_SEE_IT_SYNTHETIC_ALLOWED_EDIT');
  assert.equal(denied.body.deliveryNote,'CAN_THEY_SEE_IT_SYNTHETIC_BLOCKED_EDIT');
  const before=await adapter.snapshot(g04);
  const after={...before,deliveryNote:allowed.body.deliveryNote};
  assert.deepEqual(adapter.compareState(g04,before,after),{changed:true,intendedChange:true});
  assert.deepEqual(adapter.compareState(g04,before,before),{changed:false,intendedChange:false});
  assert.deepEqual(adapter.compareState(g04,before,{...after,ownerUserId:'customer-b'}),{changed:true,intendedChange:false});
});
test('G07 inventory edit and G10 invalid owner reassignment are separated',async()=>{
  const staff=testcase('G07','staff-1','sku-apple-01','inventory.update','PATCH','inventory.quantity.17');
  const owner=testcase('G10','customer-a','address-a-101','address.update','PATCH','address.owner.reassign');
  assert.deepEqual(await adapter.resolve(staff),{path:'/api/products/sku-apple-01/inventory',method:'PATCH',body:{stockQuantity:17}});
  assert.deepEqual(await adapter.resolve(owner),{path:'/api/addresses/address-a-101',method:'PATCH',body:{ownerUserId:'customer-b'}});
  const before=await adapter.snapshot(owner);
  assert.deepEqual(adapter.compareState(owner,before,{...before,ownerUserId:'customer-b'}),{changed:true,intendedChange:false});
});
test('trusted cleanup restores exact original synthetic values',async()=>{
  const g04=testcase('G04','customer-a','address-a-101','address.update','PATCH','address.note.own');
  const before=await adapter.snapshot(g04);
  source.setRecord('address-a-101',{...before,deliveryNote:'changed'});
  await adapter.restore(g04,before);
  assert.deepEqual(await adapter.snapshot(g04),before);
  assert.ok(source.resetCount>=1);
});
test('G12 controlled expiry occurs only when explicitly enabled',async()=>{
  await adapter.ready();
  const g12=testcase('G12','customer-b','address-a-101','address.read','GET');
  assert.equal(await adapter.validateActor('customer-b'),true);
  assert.deepEqual(await adapter.resolve(g12),{path:'/api/addresses/address-a-101',method:'GET'});
  assert.equal(await adapter.validateActor('customer-b'),false);
});
test('unknown path, actor, mutation and non-loopback URL are rejected',async()=>{
  assert.rejects(()=>adapter.resolve(testcase('X','customer-b','/etc/passwd','address.read','GET')));
  assert.rejects(()=>adapter.resolve(testcase('X','customer-b','address-a-101','address.update','PATCH','unapproved')));
  assert.throws(()=>createV2GroceryAdapter({baseUrl:'https://example.org/',fixtureSource:source}));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createFixtureAdapter,validateLocalTarget} from '../fixture-adapter.mjs';

const PRIVATE_KEY='A'.repeat(64);
const baseline={
  'address-a-101':{addressId:'address-a-101',ownerUserId:'customer-a',label:'Avery / Test Address',deliveryNote:'Leave with reception (synthetic)',privateMarker:'ADDRESS_A_TEST_MARKER_7K5N'},
  'address-b-102':{addressId:'address-b-102',ownerUserId:'customer-b',label:'Blake / Test Address',deliveryNote:'Call upon arrival (synthetic)',privateMarker:'ADDRESS_B_TEST_MARKER_P9Q4'},
  'sku-apple-01':{sku:'sku-apple-01',name:'Fresh Apples',priceInr:129,stockQuantity:42},
  'sku-milk-02':{sku:'sku-milk-02',name:'Organic Milk',priceInr:85,stockQuantity:24},
  'sku-bread-03':{sku:'sku-bread-03',name:'Whole Wheat Bread',priceInr:65,stockQuantity:18},
};
const actors={
  'customer-a':{userId:'customer-a',role:'customer'},
  'customer-b':{userId:'customer-b',role:'customer'},
  'staff-1':{userId:'staff-1',role:'inventory_staff'},
};
function clone(x){return structuredClone(x)}
async function withMock(fn){
  let state=clone(baseline);
  let sessions={};
  const calls=[];
  let corruptReset=false;
  let prepareCount=0;
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    calls.push({path:url.pathname,headers:req.headers});
    let body={};
    if(req.method==='POST'){
      let raw='';for await(const ch of req)raw+=ch;
      try{body=JSON.parse(raw)}catch{}
    }
    function reply(status,value){res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));}
    if(url.pathname.startsWith('/__test/fixtures/')){
      if(req.method!=='POST' || req.headers['x-grocery-adapter-key']!==PRIVATE_KEY) return reply(404,{error:'unavailable'});
      if(url.pathname==='/__test/fixtures/prepare'){
        if(body.confirmed!==true||req.headers['x-test-setup-approved']!=='true')return reply(400,{error:'approval'});
        state=clone(baseline);prepareCount++;sessions={};
        for(const id of Object.keys(actors)) sessions[id]=`private-demo-session-${id}-${'z'.repeat(40)}-${prepareCount}`;
        return reply(200,{fixtureVersion:'grocery-fixtures-v1',users:actors,
          resources:{addresses:{'address-a-101':state['address-a-101'],'address-b-102':state['address-b-102']},products:{'sku-apple-01':state['sku-apple-01'],'sku-milk-02':state['sku-milk-02'],'sku-bread-03':state['sku-bread-03']}},sessionTokens:sessions});
      }
      if(url.pathname==='/__test/fixtures/inspect')return state[body.resourceId]?reply(200,{resource:state[body.resourceId]}):reply(404,{error:'unknown'});
      if(url.pathname==='/__test/fixtures/reset'){
        if(body.confirmed!==true||req.headers['x-test-setup-approved']!=='true')return reply(400,{error:'approval'});
        state=clone(baseline);
        if(corruptReset)state['sku-apple-01'].stockQuantity=999;
        return reply(200,{restored:true});
      }
      if(url.pathname==='/__test/fixtures/expire'){
        delete sessions[body.actorId];return reply(200,{expired:true,actorId:body.actorId});
      }
      return reply(404,{error:'unsupported'});
    }
    const token=(req.headers.authorization||'').replace(/^Bearer /,'');
    const actorId=Object.keys(sessions).find(id=>sessions[id]===token);
    if(url.pathname==='/api/me')return actorId?reply(200,actors[actorId]):reply(401,{error:'no-session'});
    if(url.pathname.startsWith('/api/addresses/')){
      if(!actorId)return reply(401,{error:'no-session'});
      const addr=state[url.pathname.split('/').at(-1)];
      if(!addr)return reply(404,{error:'not-found'});
      return addr.ownerUserId===actorId?reply(200,addr):reply(403,{error:'owner-required'});
    }
    return reply(404,{error:'not-found'});
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=server.address().port;
  const adapter=createFixtureAdapter({baseUrl:`http://127.0.0.1:${port}`,keyProvider:()=>PRIVATE_KEY});
  try{await fn({adapter,calls,getState:()=>state,setCorruptReset:x=>{corruptReset=x},getPrepareCount:()=>prepareCount})}
  finally{server.close();await once(server,'close')}
}

test('C: localhost allowlist forbids remote, non-http and ambiguous URLs',()=>{
  assert.equal(validateLocalTarget('http://127.0.0.1:4000'),'http://127.0.0.1:4000');
  for(const url of ['https://127.0.0.1:4000','http://localhost:4000','http://127.0.0.1:4000/x',
    'http://127.0.0.1:4000?x=1','http://example.com:4000','http://127.0.0.1:99'])
    assert.throws(()=>validateLocalTarget(url),/Only an exact/);
});
test('C: prepare and reset require explicit opt-in BEFORE any network request',async()=>withMock(async({adapter,calls})=>{
  await assert.rejects(adapter.prepareFixtures(),/Explicit approval/);
  await assert.rejects(adapter.resetFixtures(),/Explicit approval/);
  assert.equal(calls.length,0);
}));
test('C: trusted preparation checks all 3 actor roles, ownership, stock baseline',async()=>withMock(async({adapter,calls})=>{
  const {privateProfile,publicSummary}=await adapter.prepareFixtures({approved:true});
  assert.equal(privateProfile.readiness.ready,true);
  assert.equal(privateProfile.readiness.identities['customer-a'].identityValid,true);
  assert.equal(privateProfile.readiness.identities['staff-1'].role,'inventory_staff');
  assert.equal(publicSummary.testCredentialsExposed,false);
  assert.equal(publicSummary.provenance,'adapter-declared');
  const publicJson=JSON.stringify(publicSummary);
  assert.ok(!publicJson.includes('private-demo-session'));
  assert.ok(!publicJson.includes('PRIVATE_MARKER'));
  assert.ok(!publicJson.includes('ADDRESS_A_TEST_MARKER'));
  assert.ok(Object.keys(privateProfile.privateSessions).length===3);
  assert.equal(calls.filter(x=>x.path==='/api/me').length,3);
  assert.equal(calls.filter(x=>x.path==='/__test/fixtures/inspect').length,5);
}));
test('C: repeated prepare restores baseline and rotates private session strings',async()=>withMock(async({adapter,getState,getPrepareCount})=>{
  const one=await adapter.prepareFixtures({approved:true});
  getState()['address-a-101'].deliveryNote='temp mutated note';
  const two=await adapter.prepareFixtures({approved:true});
  assert.equal(getPrepareCount(),2);
  assert.equal(getState()['address-a-101'].deliveryNote,baseline['address-a-101'].deliveryNote);
  assert.notEqual(one.privateProfile.privateSessions['customer-a'],two.privateProfile.privateSessions['customer-a']);
}));
test('C: trusted inspection detects changed fields even on forbidden writes',async()=>withMock(async({adapter,getState})=>{
  await adapter.prepareFixtures({approved:true});
  const before=await adapter.inspectFixture({type:'address',resourceId:'address-a-101'});
  getState()['address-a-101'].deliveryNote='unauthorized change in test-only mock';
  const after=await adapter.inspectFixture({type:'address',resourceId:'address-a-101'});
  assert.notDeepEqual(before,after);
  assert.notEqual(before.deliveryNote,after.deliveryNote);
}));
test('C: reset validates entire baseline and surfaces corrupted cleanup',async()=>withMock(async({adapter,getState,setCorruptReset})=>{
  await adapter.prepareFixtures({approved:true});
  getState()['sku-apple-01'].stockQuantity=17;
  assert.deepEqual(await adapter.resetFixtures({approved:true}),{resetVerified:true,fixtureVersion:'grocery-fixtures-v1'});
  setCorruptReset(true);
  await assert.rejects(adapter.resetFixtures({approved:true}),/reset verification FAILED/);
}));
test('C: synthetic actor expiration is private and bounded',async()=>withMock(async({adapter})=>{
  const {privateProfile}=await adapter.prepareFixtures({approved:true});
  const token=privateProfile.privateSessions['customer-b'];
  const url='http://127.0.0.1';
  await assert.rejects(adapter.expireSyntheticActor({actorId:'root-admin'}),/known synthetic actor/);
  assert.deepEqual(await adapter.expireSyntheticActor({actorId:'customer-b'}),{expired:true,actorRef:'customer-b'});
  assert.ok(token.length>20);
}));

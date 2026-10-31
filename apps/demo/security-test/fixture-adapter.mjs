/**
 * Snehal / Member 2: TRUSTED LOCAL FIXTURE ADAPTER, not Suprita's HTTP verifier.
 * Integration target: the existing GoodBasket apps/demo test-only fixture endpoints.
 * No dependency on the website UI or the site's internal source modules.
 * DO NOT import this into the browser or serialize privateProfile in API responses.
 */
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const DEFAULT_KEY_FILE = fileURLToPath(new URL('../.runtime/adapter-key', import.meta.url));
const ACTOR_IDS = Object.freeze(['customer-a','customer-b','staff-1']);
const ADDRESS_IDS = Object.freeze(['address-a-101','address-b-102']);
const PRODUCT_IDS = Object.freeze(['sku-apple-01','sku-milk-02','sku-bread-03']);
const ALL_IDS = Object.freeze([...ADDRESS_IDS,...PRODUCT_IDS]);

export const fixtureManifest = Object.freeze({
  projectId:'local-grocery-v1', adapterId:'grocery-fixture-adapter-v1',
  fixtureVersion:'grocery-fixtures-v1', provenance:'adapter-declared',
  approvedEnvironment:'synthetic-local-only',
  routes:Object.freeze([
    {method:'GET',path:'/api/me',provenance:'adapter-declared'},
    {method:'GET',path:'/api/addresses/:addressId',provenance:'adapter-declared'},
    {method:'PATCH',path:'/api/addresses/:addressId',provenance:'adapter-declared'},
    {method:'GET',path:'/api/products/:sku',provenance:'adapter-declared'},
    {method:'PATCH',path:'/api/products/:sku/inventory',provenance:'adapter-declared'}
  ]),
  actorRefs:Object.freeze([...ACTOR_IDS,'anonymous']),
  resourceRefs:Object.freeze(ALL_IDS),
});

const BASELINES = Object.freeze({
  'address-a-101':Object.freeze({addressId:'address-a-101',ownerUserId:'customer-a',label:'Avery / Test Address',deliveryNote:'Leave with reception (synthetic)',privateMarker:'ADDRESS_A_TEST_MARKER_7K5N'}),
  'address-b-102':Object.freeze({addressId:'address-b-102',ownerUserId:'customer-b',label:'Blake / Test Address',deliveryNote:'Call upon arrival (synthetic)',privateMarker:'ADDRESS_B_TEST_MARKER_P9Q4'}),
  'sku-apple-01':Object.freeze({sku:'sku-apple-01',name:'Fresh Apples',priceInr:129,stockQuantity:42}),
  'sku-milk-02':Object.freeze({sku:'sku-milk-02',name:'Organic Milk',priceInr:85,stockQuantity:24}),
  'sku-bread-03':Object.freeze({sku:'sku-bread-03',name:'Whole Wheat Bread',priceInr:65,stockQuantity:18}),
});

export function validateLocalTarget(value) {
  let parsed;
  try {parsed=new URL(value);} catch {throw new Error('Target must be an absolute local URL');}
  if(parsed.protocol!=='http:' || parsed.hostname!=='127.0.0.1' ||
    !/^\d{4,5}$/.test(parsed.port) || Number(parsed.port)<1024 || Number(parsed.port)>65535 ||
    parsed.pathname!=='/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error('Only an exact http://127.0.0.1:<port>/ local test target is allowed');
  }
  return parsed.origin;
}

function verifySnapshot(type,id,record) {
  if(!record || typeof record!=='object' || Array.isArray(record)) throw new Error('Trusted snapshot is absent or invalid');
  const key=type==='address'?'addressId':'sku';
  if(record[key]!==id) throw new Error('Trusted snapshot resource ID mismatch');
  return structuredClone(record);
}

function verifyBaseline(id,record) {
  const expected=BASELINES[id];
  if(!expected) throw new Error('Unknown baseline ref');
  if(Object.keys(expected).length!==Object.keys(record).length ||
     Object.entries(expected).some(([k,v])=>record[k]!==v)) {
    throw new Error('Synthetic reset verification FAILED for '+id);
  }
}

function nonSecretProfileSummary(result) {
  return {
    targetProfileId:'local-grocery-v1',projectId:'local-grocery-v1',
    fixtureVersion:'grocery-fixtures-v1', ready:true,
    actorRefs:[...ACTOR_IDS,'anonymous'],
    resourceRefs:{addresses:[...ADDRESS_IDS],products:[...PRODUCT_IDS]},
    provenance:'adapter-declared',
    testCredentialsExposed:false,
  };
}

/**
 * @param {{baseUrl?:string,keyFile?:string,keyProvider?:()=>Promise<string>|string,
 *   fetchImpl?:typeof fetch,timeoutMs?:number}} options
 */
export function createFixtureAdapter({
  baseUrl='http://127.0.0.1:4000/',
  keyFile=DEFAULT_KEY_FILE,
  keyProvider,
  fetchImpl=globalThis.fetch,
  timeoutMs=2500,
}={}) {
  const origin=validateLocalTarget(baseUrl);
  if(typeof fetchImpl!=='function') throw new Error('fetch is required (Node 22+)');
  if(!Number.isInteger(timeoutMs) || timeoutMs<250 || timeoutMs>10000)
    throw new Error('timeoutMs must be within 250..10000');

  async function privateKey() {
    const value=keyProvider ? await keyProvider() : (await readFile(keyFile,'utf8')).trim();
    if(typeof value!=='string' || value.length<48 || /[\r\n]/.test(value))
      throw new Error('Trusted fixture key missing or invalid');
    return value;
  }
  async function postPrivate(endpoint,payload,approved=false) {
    const key=await privateKey();
    let response;
    try {
      response=await fetchImpl(origin+endpoint,{
        method:'POST',redirect:'manual',signal:AbortSignal.timeout(timeoutMs),
        headers:{'content-type':'application/json','x-grocery-adapter-key':key,
          ...(approved?{'x-test-setup-approved':'true'}:{})},
        body:JSON.stringify(payload)
      });
    }catch {throw new Error('Trusted fixture endpoint unavailable (no session or secret details logged)');}
    if(response.status!==200) throw new Error(`Trusted fixture endpoint returned HTTP ${response.status}`);
    try {return await response.json();}catch {throw new Error('Malformed trusted fixture response');}
  }
  async function authorizedRead(path,sessionToken) {
    let response;
    try {
      response=await fetchImpl(origin+path,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(timeoutMs),
        headers:{authorization:'Bearer '+sessionToken}});
    }catch {throw new Error('Fixture readiness HTTP request failed');}
    if(response.status!==200) throw new Error(`Fixture readiness GET returned HTTP ${response.status}`);
    try {return await response.json();}catch {throw new Error('Invalid fixture readiness JSON');}
  }
  async function inspectFixture({type,resourceId}={}) {
    if(!['address','product'].includes(type) ||
      !(type==='address'?ADDRESS_IDS:PRODUCT_IDS).includes(resourceId))
      throw new Error('Fixture inspection is restricted to known synthetic records');
    const result=await postPrivate('/__test/fixtures/inspect',{type,resourceId});
    return verifySnapshot(type,resourceId,result?.resource);
  }
  async function assertCleanFixtureBaseline() {
    for(const id of ALL_IDS) {
      const type=ADDRESS_IDS.includes(id)?'address':'product';
      const record=await inspectFixture({type,resourceId:id});
      verifyBaseline(id,record);
    }
    return true;
  }
  async function prepareFixtures({approved=false}={}) {
    if(approved!==true) throw new Error('Explicit approval to prepare disposable synthetic fixtures is required');
    const result=await postPrivate('/__test/fixtures/prepare',{confirmed:true},true);
    if(result?.fixtureVersion!==fixtureManifest.fixtureVersion ||
       !result.sessionTokens || !result.users || !result.resources?.addresses || !result.resources?.products) {
      throw new Error('Trusted fixture prepare returned incomplete or wrong-version data');
    }
    const identities={};
    for(const id of ACTOR_IDS) {
      const token=result.sessionTokens[id];
      if(typeof token!=='string' || token.length<20 || typeof result.users[id]?.role!=='string')
        throw new Error('Missing synthetic session or actor metadata');
      const me=await authorizedRead('/api/me',token);
      const expectedRole=id==='staff-1'?'inventory_staff':'customer';
      if(me.userId!==id || me.role!==expectedRole || result.users[id].role!==expectedRole)
        throw new Error('Session actor/role readiness mismatch');
      if(id!=='staff-1') {
        const addressId=id==='customer-a'?'address-a-101':'address-b-102';
        const own=await authorizedRead('/api/addresses/'+addressId,token);
        if(own.addressId!==addressId || own.ownerUserId!==id ||
           own.privateMarker!==BASELINES[addressId].privateMarker) {
          throw new Error('Synthetic ownership/marker readiness failed');
        }
      }
      identities[id]={identityValid:true,role:expectedRole,ownResourceValid:true};
    }
    // Independent trusted read back ensures our fixture baseline is actually present.
    await assertCleanFixtureBaseline();
    const privateProfile={
      targetProfileId:'local-grocery-v1',projectId:'local-grocery-v1',
      fixtureVersion:fixtureManifest.fixtureVersion,baseUrl:origin,
      routes:fixtureManifest.routes,actors:structuredClone(result.users),
      resources:structuredClone(result.resources),
      privateSessions:structuredClone(result.sessionTokens),
      readiness:{ready:true,identities},provenance:'adapter-declared'
    };
    return {privateProfile,publicSummary:nonSecretProfileSummary(result)};
  }
  async function resetFixtures({approved=false}={}) {
    if(approved!==true) throw new Error('Explicit approval to reset disposable synthetic fixtures is required');
    const result=await postPrivate('/__test/fixtures/reset',{confirmed:true},true);
    if(result?.restored!==true) throw new Error('Reset endpoint did not report restoration');
    await assertCleanFixtureBaseline();
    return {resetVerified:true,fixtureVersion:fixtureManifest.fixtureVersion};
  }
  async function expireSyntheticActor({actorId}={}) {
    if(!ACTOR_IDS.includes(actorId)) throw new Error('Can only expire a known synthetic actor');
    const result=await postPrivate('/__test/fixtures/expire',{actorId});
    if(result?.expired!==true || result.actorId!==actorId)
      throw new Error('Fixture session expiration not confirmed');
    return {expired:true,actorRef:actorId};
  }
  return Object.freeze({
    manifest:fixtureManifest,
    prepareFixtures,inspectFixture,resetFixtures,expireSyntheticActor,assertCleanFixtureBaseline,
  });
}

// Named compatibility export for Suprita's backend integration.
export const createGroceryAdapter=createFixtureAdapter;

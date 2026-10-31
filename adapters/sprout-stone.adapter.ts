/** Trusted synthetic-only adapter for the locally owned Sprout & Stone training lab.
 * No dynamic host/path input is accepted from API callers.
 */
import { isDeepStrictEqual } from 'node:util';
import type { TargetAdapter } from '../src/adapter.ts';
import type { TestCase } from '../src/contracts.ts';

type Obj = Record<string, unknown>;
const users = {
  owner: {email:'owner@sprout.local',password:'OwnerDemo!26',role:'owner'},
  'customer-a': {email:'alice@sprout.local',password:'AppleA!26',role:'customer'},
  'customer-b': {email:'bob@sprout.local',password:'BerryB!26',role:'customer'}
} as const;
type Actor = keyof typeof users;
const known: Record<string,{kind:'address'|'order'|'inventory'|'settings',owner?:string,marker?:string}> = {
  'address-a-101': {kind:'address',owner:'customer-a',marker:'ADDRESS_A_PRIVATE_84A1'},
  'address-b-102': {kind:'address',owner:'customer-b',marker:'ADDRESS_B_PRIVATE_57B3'},
  'order-a-1001': {kind:'order',owner:'customer-a',marker:'ORDER_A_PRIVATE_71C9'},
  'order-b-1002': {kind:'order',owner:'customer-b',marker:'ORDER_B_PRIVATE_48D2'},
  'apple-01': {kind:'inventory'},
  'shop-settings': {kind:'settings'}
};
const mutations: Record<string,Obj> = Object.freeze({
  'address.own.note': {deliveryNote:'TEST_APPROVED_NOTE_SPROUT_26'},
  'address.denied.note': {deliveryNote:'TEST_DENIED_NOTE_SPROUT_26'},
  'address.owner.reassign': {ownerUserId:'customer-b'},
  'inventory.quantity': {stock:17},
  'shop.owner.edit': {supportEmail:'owner-reviewed-synthetic@sprout.local'},
  'shop.denied.edit': {supportEmail:'unauthorised-lab-edit@sprout.local'}
});
const operations = {
  'address.read': {kind:'address',method:'GET'},
  'address.update': {kind:'address',method:'PATCH'},
  'order.read': {kind:'order',method:'GET'},
  'inventory.update': {kind:'inventory',method:'PATCH'},
  'shop.settings.update': {kind:'settings',method:'PATCH'}
} as const;
function object(v:unknown):v is Obj {return !!v && typeof v==='object' && !Array.isArray(v);}
function checkRecord(test:TestCase) {
 const info=known[test.resourceRef];
 if (!info) throw new Error('UNKNOWN_SYNTHETIC_RESOURCE');
 const op=operations[test.operationRef as keyof typeof operations];
 if (!op || op.kind!==info.kind || op.method!==test.method) throw new Error('UNAPPROVED_OPERATION');
 return info;
}
function routeFor(test:TestCase):string {
 const info=checkRecord(test);
 switch(info.kind){
 case 'address': return `/api/addresses/${test.resourceRef}`;
 case 'order': return `/api/orders/${test.resourceRef}`;
 case 'inventory': return `/api/products/${test.resourceRef}/inventory`;
 case 'settings':return '/api/shop/settings';
 }
}
function snapshotRoute(test:TestCase):string {
 const info=checkRecord(test);
 switch(info.kind){
 case 'address':return `/api/addresses/${test.resourceRef}`;
 case 'inventory':return `/api/products/${test.resourceRef}`;
 case 'settings':return '/api/shop/settings';
 case 'order':throw new Error('ORDER_SNAPSHOT_UNSUPPORTED');
 }
}
function parseSnapshot(test:TestCase, data:unknown):Obj {
 const info=checkRecord(test);
 if (!object(data)) throw new Error('BAD_SNAPSHOT');
 const value = info.kind==='address'?data.address:info.kind==='settings'?data.settings:data;
 if (!object(value)) throw new Error('BAD_SNAPSHOT');
 if (info.kind==='address'){
  if(value.addressId!==test.resourceRef||value.ownerUserId!==info.owner||value.privateMarker!==info.marker)
    throw new Error('FIXTURE_MISMATCH');
 }else if(info.kind==='inventory' && value.sku!==test.resourceRef) throw new Error('FIXTURE_MISMATCH');
 return structuredClone(value);
}
/** All HTTP calls use this fixed loopback origin and bounded, no-redirect requests. */
export function createSproutStoneAdapter():TargetAdapter {
 const port = Number(process.env.SPROUT_PORT ?? 4200);
 if (!Number.isInteger(port)||port!==4200) throw new Error('SPROUT_PORT must be 4200');
 const base = `http://127.0.0.1:${port}/`;
 const sessions:Partial<Record<Actor,string>> = {};
 let ready=false;
 let baseline:Record<string,Obj> = {};
 async function request(path:string, opts:{method?:'GET'|'POST'; actor?:Actor; body?:unknown}={}) {
  // All private authentication/session calls use static paths constructed in this adapter.
  const r = await fetch(new URL(path,base),{
   method:opts.method??'GET',redirect:'manual',signal:AbortSignal.timeout(2500),
   headers:{Accept:'application/json',...(opts.actor && sessions[opts.actor]?{Authorization:`Bearer ${sessions[opts.actor]}`}:{ }),...(opts.body!==undefined?{'Content-Type':'application/json'}:{})},
   body:opts.body===undefined?undefined:JSON.stringify(opts.body)
  });
  if (r.status>=300 && r.status<400) throw new Error('REDIRECT_BLOCKED');
  const json:unknown=await r.json();
  return {status:r.status,data:json};
 }
 async function validatedActor(actor:Actor) {
  const result=await request('/api/me',{actor});
  return result.status===200 && object(result.data) && result.data.userId===actor && result.data.role===users[actor].role;
 }
 async function trustedSnapshot(test:TestCase):Promise<Obj> {
  const info=checkRecord(test);
  const trusted = info.kind==='address' ? info.owner as Actor : info.kind==='settings'?'owner': undefined;
  const r=await request(snapshotRoute(test),trusted?{actor:trusted}:{});
  if(r.status!==200) throw new Error('TRUSTED_READBACK_UNAVAILABLE');
  return parseSnapshot(test,r.data);
 }
 const approvedPaths = new Set<string>([
  '/api/addresses/address-a-101','/api/addresses/address-b-102',
  '/api/orders/order-a-1001','/api/orders/order-b-1002',
  '/api/products/apple-01/inventory','/api/shop/settings'
 ]);
 return {
  id:'sprout-stone-local-grocery-lab',baseUrl:base,syntheticOnly:true,
  fixtureRevision:'sprout-stone-seeded-v1', approvedPaths,
  async ready(){
   ready=false;
   baseline={};
   for(const key of Object.keys(users) as Actor[]) delete sessions[key];
   try {
    const health=await request('/api/health');
    if (health.status!==200||!object(health.data)||health.data.app!=='sprout-stone-grocery-lab')throw new Error('WRONG_TARGET');
    for(const [actor, credentials] of Object.entries(users) as [Actor,typeof users[Actor]][]){
     const result=await request('/api/auth/token',{method:'POST',body:{email:credentials.email,password:credentials.password}});
     if(result.status!==200||!object(result.data)||typeof result.data.token!=='string'||result.data.token.length<20)throw new Error('LOGIN_FAILED');
     sessions[actor]=result.data.token;
     if(!await validatedActor(actor))throw new Error('IDENTITY_MISMATCH');
    }
    // Verify actual owner access/known private markers and clean snapshot baseline BEFORE doing any write.
    for(const id of ['address-a-101','address-b-102','apple-01','shop-settings']){
     const info=known[id];
     const test: TestCase={testId:'baseline',actorRef:'owner',resourceRef:id,
      operationRef:info.kind==='address'?'address.read':info.kind==='inventory'?'inventory.update':'shop.settings.update',
      method:info.kind==='address'?'GET':'PATCH',expectation:'ALLOW',requiredControls:[],acceptedDenialStatuses:[],
      ...(info.kind==='address'?{}:{mutationRef:info.kind==='inventory'?'inventory.quantity':'shop.owner.edit'})};
     baseline[id]=await trustedSnapshot(test);
    }
    if(baseline['address-a-101'].deliveryNote!=='Please ring the bell'||
       baseline['address-b-102'].deliveryNote!=='Leave at the front desk'||
       baseline['apple-01'].stock!==37||
       baseline['shop-settings'].supportEmail!=='hello@sprout.local')throw new Error('DIRTY_FIXTURE');
    ready=true;
    return {ready:true};
   }catch{return {ready:false,reason:'SPROUT_LOCAL_APP_NOT_READY_OR_FIXTURE_DIRTY'};}
  },
  async validateActor(actorRef){
   if(!ready || !(actorRef in users))return false;
   try{return await validatedActor(actorRef as Actor);}catch{return false;}
  },
  async authHeaders(actorRef){
   if(!ready||!(actorRef in users)||!sessions[actorRef as Actor])throw new Error('INVALID_ACTOR_REF');
   return {Authorization:`Bearer ${sessions[actorRef as Actor]}`};
  },
  async resolve(test){
   const path=routeFor(test);
   if(!approvedPaths.has(path))throw new Error('PATH_NOT_APPROVED');
   if(test.method==='GET')return {path,method:'GET'};
   const mutation=test.mutationRef?mutations[test.mutationRef]:undefined;
   if(!mutation) throw new Error('UNKNOWN_MUTATION');
   const kind=known[test.resourceRef].kind;
   if ((kind==='address'&&!test.mutationRef?.startsWith('address.'))||
    (kind==='inventory'&&!test.mutationRef?.startsWith('inventory.'))||
    (kind==='settings'&&!test.mutationRef?.startsWith('shop.'))) throw new Error('MUTATION_RESOURCE_MISMATCH');
   return {path,method:'PATCH',body:structuredClone(mutation)};
  },
  matchesProtectedFixture(test,body){
   const info=checkRecord(test);
   if (!info.marker||!object(body))return false;
   const record = info.kind==='address'?body.address:info.kind==='order'?body.order:null;
   if(!object(record))return false;
   const idKey=info.kind==='address'?'addressId':'orderId';
   return record[idKey]===test.resourceRef&&record.ownerUserId===info.owner&&record.privateMarker===info.marker;
  },
  async snapshot(test){return trustedSnapshot(test);},
  compareState(test,before,after){
   if(!object(before)||!object(after)) throw new Error('UNTRUSTED_STATE');
   const info=checkRecord(test);
   const key=info.kind==='address'?'addressId':info.kind==='inventory'?'sku':'storeName';
   if(before[key]!==after[key])throw new Error('WRONG_SNAPSHOT_RESOURCE');
   const changed=!isDeepStrictEqual(before,after);
   const mutation=test.mutationRef?mutations[test.mutationRef]:undefined;
   const expected=mutation?{...before,...mutation}:undefined;
   return {changed,intendedChange:changed && Boolean(expected && isDeepStrictEqual(expected,after))};
  },
  async restore(test,original){
   if (!object(original))throw new Error('CANNOT_RESTORE_UNKNOWN_STATE');
   // Fixed trusted reset is safe because this local training lab starts from known disposable seeds.
   const reset=await request('/api/lab/reset',{method:'POST',actor:'owner',body:{}});
   if(reset.status!==200||!object(reset.data)||reset.data.ok!==true)throw new Error('RESET_FAILED');
   const after=await trustedSnapshot(test);
   if(!isDeepStrictEqual(original,after))throw new Error('RESET_VERIFICATION_FAILED');
  }
 };
}

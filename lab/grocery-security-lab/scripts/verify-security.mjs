// Authorised local synthetic-only checker: safe to run repeatedly.
// Always resets the owner-owned lab fixtures after checking the admin edit.
const base = process.env.GROCERY_LAB_URL || 'http://127.0.0.1:4000';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) {
  console.error('Refusing non-loopback target. Run against your own local synthetic grocery lab.');
  process.exit(2);
}
const accounts = [
  { id: 'owner', email: 'owner@sprout.local', password: 'OwnerDemo!26' },
  { id: 'customer-a', email: 'alice@sprout.local', password: 'AppleA!26' },
  { id: 'customer-b', email: 'bob@sprout.local', password: 'BerryB!26' }
];
async function call(path, opts={}) {
  const r=await fetch(base+path,{...opts,headers:{'content-type':'application/json',...(opts.headers||{})},signal:AbortSignal.timeout(3500),redirect:'manual'});
  const data=await r.json();
  return { status:r.status, data };
}
const bearer = token => ({ Authorization:'Bearer '+token });
const results=[];
let ownerToken;
try {
  const health=await call('/api/health');
  if(health.status!==200)throw new Error('Lab health unavailable');
  const tokens={};
  for(const acc of accounts){
    const r=await call('/api/auth/token',{method:'POST',body:JSON.stringify({email:acc.email,password:acc.password})});
    if(r.status!==200||!r.data.token)throw new Error('Cannot prepare synthetic '+acc.id);
    const me=await call('/api/me',{headers:bearer(r.data.token)});
    if(me.status!==200||me.data.userId!==acc.id)throw new Error('Invalid identity for '+acc.id);
    tokens[acc.id]=r.data.token;
  }
  ownerToken=tokens.owner;
  const own=await call('/api/orders/order-a-1001',{headers:bearer(tokens['customer-a'])});
  results.push({name:'A can read own order',status:own.status===200&&own.data.order?.ownerUserId==='customer-a'?'PASS':'INCONCLUSIVE',httpStatus:own.status});
  const foreign=await call('/api/orders/order-b-1002',{headers:bearer(tokens['customer-a'])});
  const isLeak=foreign.status===200&&foreign.data.order?.ownerUserId==='customer-b'&&foreign.data.order?.privateMarker==='ORDER_B_PRIVATE_48D2';
  results.push({name:'Customer A must not read Customer B order',status:isLeak?'FAIL':foreign.status===403?'PASS':'INCONCLUSIVE',httpStatus:foreign.status,confirmedLeak:isLeak});
  const before=await call('/api/shop/settings',{headers:bearer(ownerToken)});
  if(before.status!==200)throw new Error('Owner cannot read shop settings');
  const original=before.data.settings.supportEmail;
  const attempt=await call('/api/shop/settings',{method:'PATCH',headers:bearer(tokens['customer-b']),body:JSON.stringify({supportEmail:'unauthorised-lab-edit@sprout.local'})});
  const after=await call('/api/shop/settings',{headers:bearer(ownerToken)});
  const changed=after.data.settings?.supportEmail!==original;
  results.push({name:'Customer B must not edit shopkeeper settings',status:changed?'FAIL':attempt.status===403?'PASS':'INCONCLUSIVE',httpStatus:attempt.status,unauthorisedChange:changed});
  const reset=await call('/api/lab/reset',{method:'POST',headers:bearer(ownerToken),body:'{}'});
  if(reset.status!==200)throw new Error('Fixture reset failed');
  const overall=results.some(x=>x.status==='FAIL')?'FAIL':results.some(x=>x.status==='INCONCLUSIVE')?'INCONCLUSIVE':'PASS';
  console.log('\nSprout & Stone — live authorization evidence\n');
  for(const item of results)console.log(`  ${item.status.padEnd(13)} ${item.name} (HTTP ${item.httpStatus})`);
  console.log(`\n  AGGREGATE: ${overall}\n  Synthetic fixtures restored.\n`);
  // This script intentionally succeeds if it found vulnerabilities: detection is not a QA test failure.
  process.exitCode=overall==='INCONCLUSIVE'?1:0;
} catch(e){
  console.error('INCONCLUSIVE: unable to complete valid evidence-based checks:',e.message);
  if(ownerToken){try{await call('/api/lab/reset',{method:'POST',headers:bearer(ownerToken),body:'{}'});}catch{console.error('WARNING: reset failed; restart the local server to clear synthetic state.');}}
  process.exitCode=1;
}

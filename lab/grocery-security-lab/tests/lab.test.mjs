import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.mjs';

async function withServer(fn) {
  const server=createApp().listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function api(path,opts={}) {
    const res=await fetch(base+path,{...opts,headers:{'content-type':'application/json',...(opts.headers||{})},redirect:'manual'});
    const data=res.headers.get('content-type')?.includes('application/json')?await res.json():await res.text();
    return {status:res.status,data,headers:res.headers};
  }
  try{ await fn({api,base});}finally{ await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve())); }
}
async function tokens(api){
  const credentials={owner:['owner@sprout.local','OwnerDemo!26'],a:['alice@sprout.local','AppleA!26'],b:['bob@sprout.local','BerryB!26']};
  const out={};
  for(const [key,[email,password]] of Object.entries(credentials)){
    const r=await api('/api/auth/token',{method:'POST',body:JSON.stringify({email,password})});
    assert.equal(r.status,200);out[key]=r.data.token;
  }
  return out;
}
const auth = token => ({Authorization:'Bearer '+token});
const patch=(payload,token)=>({method:'PATCH',headers:auth(token),body:JSON.stringify(payload)});

test('full storefront HTML and health endpoint are available locally',()=>withServer(async({api})=>{
  assert.equal((await api('/api/health')).status,200);
  const html=await api('/');assert.equal(html.status,200);
  assert.ok(html.data.includes('sprout &amp; stone')||html.data.includes('sprout <b>&</b> stone'));
}));

test('sessions distinguish owner, customer A, customer B and anonymous users',()=>withServer(async({api})=>{
  const t=await tokens(api);
  assert.equal((await api('/api/me',{headers:auth(t.owner)})).data.role,'owner');
  assert.equal((await api('/api/me',{headers:auth(t.a)})).data.userId,'customer-a');
  assert.equal((await api('/api/me',{headers:auth(t.b)})).data.userId,'customer-b');
  assert.equal((await api('/api/me')).status,401);
}));

test('ordinary order listing is scoped to each customer',()=>withServer(async({api})=>{
  const t=await tokens(api);
  const a=await api('/api/orders',{headers:auth(t.a)});
  const b=await api('/api/orders',{headers:auth(t.b)});
  assert.equal(a.status,200);assert.equal(b.status,200);
  assert.ok(a.data.orders.every(o=>o.ownerUserId==='customer-a'));
  assert.ok(b.data.orders.every(o=>o.ownerUserId==='customer-b'));
}));

test('INTENTIONAL LAB BUG: customer A can read B order by direct ID',()=>withServer(async({api})=>{
  const t=await tokens(api);
  const forbidden=await api('/api/orders/order-b-1002',{headers:auth(t.a)});
  assert.equal(forbidden.status,200);
  assert.equal(forbidden.data.order.ownerUserId,'customer-b');
  assert.equal(forbidden.data.order.privateMarker,'ORDER_B_PRIVATE_48D2');
}));

test('INTENTIONAL LAB BUG: customer B can change shopkeeper settings',()=>withServer(async({api})=>{
  const t=await tokens(api);
  assert.equal((await api('/api/shop/settings',{headers:auth(t.b)})).status,403);
  const original=(await api('/api/shop/settings',{headers:auth(t.owner)})).data.settings.ownerName;
  const change=await api('/api/shop/settings',patch({ownerName:'Lab Changed Owner'},t.b));
  assert.equal(change.status,200);
  const changed=(await api('/api/shop/settings',{headers:auth(t.owner)})).data.settings.ownerName;
  assert.notEqual(changed,original);
  assert.equal(changed,'Lab Changed Owner');
}));

test('address and inventory routes provide correctly enforced permissions',()=>withServer(async({api})=>{
  const t=await tokens(api);
  assert.equal((await api('/api/addresses/address-a-101',{headers:auth(t.a)})).status,200);
  assert.equal((await api('/api/addresses/address-a-101',{headers:auth(t.b)})).status,403);
  assert.equal((await api('/api/addresses/address-a-101',patch({deliveryNote:'No thanks'},t.b))).status,403);
  const a=(await api('/api/addresses/address-a-101',{headers:auth(t.a)})).data.address;
  assert.equal(a.deliveryNote,'Please ring the bell');
  assert.equal((await api('/api/products/apple-01/inventory',patch({stock:3},t.b))).status,403);
  assert.equal((await api('/api/products/apple-01/inventory',patch({stock:3},t.owner))).status,200);
  assert.equal((await api('/api/products/apple-01')).data.stock,3);
  assert.equal((await api('/api/addresses/address-a-101',patch({ownerUserId:'customer-b'},t.a))).status,400);
  assert.equal((await api('/api/addresses/address-a-101',{headers:auth(t.a)})).data.address.ownerUserId,'customer-a');
}));

test('customers can place valid orders and owner can reset synthetic fixtures',()=>withServer(async({api})=>{
  const t=await tokens(api);
  const o=await api('/api/checkout',{method:'POST',headers:auth(t.a),body:JSON.stringify({items:[{sku:'apple-01',quantity:2}]})});
  assert.equal(o.status,201);assert.equal(o.data.order.ownerUserId,'customer-a');
  assert.equal((await api('/api/products/apple-01')).data.stock,35);
  assert.equal((await api('/api/lab/reset',{method:'POST',headers:auth(t.a),body:'{}'})).status,403);
  assert.equal((await api('/api/lab/reset',{method:'POST',headers:auth(t.owner),body:'{}'})).status,200);
  assert.equal((await api('/api/products/apple-01')).data.stock,37);
}));

test('browser login uses HttpOnly cookies and site assets load',()=>withServer(async({api})=>{
  const login=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:'alice@sprout.local',password:'AppleA!26'})});
  assert.equal(login.status,200);
  assert.equal(login.data.user.userId,'customer-a');
  assert.equal('token' in login.data,false);
  const session=login.headers.get('set-cookie');
  assert.ok(session.includes('HttpOnly'));
  assert.ok(session.toLowerCase().includes('samesite=strict'));
  const me=await api('/api/me',{headers:{Cookie:session.split(';')[0]}});
  assert.equal(me.status,200);assert.equal(me.data.userId,'customer-a');
  const css=await api('/styles.css');assert.equal(css.status,200);assert.ok(css.data.includes('--forest'));
  const js=await api('/app.js');assert.equal(js.status,200);assert.ok(js.data.includes('renderProducts'));
}));

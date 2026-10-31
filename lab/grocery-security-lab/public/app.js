const DEMOS = {
  'owner': { email:'owner@sprout.local',password:'OwnerDemo!26' },
  'customer-a': { email:'alice@sprout.local',password:'AppleA!26' },
  'customer-b': { email:'bob@sprout.local',password:'BerryB!26' }
};
const state = { user:null, products:[], orders:[], addresses:[], cart:{}, filter:'All', search:'' };
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => '₹'+Number(n).toLocaleString('en-IN');
const htmlSafe = s => String(s??'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
let toastTimer;
function toast(message, bad=false) { const el=$('#toast'); el.textContent=message; el.style.background=bad?'#a8433b':'#174735'; el.hidden=false; clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,3300); }
async function api(url, opts={}) {
  const config={credentials:'same-origin',headers:{'Content-Type':'application/json'},...opts};
  const r=await fetch(url,config);
  let data;try { data=await r.json(); }catch{data={};}
  if(!r.ok)throw new Error(data.error?.message || `Request failed (${r.status})`);
  return data;
}
function fail(err) { toast(err?.message||'Something went wrong', true); }
async function login(email,password) {
  const response=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});
  state.user=response.user;
  state.cart={};
  $('#authScreen').hidden=true;$('#appScreen').hidden=false;
  $('#headerUser').textContent=`Hello, ${state.user.displayName.split(' ')[0]}`;
  $$('.owner-nav').forEach(x=>x.hidden=state.user.role!=='owner');
  $(`[data-view="${state.user.role==='owner'?'admin':'shop'}"]`)?.classList.add('active');
  await reloadAll();showView(state.user.role==='owner'?'admin':'shop');
  toast(`Welcome back, ${state.user.displayName.split(' ')[0]}!`);
}
async function reloadAll() {
  const c=await api('/api/catalog');state.products=c.products;
  $('#productGrid').replaceChildren();
  renderCategories();renderProducts();renderCart();
  if(state.user) {
    const o=await api('/api/orders'); state.orders=o.orders;renderOrders();
    if(state.user.role==='customer'){const a=await api('/api/addresses');state.addresses=a.addresses;renderAddresses();}
    if(state.user.role==='owner') await loadAdmin();
  }
}
function showView(name) {
  if(name==='address'&&state.user?.role==='owner'){name='admin';}
  $$('.page-view').forEach(el=>el.hidden=el.id!==name+'View');
  $$('.nav-link').forEach(el=>el.classList.toggle('active',el.dataset.view===name));
  window.scrollTo({top:0,behavior:'smooth'});
}
function renderCategories(){
  const cats=['All',...new Set(state.products.map(p=>p.category))];
  $('#categoryFilters').innerHTML=cats.map(cat=>`<button class="category-pill ${state.filter===cat?'active':''}" data-category="${htmlSafe(cat)}">${htmlSafe(cat)}</button>`).join('');
  $$('.category-pill').forEach(b=>b.addEventListener('click',()=>{state.filter=b.dataset.category;renderCategories();renderProducts();}));
}
function renderProducts(){
  const visible=state.products.filter(p=>(state.filter==='All'||p.category===state.filter)&&p.name.toLowerCase().includes(state.search.toLowerCase()));
  $('#productGrid').innerHTML=visible.length?visible.map(p=>`<article class="product-card"><div class="product-art ${htmlSafe(p.shade)}">${p.badge?`<div class="product-badge">${htmlSafe(p.badge)}</div>`:''}<span>${htmlSafe(p.emoji)}</span></div><div class="product-info"><div class="product-category">${htmlSafe(p.category)}</div><h3>${htmlSafe(p.name)}</h3><div class="product-unit">${htmlSafe(p.unit)}</div><div class="product-bottom"><span class="product-price">${money(p.price)}</span>${p.stock>0?`<button class="add-btn" data-sku="${htmlSafe(p.sku)}" aria-label="Add ${htmlSafe(p.name)} to basket">+</button>`:'<span class="sold-out">Sold out</span>'}</div></div></article>`).join(''):'<div class="empty-state">No products match your search.</div>';
  $$('[data-sku]').filter(el=>el.classList.contains('add-btn')).forEach(b=>b.addEventListener('click',()=>addToCart(b.dataset.sku)));
}
function addToCart(sku){const product=state.products.find(p=>p.sku===sku);if(!product)return;const current=state.cart[sku]||0;if(current>=Math.min(product.stock,10))return toast('Maximum available quantity reached.',true);state.cart[sku]=current+1;renderCart();toast(`${product.name} added to basket`);}
function changeQty(sku,diff){const n=(state.cart[sku]||0)+diff;const product=state.products.find(p=>p.sku===sku);if(!product)return;if(n>Math.min(product.stock,10))return toast('No more in stock.',true);if(n<=0)delete state.cart[sku];else state.cart[sku]=n;renderCart();}
function renderCart(){
  const count=Object.values(state.cart).reduce((a,b)=>a+b,0);$('#cartCount').textContent=count;
  const entries=Object.entries(state.cart);
  $('#cartItems').innerHTML=entries.length?entries.map(([sku,quantity])=>{const p=state.products.find(p=>p.sku===sku);return p?`<div class="cart-item"><div class="cart-emoji">${htmlSafe(p.emoji)}</div><div class="cart-detail"><strong>${htmlSafe(p.name)}</strong><span class="muted small">${money(p.price)} · ${htmlSafe(p.unit)}</span><div class="cart-qty"><button data-change="-1" data-id="${htmlSafe(sku)}">−</button><b>${quantity}</b><button data-change="1" data-id="${htmlSafe(sku)}">+</button></div></div><b>${money(p.price*quantity)}</b></div>`:''}).join(''):'<div class="empty-state"><strong>Your basket is waiting 🌿</strong>Add some favorites from the shelves to get started.</div>';
  $$('[data-change]').forEach(b=>b.addEventListener('click',()=>changeQty(b.dataset.id,Number(b.dataset.change))));
  $('#cartTotal').textContent=money(entries.reduce((total,[sku,q])=>{const p=state.products.find(p=>p.sku===sku);return total+(p?.price||0)*q;},0));
  $('#checkoutBtn').disabled=!entries.length||state.user?.role==='owner';
  $('#checkoutBtn').textContent=state.user?.role==='owner'?'Customers can place orders':'Place demo order →';
}
function openCart(){ $('#cartOverlay').hidden=false;$('#cartDrawer').classList.add('open');$('#cartDrawer').setAttribute('aria-hidden','false'); }
function closeCart(){ $('#cartOverlay').hidden=true;$('#cartDrawer').classList.remove('open');$('#cartDrawer').setAttribute('aria-hidden','true'); }
async function checkout(){try{const items=Object.entries(state.cart).map(([sku,quantity])=>({sku,quantity}));if(!items.length)return;const r=await api('/api/checkout',{method:'POST',body:JSON.stringify({items})});state.cart={};closeCart();await reloadAll();showView('orders');toast(`Order ${r.order.orderId} confirmed!`);}catch(e){fail(e);}}
function renderOrders(){
  const list=state.orders;
  $('#ordersList').innerHTML=list.length?list.map(o=>`<article class="order-row"><div><h3>Order ${htmlSafe(o.orderId)}</h3><div class="order-meta"><span>${htmlSafe(o.placedAt)}</span><span>${o.items.length} items</span><span class="status-pill">${htmlSafe(o.status)}</span></div><span class="muted small">${htmlSafe(o.items.map(i=>i.name).join(' · '))}</span></div><div class="order-side"><strong>${money(o.total)}</strong><button class="btn btn-outline btn-small" data-order="${htmlSafe(o.orderId)}">View order ↗</button></div></article>`).join(''):'<div class="empty-state"><strong>No orders just yet.</strong>Your next grocery delivery is only a few clicks away.</div>';
  $$('[data-order]').forEach(b=>b.addEventListener('click',()=>viewOrder(b.dataset.order)));
}
async function viewOrder(id){try{const {order:o}=await api('/api/orders/'+encodeURIComponent(id));const content=$('#modalContent');content.innerHTML=`<span class="section-overline">ORDER DETAILS</span><h2>${htmlSafe(o.orderId)}</h2><p>${htmlSafe(o.placedAt)} · ${htmlSafe(o.status)}</p><div class="mini-pill">${htmlSafe(o.ownerUserId)}</div><div style="margin-top:20px">${o.items.map(i=>`<div class="modal-item"><span>${htmlSafe(i.name)} × ${i.quantity}</span><strong>${money(i.quantity*i.price)}</strong></div>`).join('')}</div><div class="modal-item" style="margin-top:18px;font-size:17px"><strong>Total</strong><strong>${money(o.total)}</strong></div><p class="small" style="margin-top:20px">Delivery instructions: ${htmlSafe(o.deliveryInstructions)}</p>`;$('#modalBackdrop').hidden=false;}catch(e){fail(e);}}
function renderAddresses(){
  $('#addressList').innerHTML=state.addresses.map(a=>`<article class="address-card"><span class="mini-pill">${htmlSafe(a.label)}</span><h3 style="margin-top:10px">Delivery to ${htmlSafe(state.user.displayName)}</h3><p>${htmlSafe(a.line1)} · ${htmlSafe(a.city)} · ${htmlSafe(a.postalCode)}</p><form class="address-edit" data-address="${htmlSafe(a.addressId)}"><label>Street address<input name="line1" value="${htmlSafe(a.line1)}" required></label><label>City<input name="city" value="${htmlSafe(a.city)}" required></label><label>Postal code<input name="postalCode" value="${htmlSafe(a.postalCode)}" required></label><label>Delivery instructions<input name="deliveryNote" value="${htmlSafe(a.deliveryNote)}" required></label><button class="btn btn-primary" type="submit">Save address →</button></form></article>`).join('');
  $$('[data-address]').forEach(f=>f.addEventListener('submit',async ev=>{ev.preventDefault();try{const fields=Object.fromEntries(new FormData(f));await api('/api/addresses/'+encodeURIComponent(f.dataset.address),{method:'PATCH',body:JSON.stringify(fields)});toast('Address updated');await reloadAll();}catch(e){fail(e);}}));
}
async function loadAdmin(){
  const {settings}=await api('/api/shop/settings');
  for(const key of ['storeName','ownerName','supportEmail','supportPhone','pickupNote']) $(`#setting-${key}`).value=settings[key];
  $('#inventoryList').innerHTML=state.products.map(p=>`<div class="inventory-row"><div class="inventory-label">${htmlSafe(p.emoji)} ${htmlSafe(p.name)}<small>${htmlSafe(p.sku)}</small></div><div class="inventory-edit"><input aria-label="Stock for ${htmlSafe(p.name)}" type="number" min="0" max="5000" value="${p.stock}" data-stock="${htmlSafe(p.sku)}"><button data-save-stock="${htmlSafe(p.sku)}">Save</button></div></div>`).join('');
  $$('[data-save-stock]').forEach(b=>b.addEventListener('click',async()=>{try{const sku=b.dataset.saveStock;const stock=Number($(`[data-stock="${sku}"]`).value);await api('/api/products/'+encodeURIComponent(sku)+'/inventory',{method:'PATCH',body:JSON.stringify({stock})});toast('Stock updated');await reloadAll();}catch(e){fail(e);}}));
}
function setup(){
  $('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#loginError').hidden=true;try{await login($('#loginEmail').value,$('#loginPassword').value);}catch(err){$('#loginError').hidden=false;$('#loginError').textContent=err.message;}});
  $$('[data-demo]').forEach(b=>b.addEventListener('click',()=>{const d=DEMOS[b.dataset.demo];$('#loginEmail').value=d.email;$('#loginPassword').value=d.password;$('#loginEmail').focus();}));
  $('#logoutBtn').addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST'}).catch(()=>{});state.user=null;$('#appScreen').hidden=true;$('#authScreen').hidden=false;$('#loginPassword').value='';closeCart();toast('Signed out');});
  $$('.nav-link').forEach(el=>el.addEventListener('click',()=>showView(el.dataset.view)));
  $('#brandHome').addEventListener('click',()=>showView('shop'));
  $('#productSearch').addEventListener('input',e=>{state.search=e.target.value;renderProducts();});
  $('#cartToggle').addEventListener('click',openCart);$('#closeCart').addEventListener('click',closeCart);$('#cartOverlay').addEventListener('click',closeCart);$('#checkoutBtn').addEventListener('click',checkout);
  $('#modalClose').addEventListener('click',()=>$('#modalBackdrop').hidden=true);$('#modalBackdrop').addEventListener('click',e=>{if(e.target===$('#modalBackdrop'))$('#modalBackdrop').hidden=true;});
  $('#settingsForm').addEventListener('submit',async ev=>{ev.preventDefault();try{const data=Object.fromEntries(new FormData(ev.target));await api('/api/shop/settings',{method:'PATCH',body:JSON.stringify(data)});toast('Shop details saved');await reloadAll();}catch(e){fail(e);}});
  $('#resetLabBtn').addEventListener('click',async()=>{if(!confirm('Reset all fictional orders, addresses, shop details and inventory?'))return;try{await api('/api/lab/reset',{method:'POST'});toast('Demo data reset');await reloadAll();}catch(e){fail(e);}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#modalBackdrop').hidden=true;closeCart();}});
  api('/api/me').then(u=>{state.user=u;$('#authScreen').hidden=true;$('#appScreen').hidden=false;$('#headerUser').textContent=`Hello, ${u.displayName.split(' ')[0]}`;$$('.owner-nav').forEach(x=>x.hidden=u.role!=='owner');reloadAll().then(()=>showView(u.role==='owner'?'admin':'shop')).catch(fail);}).catch(()=>{});
}
setup();

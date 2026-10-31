// Prefer real Express; use the bundled zero-dependency local preview only if unavailable.
let express;
try { ({ default: express } = await import('express')); }
catch { ({ default: express } = await import('./mini-express.mjs')); console.warn('Express not installed: using local preview HTTP fallback. Run npm install for full Express integration.'); }
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ACCOUNTS, createInitialState, publicUser } from './data.mjs';
import { mayReadOrder, mayEditShopSettings } from './access.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

export function createApp() {
  const app = express();
  let db = createInitialState();
  const sessions = new Map();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '20kb' }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    next();
  });

  const error = (res, status, code, message) => res.status(status).json({ error: { code, message } });
  const cookieToken = req => (req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('sprout_session='))?.slice('sprout_session='.length);
  const authenticated = (req, _res, next) => {
    const auth = req.get('authorization');
    const rawToken = auth?.startsWith('Bearer ') ? auth.slice(7) : cookieToken(req);
    const userId = sessions.get(rawToken);
    req.actor = ACCOUNTS.find(u => u.id === userId) || null;
    next();
  };
  app.use('/api', authenticated);
  const requireAuth = (req, res, next) => req.actor ? next() : error(res, 401, 'UNAUTHENTICATED', 'Please sign in.');
  const requireOwner = (req, res, next) => req.actor?.role === 'owner' ? next() : error(res, req.actor ? 403 : 401, 'FORBIDDEN', 'Shopkeeper access required.');
  const issueSession = actor => { const token = randomBytes(32).toString('hex'); sessions.set(token, actor.id); return token; };
  const login = (req, res, tokenResponse = false) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    const actor = ACCOUNTS.find(u => u.email === email && u.password === req.body?.password);
    if (!actor) return error(res, 401, 'LOGIN_FAILED', 'Incorrect demo account or password.');
    const token = issueSession(actor);
    if (!tokenResponse) res.cookie('sprout_session', token, { httpOnly: true, sameSite: 'strict', secure: false, path: '/' });
    return res.json(tokenResponse ? { token, user: publicUser(actor) } : { user: publicUser(actor) });
  };

  app.get('/api/health', (_req,res) => res.json({ status: 'ok', app: 'sprout-stone-grocery-lab', contractVersion: 'grocery-lab-1' }));
  app.post('/api/auth/login', (req,res) => login(req,res));
  // The trusted test runner can request a disposable bearer token using lab credentials.
  // Regular site logins use HttpOnly cookies and do NOT receive browser-visible tokens.
  app.post('/api/auth/token', (req,res) => login(req,res,true));
  app.post('/api/auth/logout', (req,res) => {
    const token = cookieToken(req);
    if (token) sessions.delete(token);
    res.clearCookie('sprout_session', { path: '/' });
    res.json({ ok: true });
  });
  app.get('/api/me', requireAuth, (req,res) => res.json(publicUser(req.actor)));
  app.get('/api/catalog', (_req,res) => res.json({ products: db.products, shopName: db.store.storeName, tagline: db.store.tagline, neighbourhood: db.store.neighbourhood }));
  app.get('/api/products/:sku', (req,res) => {
    const product = db.products.find(p => p.sku === req.params.sku);
    return product ? res.json(product) : error(res,404,'NOT_FOUND','Product not found.');
  });
  app.patch('/api/products/:sku/inventory', requireOwner, (req,res) => {
    const product = db.products.find(p=>p.sku===req.params.sku);
    if (!product) return error(res,404,'NOT_FOUND','Product not found.');
    if (!Number.isInteger(req.body?.stock) || req.body.stock < 0 || req.body.stock > 5000)
      return error(res,400,'BAD_STOCK','Stock must be an integer between 0 and 5000.');
    product.stock = req.body.stock;
    res.json({ product });
  });

  // A summary list respects ownership correctly. The detail route's policy is
  // implemented in a separate module for the intentional local exercise.
  app.get('/api/orders', requireAuth, (req,res) => {
    const orders = req.actor.role === 'owner' ? db.orders : db.orders.filter(o=>o.ownerUserId===req.actor.id);
    res.json({ orders: structuredClone(orders) });
  });
  app.get('/api/orders/:orderId', requireAuth, (req,res) => {
    const order = db.orders.find(o=>o.orderId===req.params.orderId);
    if (!order) return error(res,404,'NOT_FOUND','Order not found.');
    if (!mayReadOrder(req.actor,order)) return error(res,403,'FORBIDDEN','You cannot view this order.');
    res.json({ order: structuredClone(order) });
  });

  app.get('/api/addresses',requireAuth,(req,res)=>{
    const addresses = db.addresses.filter(a=>a.ownerUserId===req.actor.id);
    res.json({ addresses: structuredClone(addresses) });
  });
  app.get('/api/addresses/:addressId',requireAuth,(req,res)=>{
    const address = db.addresses.find(a=>a.addressId===req.params.addressId);
    if (!address) return error(res,404,'NOT_FOUND','Address not found.');
    if (address.ownerUserId !== req.actor.id) return error(res,403,'FORBIDDEN','This address belongs to another customer.');
    res.json({ address: structuredClone(address) });
  });
  app.patch('/api/addresses/:addressId',requireAuth,(req,res)=>{
    const address = db.addresses.find(a=>a.addressId===req.params.addressId);
    if (!address) return error(res,404,'NOT_FOUND','Address not found.');
    if (address.ownerUserId!==req.actor.id) return error(res,403,'FORBIDDEN','This address belongs to another customer.');
    const editable = ['line1','city','postalCode','deliveryNote'];
    const fields = Object.keys(req.body || {});
    if (!fields.length || fields.some(k=>!editable.includes(k)))
      return error(res,400,'INVALID_FIELDS','Only delivery address fields may be updated.');
    for (const field of fields) {
      if (typeof req.body[field] !== 'string' || req.body[field].length > 120 || !req.body[field].trim())
        return error(res,400,'INVALID_FIELDS', 'Address fields must be nonempty strings of at most 120 characters.');
    }
    for (const field of fields) address[field] = req.body[field].trim();
    res.json({ address: structuredClone(address) });
  });

  app.post('/api/checkout',requireAuth,(req,res)=>{
    if (req.actor.role!=='customer') return error(res,403,'FORBIDDEN','Customer login required to checkout.');
    const items=req.body?.items;
    const address = db.addresses.find(a=>a.ownerUserId===req.actor.id);
    if (!address || !Array.isArray(items) || items.length<1 || items.length>12)
      return error(res,400,'BAD_CART','A valid cart and delivery address are required.');
    const normalized=[];
    for (const item of items) {
      const product=db.products.find(p=>p.sku===item?.sku);
      if (!product || !Number.isInteger(item.quantity) || item.quantity<1 || item.quantity>10 || item.quantity>product.stock)
        return error(res,400,'BAD_CART','Invalid item or not enough stock.');
      if (normalized.some(x=>x.sku===product.sku)) return error(res,400,'BAD_CART','Each product may appear once.');
      normalized.push({ sku: product.sku,name:product.name,quantity:item.quantity,price:product.price });
    }
    for(const item of normalized){ db.products.find(p=>p.sku===item.sku).stock -= item.quantity; }
    const order={orderId:'order-'+(req.actor.id==='customer-a'?'a':'b')+'-'+db.nextOrderId++, ownerUserId:req.actor.id, status:'Confirmed',placedAt:new Date().toISOString().slice(0,10),items:normalized,total:normalized.reduce((a,p)=>a+p.price*p.quantity,0),deliveryAddressId:address.addressId,deliveryInstructions:address.deliveryNote,privateMarker:'ORDER_DEMO_'+randomBytes(6).toString('hex').toUpperCase()};
    db.orders.unshift(order);
    res.status(201).json({ order });
  });

  app.get('/api/shop/settings',requireOwner,(_req,res)=>res.json({ settings: structuredClone(db.store) }));
  app.patch('/api/shop/settings',requireAuth,(req,res)=>{
    if (!mayEditShopSettings(req.actor)) return error(res,403,'FORBIDDEN','Shopkeeper permissions required.');
    const fields=Object.keys(req.body||{});
    const editable=['storeName','tagline','ownerName','supportEmail','supportPhone','pickupNote','neighbourhood'];
    if (!fields.length || fields.some(f=>!editable.includes(f)))
      return error(res,400,'INVALID_FIELDS','Unsupported shop setting.');
    for(const field of fields){
      if(typeof req.body[field]!=='string' || !req.body[field].trim() || req.body[field].length>150)
        return error(res,400,'INVALID_FIELDS','Settings must be nonempty strings, max length 150.');
    }
    for(const field of fields) db.store[field]=req.body[field].trim();
    res.json({ settings: structuredClone(db.store) });
  });

  app.post('/api/lab/reset',requireOwner,(_req,res)=>{
    db=createInitialState();
    res.json({ ok:true, message:'All synthetic shopping data reset.' });
  });

  app.use('/api',(_req,res)=>error(res,404,'NOT_FOUND','API endpoint not found.'));
  app.use(express.static(publicDir));
  app.get('*',(_req,res)=>res.sendFile(path.join(publicDir,'index.html')));
  app.use((err,_req,res,_next)=>{
    if(err?.type==='entity.parse.failed') return error(res,400,'INVALID_JSON','Malformed JSON.');
    console.error('Lab error:',err.message);
    return error(res,500,'INTERNAL_ERROR','Unexpected lab server error.');
  });
  return app;
}

// Running directly starts a single, intentionally local lab instance.
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const requested=Number(process.env.PORT||4000);
  const port=Number.isInteger(requested) && requested>=1024 && requested<=65535?requested:4000;
  const server=createApp().listen(port,'127.0.0.1',()=>{
    console.log(`\n  Sprout & Stone grocery lab → http://127.0.0.1:${server.address().port}`);
    console.log('  LOCAL SYNTHETIC TRAINING DATA ONLY. Do not expose this lab publicly.\n');
  });
}

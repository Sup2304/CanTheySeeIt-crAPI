// Zero-dependency development fallback. Real Express is preferred when installed.
// This implements only the HTTP features this synthetic lab needs; NOT for production.
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';

const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
function routeRegex(pattern) {
  if(pattern==='*')return {regex:/^.*$/,keys:[]};
  const keys=[];
  const src=pattern.split('/').map((part)=>{
    if(part.startsWith(':')){keys.push(part.slice(1));return '([^/]+)';}
    return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  }).join('/');
  return {regex:new RegExp('^'+src+'/?$'),keys};
}
function miniExpress(){
  const routes=[];
  const app=(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    req.path=url.pathname;
    req.query=Object.fromEntries(url.searchParams);
    req.get=name=>req.headers[name.toLowerCase()];
    res.status=code=>{res.statusCode=code;return res;};
    res.set=(key,value)=>{res.setHeader(key,value);return res;};
    res.json=value=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));return res;};
    res.cookie=(name,value,options={})=>{
      let c=`${name}=${encodeURIComponent(value)}; Path=${options.path||'/'}`;
      if(options.httpOnly)c+='; HttpOnly';
      if(options.sameSite)c+=`; SameSite=${options.sameSite}`;
      if(options.secure)c+='; Secure';
      res.setHeader('Set-Cookie',c);return res;
    };
    res.clearCookie=(name,options={})=>{res.setHeader('Set-Cookie',`${name}=; Path=${options.path||'/'}; Max-Age=0; HttpOnly`);return res;};
    res.sendFile=file=>{
      try{const stat=statSync(file);if(!stat.isFile())throw Error('not a file');
        res.setHeader('Content-Type',types[path.extname(file).toLowerCase()]||'application/octet-stream');
        createReadStream(file).on('error',()=>res.end()).pipe(res);
      }catch{res.statusCode=404;res.end('Not found');}
      return res;
    };
    let index=0;
    const next=err=>{
      if(err){
        const errorHandler=routes.find(x=>x.errorHandler);
        if(errorHandler){return errorHandler.fn(err,req,res,()=>{});}
        res.statusCode=500;res.end('Internal error');return;
      }
      while(index<routes.length){
        const r=routes[index++];if(r.errorHandler)continue;
        if(r.method && r.method!==req.method)continue;
        if(r.prefix && !(req.path===r.prefix||req.path.startsWith(r.prefix+'/')))continue;
        if(r.match){const m=r.match.regex.exec(req.path);if(!m)continue;req.params=Object.fromEntries(r.match.keys.map((k,i)=>[k,decodeURIComponent(m[i+1])]));}
        try{return r.fn(req,res,next);}catch(e){return next(e);}
      }
      if(!res.writableEnded){res.statusCode=404;res.end('Not found');}
    };
    next();
  };
  app.disable=()=>{};
  app.use=(prefix,fn)=>{
    if(typeof prefix==='function'){fn=prefix;prefix='';}
    routes.push({prefix:prefix==='/'?'':prefix,fn,errorHandler:fn.length===4});
  };
  for(const method of ['get','post','patch']){
    app[method]=(pattern, ...handlers)=>{
      const match=routeRegex(pattern);
      for(const fn of handlers)routes.push({method:method.toUpperCase(),match,fn});
    };
  }
  app.listen=(port,host,callback)=>http.createServer(app).listen(port,host,callback);
  return app;
}
miniExpress.json=(options={})=>(req,res,next)=>{
  if(!['POST','PUT','PATCH','DELETE'].includes(req.method))return next();
  const cap=Number.parseInt(options.limit||'20480')*(String(options.limit).endsWith('kb')?1024:1);
  const buffers=[];let total=0;
  req.on('data',chunk=>{total+=chunk.length;if(total>cap){res.statusCode=413;res.end('Payload too large');req.destroy();return;}buffers.push(chunk);});
  req.on('end',()=>{
    if(res.writableEnded||res.destroyed)return;
    try{const raw=Buffer.concat(buffers).toString('utf8');req.body=raw?JSON.parse(raw):{};next();}
    catch(e){e.type='entity.parse.failed';next(e);}
  });
  req.on('error',e=>next(e));
};
miniExpress.static=root=> (req,res,next)=>{
  if(req.method!=='GET'&&req.method!=='HEAD')return next();
  let p;try{p=decodeURIComponent(req.path);}catch{return next();}
  if(!p||p.endsWith('/'))return next();
  const base=path.resolve(root),candidate=path.resolve(base,'.'+p);
  if(!candidate.startsWith(base+path.sep))return next();
  try{if(!statSync(candidate).isFile())return next();res.sendFile(candidate);}catch{return next();}
};
export default miniExpress;

import { readFile } from 'node:fs/promises';
for(const name of ['sprout.g01-g10.json','sprout-known-vulnerabilities.json']) {
 const suite=JSON.parse(await readFile(new URL('../suites/'+name,import.meta.url),'utf8'));
 const r=await fetch('http://127.0.0.1:4100/api/suites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(suite),signal:AbortSignal.timeout(3500)});
 const x=await r.json();
 if(r.status===201)console.log(`REGISTERED ${suite.suiteId} (${x.checkCount} checks)`);
 else if(r.status===409 && x.error==='SUITE_ALREADY_EXISTS_OR_STORE_ERROR')console.log(`ALREADY REGISTERED: ${suite.suiteId}`);
 else {console.error('Suite registration failed:',suite.suiteId,r.status,x.error);process.exitCode=1;}
}

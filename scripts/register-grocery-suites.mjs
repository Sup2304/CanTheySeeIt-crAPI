/** Register a reviewed, fixed-path synthetic suite with Suprita V2. No secrets. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const approved = Object.freeze({
  main:'grocery.g01-g10.json',
  g11:'grocery.g11-fault.json',
  g12:'grocery.g12-expiry.json'
});
const selection=process.argv[2] ?? 'main';
if (!Object.hasOwn(approved,selection)) {
  console.error('Usage: node scripts/register-grocery-suites.mjs [main|g11|g12]');
  process.exit(2);
}
const local=fileURLToPath(new URL(`../suites/${approved[selection]}`,import.meta.url));
const suite=JSON.parse(await readFile(local,'utf8'));
const base=process.env.VERIFIER_URL || 'http://127.0.0.1:4100';
if (base!=='http://127.0.0.1:4100') throw new Error('Verifier URL must be loopback port 4100 for this integration');
const response=await fetch(`${base}/api/suites`,{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify(suite),redirect:'manual',signal:AbortSignal.timeout(5000)
});
const body=await response.json();
if (!response.ok) {
  console.error(`Suite registration HTTP ${response.status}:`,JSON.stringify(body));
  process.exit(1);
}
console.log(JSON.stringify({suiteId:body.suiteId,checkCount:body.checkCount,saved:true},null,2));

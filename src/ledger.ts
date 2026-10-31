import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Run, TestSuite } from './contracts.ts';

const storagePath = resolve(process.cwd(), 'data/ledger.json');
type Ledger = { suites: TestSuite[]; runs: Run[] };
async function load(): Promise<Ledger> {
  try { return JSON.parse(await readFile(storagePath,'utf8')) as Ledger; }
  catch (err) { if ((err as NodeJS.ErrnoException).code==='ENOENT') return { suites:[],runs:[] }; throw err; }
}
async function save(data: Ledger): Promise<void> {
  await mkdir(dirname(storagePath),{recursive:true});
  const tmp=`${storagePath}.${randomUUID()}.tmp`;
  await writeFile(tmp,JSON.stringify(data,null,2),'utf8');
  await rename(tmp,storagePath);
}
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(f:()=>Promise<T>):Promise<T> {
  const task=queue.then(f,f); queue=task.catch(()=>{}); return task;
}
export function saveSuite(suite: TestSuite):Promise<void> {
  return serial(async()=>{
    const data=await load();
    if (data.suites.some(s=>s.suiteId===suite.suiteId)) throw new Error('SUITE_ALREADY_EXISTS');
    data.suites.push(suite); await save(data);
  });
}
export function getSuite(suiteId: string):Promise<TestSuite|undefined> {return load().then(x=>x.suites.find(s=>s.suiteId===suiteId));}
export function listSuites():Promise<TestSuite[]> {return load().then(x=>x.suites);}
export function getRuns(suiteId:string):Promise<Run[]> {return load().then(x=>x.runs.filter(r=>r.suiteId===suiteId));}
export function saveRun(run:Run):Promise<void> {return serial(async()=>{const data=await load(); data.runs.push(run); await save(data);});}

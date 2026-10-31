import express from 'express';
import { z } from 'zod';
import { getAdapter, listAdapters } from './adapter.ts';
import { SuiteSchema } from './contracts.ts';
import { getSuite, listSuites, saveSuite, getRuns, saveRun } from './ledger.ts';
import { runSuite } from './engine.ts';
import { registerAdapter } from './adapter.ts';
import { createSproutStoneAdapter } from '../adapters/sprout-stone.adapter.ts';
import { createCrapiAdapter } from '../adapters/crapi.adapter.ts';
// No application adapter is imported until the team supplies and reviews one.
// After Snehal implements adapters/grocery.adapter.ts, import and register it HERE.

registerAdapter(createSproutStoneAdapter());
// Explicit opt-in: without CRAPI_ENABLE=true the original Sprout setup is unchanged.
if (process.env.CRAPI_ENABLE === 'true') registerAdapter(createCrapiAdapter());
const app = express();
app.use(express.json({ limit:'16kb' }));
app.disable('x-powered-by');
const activeTargets = new Set<string>(); // prevent concurrent runs corrupting shared test fixtures
const RunInput = z.object({ revisionLabel: z.string().min(1).max(100),
  approveSyntheticWrites: z.boolean().default(false) }).strict();
app.get('/api/health', (_req,res)=>res.json({ ok:true,service:'cantheyseeit-generic-verifier-v2' }));
app.get('/api/readiness',(_req,res)=>res.json({status:listAdapters().length?'ADAPTER_REGISTERED':'NEEDS_SETUP',adapters:listAdapters(),note:'Ready is checked again before each run.'}));
app.get('/api/suites', async(_req,res)=>res.json(await listSuites()));
app.post('/api/suites', async(req,res)=>{
  const parsed=SuiteSchema.safeParse(req.body);
  if (!parsed.success) {res.status(400).json({error:'INVALID_TEST_CONTRACT',details:parsed.error.issues.map(x=>x.message)});return;}
  if (!getAdapter(parsed.data.targetProfileId)) {res.status(409).json({error:'NEEDS_SETUP',reason:'Trusted local adapter not registered'});return;}
  try {await saveSuite(parsed.data);res.status(201).json({suiteId:parsed.data.suiteId,saved:true,checkCount:parsed.data.cases.length});}
  catch {res.status(409).json({error:'SUITE_ALREADY_EXISTS_OR_STORE_ERROR'});}
});
app.get('/api/suites/:id/runs',async(req,res)=>res.json(await getRuns(req.params.id)));
app.post('/api/suites/:id/run',async(req,res)=>{
  const data=RunInput.safeParse(req.body);
  if (!data.success){res.status(400).json({error:'INVALID_RUN_REQUEST'});return;}
  const suite=await getSuite(req.params.id);
  if(!suite){res.status(404).json({error:'SUITE_NOT_FOUND'});return;}
  const adapter=getAdapter(suite.targetProfileId);
  if(!adapter){res.status(409).json({error:'NEEDS_SETUP',reason:'Adapter unavailable'});return;}
  if (activeTargets.has(adapter.id)) {res.status(409).json({error:'RUN_ALREADY_IN_PROGRESS'});return;}
  activeTargets.add(adapter.id);
  try {
    const runs=await getRuns(suite.suiteId);
    const current=await runSuite(suite,adapter,data.data.revisionLabel,data.data.approveSyntheticWrites,runs.at(-1));
    await saveRun(current);
    res.json(current);
  }catch(e){
    const code=e instanceof Error && e.message.startsWith('NEEDS_SETUP')?'NEEDS_SETUP':'VERIFICATION_UNAVAILABLE';
    res.status(409).json({error:code,reason:code==='NEEDS_SETUP'?'Synthetic target is not ready':'Run could not be completed; no PASS is reported'});
  } finally { activeTargets.delete(adapter.id); }
});
const PORT=Number(process.env.VERIFIER_PORT ?? 4100);
if (!Number.isInteger(PORT) || PORT !== 4100) throw new Error('Verifier must use approved loopback port 4100');
app.listen(PORT,'127.0.0.1',()=>console.log(`CanTheySeeIt v2 API: http://127.0.0.1:${PORT}; registered adapters: ${listAdapters().join(", ")} (readiness checked per run)`));

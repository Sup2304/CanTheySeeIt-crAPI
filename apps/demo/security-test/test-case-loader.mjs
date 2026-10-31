/** Test contract loading and safety validation only. This is not a runner/verdict engine. */
import {readFile} from 'node:fs/promises';

const CASE_PATH=new URL('./grocery-test-cases.json',import.meta.url);
const EXPECTED_IDS=Array.from({length:12},(_,i)=>'G'+String(i+1).padStart(2,'0'));
const ACTORS=new Set(['customer-a','customer-b','staff-1','anonymous']);
const RESOURCES=new Map([['address-a-101','address'],['address-b-102','address'],['sku-apple-01','product']]);
const ALLOWED_PATHS=new Map([
  ['/api/addresses/address-a-101',new Set(['GET','PATCH'])],
  ['/api/addresses/address-b-102',new Set(['GET','PATCH'])],
  ['/api/products/sku-apple-01/inventory',new Set(['PATCH'])]
]);

export function validateTestPlan(plan) {
  if(!plan || plan.schemaVersion!=='1.0' || plan.targetProfileId!=='local-grocery-v1' ||
    plan.fixtureVersion!=='grocery-fixtures-v1' || !Array.isArray(plan.cases) || plan.cases.length!==12)
    throw new Error('Wrong-version or incomplete G01–G12 plan');
  for(const [index,c] of plan.cases.entries()) {
    if(c.id!==EXPECTED_IDS[index] || !ACTORS.has(c.actorRef) ||
       !RESOURCES.has(c.resourceRef) || c.resourceType!==RESOURCES.get(c.resourceRef))
      throw new Error(`Invalid case identity or fixture reference at ${index}`);
    if(!['HTTP','QA_FAULT'].includes(c.kind) ||
       !ALLOWED_PATHS.get(c.request?.path)?.has(c.request?.method))
      throw new Error(`Unsupported operation in ${c.id}`);
    if(!['ALLOW','DENY','REJECT'].includes(c.expectedAccess) ||
       !Array.isArray(c.expectedStatuses) || !c.expectedStatuses.every(s=>[200,400,401,403].includes(s)))
      throw new Error(`Invalid expectation in ${c.id}`);
    if(c.actorRef==='anonymous' && c.expectedAccess==='ALLOW')
      throw new Error('Anonymous privileged access not allowed in this fixture profile');
    if(c.request.method==='PATCH' &&
      (c.requiresTrustedBeforeAfter!==true || c.resetAfter!==true ||
       !c.request.jsonBody || !Object.keys(c.request.jsonBody).length))
      throw new Error(`Write safety requirements missing from ${c.id}`);
    if(c.id==='G11' && (c.kind!=='QA_FAULT' || c.expectedVerdictInScenario!=='FAIL' ||
      c.faultPrerequisite?.mode!=='controlled-regressed-backend-only'))
      throw new Error('G11 must require a real controlled backend fault');
    if(c.id==='G12' && (c.kind!=='QA_FAULT' || c.expectedVerdictInScenario!=='INCONCLUSIVE' ||
      c.faultPrerequisite?.mode!=='expire-private-session-between-verifier-checks'))
      throw new Error('G12 must require expiration and INCONCLUSIVE');
  }
  if(plan.executionSafety?.syntheticOnly!==true ||
     plan.executionSafety?.explicitSetupConsent!==true ||
     plan.executionSafety?.trustedStateReadBackForWrites!==true ||
     plan.executionSafety?.neverExposeSessionsToBrowser!==true)
    throw new Error('Required safety properties missing');
  return true;
}

export async function loadGroceryTestPlan() {
  const plan=JSON.parse(await readFile(CASE_PATH,'utf8'));
  validateTestPlan(plan);
  return structuredClone(plan);
}

// Public metadata for the UI; excludes fixture markers, request contents and credentials.
export function publicTestPreview(plan) {
  validateTestPlan(plan);
  return plan.cases.map(({id,scenario,kind,actorRef,expectedAccess})=>
    ({id,scenario,kind,actorRef,expectedAccess}));
}

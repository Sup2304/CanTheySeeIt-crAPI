/** Local developer CLI. PRIVATE tokens/resources are never printed. */
import {createFixtureAdapter} from './fixture-adapter.mjs';
import {loadGroceryTestPlan,publicTestPreview} from './test-case-loader.mjs';

const action=process.argv[2]||'validate';
try{
  if(action==='validate'){
    const plan=await loadGroceryTestPlan();
    console.log(`VALID: ${plan.cases.length} synthetic cases (${plan.cases.filter(c=>c.kind==='QA_FAULT').length} QA fault scenarios)`);
    console.log(JSON.stringify(publicTestPreview(plan),null,2));
  }else if(['prepare','reset','inspect','expire'].includes(action)){
    const adapter=createFixtureAdapter({baseUrl:process.env.GROCERY_URL||'http://127.0.0.1:4000/'});
    if(action==='prepare'){
      const {publicSummary}=await adapter.prepareFixtures({approved:true});
      console.log(JSON.stringify(publicSummary,null,2));
    }else if(action==='reset'){
      console.log(JSON.stringify(await adapter.resetFixtures({approved:true}),null,2));
    }else if(action==='inspect'){
      const id=process.argv[3]||'address-a-101';
      const type=id.startsWith('sku-')?'product':'address';
      const resource=await adapter.inspectFixture({type,resourceId:id});
      console.log(JSON.stringify({resourceRef:id,type,exists:!!resource,checkedViaTrustedAdapter:true},null,2));
    }else{
      const actorId=process.argv[3]||'customer-b';
      console.log(JSON.stringify(await adapter.expireSyntheticActor({actorId}),null,2));
    }
  }else{throw new Error('Usage: validate | prepare | reset | inspect <syntheticId> | expire <actorId>');}
}catch(err){console.error(`Member 2 fixture setup: ${err.message}`);process.exitCode=1;}

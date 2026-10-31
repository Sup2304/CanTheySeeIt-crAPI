import { describe, expect, it } from 'vitest';
import { aggregateVerdict, writeVerdict, readVerdict } from '../src/verdict.ts';
import type { TestCase, Result } from '../src/contracts.ts';
const c:TestCase={testId:'unit',actorRef:'peer',resourceRef:'known',operationRef:'synthetic',method:'PATCH',expectation:'DENY',requiredControls:[],mutationRef:'controlled',acceptedDenialStatuses:[403]};
const o={status:403,body:{error:'Forbidden'},bytes:15};
describe('generic verdict logic (NO grocery fixtures or G-cases)',()=>{
  it('reports FAIL if a forbidden write changed stored state even when HTTP says 403',()=>{
    expect(writeVerdict(c,o,{changed:true,intendedChange:false}).verdict).toBe('FAIL');
  });
  it('does not call an unexpected 200 plus unchanged state a PASS',()=>{
    expect(writeVerdict(c,{...o,status:200},{changed:false,intendedChange:false}).verdict).toBe('INCONCLUSIVE');
  });
  it('accepts forbidden write only with accepted denial AND unchanged state',()=>{
    expect(writeVerdict(c,o,{changed:false,intendedChange:false}).verdict).toBe('PASS');
  });
  it('rejects status-only read claims without known synthetic private fixture',()=>{
    expect(readVerdict({...c,method:'GET'}, {status:200,body:{},bytes:2},false).verdict).toBe('INCONCLUSIVE');
  });
  it('prioritizes known failures over inconclusive checks',()=>{
    const result=(verdict:Result['verdict']):Result=>({testId:'x',verdict,reasonCode:'UNIT',explanation:'',observed:{status:null},checkedAt:'now'});
    expect(aggregateVerdict([result('FAIL'),result('INCONCLUSIVE')])).toBe('FAIL');
  });
});

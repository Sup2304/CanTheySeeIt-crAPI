import { z } from 'zod';

const ref = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.:-]+$/);
export const CaseSchema = z.object({
  testId: ref,
  actorRef: ref,
  resourceRef: ref,
  operationRef: ref,
  method: z.enum(['GET', 'PATCH']),
  expectation: z.enum(['ALLOW', 'DENY']),
  requiredControls: z.array(ref).max(8).default([]),
  // For writes, the adapter resolves this reference into an APPROVED synthetic payload.
  mutationRef: ref.optional(),
  acceptedDenialStatuses: z.array(z.union([z.literal(400), z.literal(401), z.literal(403), z.literal(404)])).max(3).default([403])
}).strict().superRefine((test, ctx) => {
  if (test.method === 'PATCH' && !test.mutationRef) {
    ctx.addIssue({ code: 'custom', message: 'PATCH requires mutationRef' });
  }
  if (test.actorRef !== 'anonymous' && test.acceptedDenialStatuses.includes(401)) {
    ctx.addIssue({ code: 'custom', message: 'Authenticated 401 cannot be accepted as owner/role denial' });
  }
});

export const SuiteSchema = z.object({
  suiteId: ref,
  title: z.string().min(3).max(160),
  originalRequirement: z.string().min(3).max(2000),
  targetProfileId: ref,
  confirmed: z.literal(true),
  cases: z.array(CaseSchema).min(1).max(40)
}).strict().superRefine((suite, ctx) => {
  const ids = suite.cases.map(c => c.testId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'test IDs must be unique' });
  for (const test of suite.cases) {
    for (const control of test.requiredControls) {
      if (control === test.testId || !ids.includes(control) || ids.indexOf(control) >= ids.indexOf(test.testId)) {
        ctx.addIssue({ code: 'custom', message: `Invalid/out-of-order control ${control} for ${test.testId}` });
      }
    }
  }
});
export type TestCase = z.infer<typeof CaseSchema>;
export type TestSuite = z.infer<typeof SuiteSchema>;
export type Verdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE';
export type Result = {
  testId: string;
  verdict: Verdict;
  reasonCode: string;
  explanation: string;
  observed: { status: number | null; fixtureMatched?: boolean; stateChanged?: boolean; intendedChange?: boolean; error?: string };
  checkedAt: string;
};
export type Run = {
  runId: string; suiteId: string; contractHash: string; revisionLabel: string;
  aggregateVerdict: Verdict; results: Result[]; executedAt: string;
  haltedAfterCleanupFailure: boolean;
  comparison: null | { previousRunId: string; aggregateTransition: string; testTransitions: { testId: string; from: Verdict; to: Verdict }[] };
};

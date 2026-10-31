# Freeze before implementing the crAPI adapter

## Existing verifier contract (do not change without team agreement)
- `TargetAdapter.id`: unique stable target ID.
- `baseUrl`: exact `http://127.0.0.1:<port>/` origin (current engine enforces loopback).
- `syntheticOnly: true`; adapter is trusted source code, never arbitrary browser-supplied configuration.
- `approvedPaths`: exact allowed request paths; no patterns, wildcards or unreviewed URLs.
- `ready()` checks local crAPI and verifies fixtures.
- `validateActor(actorRef)` proves current synthetic user session independently.
- `authHeaders(actorRef)` provides bearer header server-side; never expose tokens to UI/logs.
- `resolve(test)` maps approved test references to actual GET requests.
- `matchesProtectedFixture(test,body)` matches exact owned fixture identity/marker.
- `snapshot`, `compareState`, `restore` required by adapter interface; for Phase 1 GET-only checks, these are not exercised. Don't enable PATCH unless genuinely implemented and tested.

## Proposed Phase 1 approved cases — define ONLY after observing the real local crAPI contract
A1: User A GET own known resource -> ALLOW, exact fixture match.
B1: User B GET own known resource -> ALLOW, exact fixture match.
A2: User A GET B's known resource -> DENY; A1/B1 must pass first.
B2: User B GET A's known resource -> DENY; A1/B1 must pass first.

Do not create/claim executable suite JSON until the actual endpoints, authorization behavior and fixture data are verified. It is possible the crAPI build has different API behavior; adapt to the observed version.

## Completion checklist
[ ] Docker lab on local loopback only, version pinned
[ ] Both user happy paths work
[ ] Test records/ownership established by trusted setup
[ ] Token handling validated; no raw credentials logged
[ ] Exact route allowlist reviewed
[ ] Two self-reads PASS (positive controls)
[ ] Cross-user reads independently verified or INCONCLUSIVE with explanation
[ ] Sprout baseline still passes
[ ] Result JSON connects to Maulik's UI
[ ] Arjun signs off reproducibility

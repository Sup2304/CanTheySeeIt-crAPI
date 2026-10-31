# CanTheySeeIt — crAPI Benchmark Branch/Repository Starter

This is a **separate copy** of the working Generic Verifier V2 + Sprout & Stone integration. Nothing in the original project is overwritten. The new `adapters/crapi.adapter.ts` now implements a **fail-closed, GET-only crAPI Phase 1 integration** with two disposable accounts and exact independently configured vehicle fixtures. Five mock HTTP tests pass; a live crAPI run and cross-user vulnerability detection have NOT yet been verified.

## Project goal
Reuse the SAME TypeScript authorization verification engine on two independent training apps:
1. Sprout & Stone — already integrated; regression baseline.
2. OWASP crAPI — **integration pending**; first milestone is an authorized, local, read-only owner-vs-other-owner resource test.

## Folder guide
- `src/`: generic verifier, verdicts, evidence, API, local result ledger.
- `adapters/sprout-stone.adapter.ts`: existing working adapter.
- `adapters/crapi.adapter.ts`: opt-in, read-only crAPI adapter (requires local `.env` and Docker target).
- `suites/sprout*.json`: working baseline tests.
- `suites/crapi/crapi-baseline.json`: two positive controls plus an anonymous-denial check; not BOLA.
- `lab/grocery-security-lab/`: known Sprout baseline app, preserved for demo and regression.
- `docs/TEAM_PLAN.md`: responsibilities and timeline.
- `docs/CONTRACT_FREEZE.md`: the shared integration interface and acceptance criteria.
- `scripts/check-crapi-local.mjs`: safe GET of local crAPI home page; NOT a security test.

## Mac quickstart (for the verifier)
```bash
npm install
npm run typecheck
npm run test:unit
npm run dev
```
Verifier health: `curl http://127.0.0.1:4100/api/health`

## Separate crAPI lab (team-controlled, isolated only)
Use the official instructions: https://github.com/OWASP/crAPI/blob/develop/docs/setup.md
The stable Docker Compose instructions start the application at `http://localhost:8888` by default. Ensure the lab is confined to localhost; do **not** forward or deploy the deliberately vulnerable lab publicly.

After crAPI starts, run `npm run check:crapi`. This only verifies connectivity.

## Important
- The crAPI adapter registers only when `CRAPI_ENABLE=true`; it refuses to run without two working disposable accounts and independently configured VIN fixtures.
- The current HTTP runner supports GET and PATCH, but not POST. crAPI login/fixture provisioning may use separate trusted adapter setup; don't silently alter the runner's approved methods.
- A PASS requires positive controls and exact known fixture evidence. Don't treat every HTTP error as a security PASS.
- Work on crAPI with disposable accounts and an isolated local instance only.
- Keep credentials, JWTs, databases, data/ledger and Docker environment files out of Git.

See `docs/TEAM_PLAN.md` to start working in parallel.

## Suprita Phase 1 quickstart

See **`docs/CRAPI_INTEGRATION_GUIDE.md`** for complete instructions, Windows PowerShell commands, local-only Docker options, test evidence and security limitations.

```powershell
npm install
npm run typecheck
npm run test:crapi:mock
Copy-Item .env.example .env
notepad .env
# After configuring two local crAPI accounts and starting Docker:
npm run start:crapi
# In a second terminal:
npm run demo:crapi
```

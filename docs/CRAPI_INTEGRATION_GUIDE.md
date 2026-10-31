# CanTheySeeIt — crAPI Phase 1 integration (Suprita)

## Status and scope

- Implemented: a GET-only adapter using verified crAPI identity-service endpoints, local account login, two independently known vehicle fixtures, and the generic engine's PASS/FAIL/INCONCLUSIVE verdicts.
- Verified here: five automated tests using a controlled local mock HTTP API, including a simulated data exposure failure.
- NOT yet verified: a run against Snehal's real OWASP crAPI Docker installation, BOLA/IDOR, BFLA, production targets, or arbitrary uploaded apps.
- The existing Sprout & Stone adapter remains registered and unchanged.

## Verified crAPI API contract (from Snehal's successful local runs)

- POST `http://127.0.0.1:8888/identity/api/auth/login`
- Body: `{"email":"...","password":"..."}`
- Successful response: JSON object containing `token`
- GET `http://127.0.0.1:8888/identity/api/v2/vehicle/vehicles`
- Auth: `Authorization: Bearer <token>`
- Successful vehicle response: JSON array with fields including `id`, `uuid`, `vin`, `owner`, `model`, `pincode`.
- The adapter only stores tokens in memory and never returns token, VIN, PIN, email, or password in test-result JSON.

## Important: Mac vs Windows localhost

Snehal's Mac `127.0.0.1` is NOT Suprita's Windows `127.0.0.1`.

Choose one:

**Option A — fastest live demo:** Run this verifier project on Snehal's Mac alongside Snehal's already-working Docker crAPI. The `.env` file must be created locally on that Mac using Snehal's disposable account data. Do not send the `.env` file to teammates.

**Option B — independent Windows testing:** Install Docker Desktop on Suprita's Windows machine, start OWASP crAPI there (official repository: https://github.com/OWASP/crAPI), register two new disposable accounts, attach separate vehicles, and use the new accounts' VINs in her local `.env`.

Never expose the deliberately vulnerable crAPI application to the internet or change the verifier's localhost-only target restriction.

## Step 1: Install dependencies

Requires Node.js 22+ and npm. Open PowerShell in the extracted project folder (the folder containing `package.json`):

```powershell
npm install
npm run typecheck
npm run test:crapi:mock
```

`test:crapi:mock` tests the adapter with a fake local server and does not require Docker. It should report five passing tests. It does NOT establish that the real crAPI target is reachable.

## Step 2: Create local configuration

Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
notepad .env
```

Fill these values with the *locally installed* crAPI instance's disposable accounts:

```text
CRAPI_ENABLE=true
CRAPI_A_EMAIL=...
CRAPI_A_PASSWORD=...
CRAPI_A_VIN=...
CRAPI_B_EMAIL=...
CRAPI_B_PASSWORD=...
CRAPI_B_VIN=...
```

The VINs must be the exact values independently observed during vehicle registration / on each user's dashboard. They must differ. If known, optionally set `CRAPI_A_UUID` and `CRAPI_B_UUID` to make fixture matching stricter. Never use a real person's account, share `.env`, or commit it to Git.

The original project already ignores `.env` in `.gitignore`. Use `git status` to double-check before pushing.

## Step 3: Run the verifier

First ensure crAPI itself is running on the same computer at `http://127.0.0.1:8888`.

**PowerShell window 1:**

```powershell
npm run start:crapi
```

**PowerShell window 2:**

```powershell
Invoke-RestMethod http://127.0.0.1:4100/api/health
Invoke-RestMethod http://127.0.0.1:4100/api/readiness | ConvertTo-Json -Depth 5
npm run demo:crapi
```

`/api/readiness` shows registered adapter IDs, NOT successful crAPI login. The demo run invokes the adapter's actual `ready()` checks, including two real logins and exact expected vehicle matches.

Expected for a correctly configured instance (illustrative, not yet observed live):

| Case | Check | Expected |
|---|---|---|
| C01 | A can read A's exact registered vehicle | PASS, HTTP 200 |
| C02 | B can read B's exact registered vehicle | PASS, HTTP 200 |
| C03 | Anonymous cannot retrieve A's protected vehicle | PASS, HTTP 401 or 403 |

If an actual protected fixture is exposed, the verifier must report FAIL. If the target is down, tokens expire, expected fixtures don't match, or response behavior is ambiguous, the verdict must be INCONCLUSIVE or the run must stop with NEEDS_SETUP. Never change the expected verdict just to make the demo green.

## Step 4: Troubleshooting

- **`npm error ENOENT package.json`**: Run `dir package.json`; you are in the wrong directory if it's missing.
- **crAPI connection refused**: Docker crAPI is not running on the same computer at port 8888.
- **Only Sprout appears in `/api/readiness`**: You ran `npm run dev` instead of `npm run start:crapi`, or `CRAPI_ENABLE=true` is missing.
- **`CRAPI_TEST_ACCOUNTS_OR_EXPECTED_VINS_NOT_CONFIGURED`**: Check all six required account/fixture fields in `.env`.
- **`CRAPI_LOGIN_OR_INDEPENDENT_FIXTURE_CHECK_FAILED`**: Check the correct local Docker instance, both accounts, exact VINs, and vehicle registration. No secrets are included in the error.
- **`SYNTHETIC_WRITE_NOT_APPROVED`**: Expected for writes; Phase 1 supports GET only.
- **C03 INCONCLUSIVE**: Inspect the status and reason code; do not assume 200 without the exact fixture is a PASS or FAIL.
- **Port 4100 already in use**: Stop the old `npm run dev` terminal before starting `npm run start:crapi`.

## Adapter design and security boundaries

- Registered only when `CRAPI_ENABLE=true`.
- Fixed approved request path: `/identity/api/v2/vehicle/vehicles`.
- Login is a trusted setup operation, not a generic user-controlled POST request.
- Localhost-only, no redirects, bounded response parsing, 5s adapter timeout, and generic runner timeout.
- Test suite uses stable resource references (`vehicle-a`, `vehicle-b`), not user-supplied arbitrary paths.
- Expected VINs/optional UUIDs come from independent setup; do not derive fixture identity from the very response under test.
- This is NOT a cross-user BOLA test: the list endpoint does not accept a target vehicle ID. A resource-specific private route must be separately verified before adding such a test.
- Credentials should be rotated if exposed in terminal screenshots. This project does not need real customer data.

## Next phase after the live baseline

1. Snehal identifies an actual protected resource-specific crAPI route and establishes a known record owned by B.
2. Suprita adds an exact reviewed route to the allowlist and a known fixture matcher for that record, without changing the generic engine.
3. Add positive owner controls and cross-user DENY tests. Report FAIL only when exact B-owned private data is returned to A (or independently confirmed unauthorized state changes).
4. Maulik displays the suite/run JSON from `/api/suites` and `/api/suites/:id/runs`.
5. Arjun independently verifies both positive and negative controls and captures reproducible evidence.

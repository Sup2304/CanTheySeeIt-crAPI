# CanTheySeeIt Generic Verifier V2 + GoodBasket: Windows quick start

This project is the merged verifier source and test integration, NOT the GoodBasket application itself. All test runs must target a private, synthetic local app.

## Check source and tests first (PowerShell)

1. Extract this zip in `Documents\CanTheySeeItV2` and open `CanTheySeeIt_Generic_Verifier_v2_MEMBER2_INTEGRATED` in VS Code.
2. In the VS Code terminal, with your working directory set to that folder, run:

```powershell
node -v
npm install
npm run typecheck
npm test
node --experimental-strip-types --test tests/integration/member2-v2-*.test.mjs
node --test apps/demo/security-test/tests/*.test.mjs
```

If `npm install` fails, share the exact error; don't run npm from `C:\Users\...` without changing to this project folder.

## GoodBasket target service (separate, required)

Obtain Snehal's complete GoodBasket local demo source, not just this verifier ZIP. In a separate PowerShell terminal, change into the GoodBasket folder, then run `npm install` and `npm run dev`. Verify it runs on `127.0.0.1:4000` and that its local-only trusted fixture adapter is enabled. Do not paste the generated `.runtime\adapter-key` contents into any chat or commit it.

## Verifier service (PowerShell)

In a *new terminal*, from this verifier project directory, set these variables (edit the GoodBasket folder path to match your real folder):

```powershell
$env:GROCERY_TARGET_URL = 'http://127.0.0.1:4000/'
$env:GROCERY_ADAPTER_KEY_FILE = "$HOME\Downloads\GoodBasket_Member2_Three_Role_Demo\.runtime\adapter-key"
$env:GROCERY_APPROVE_SYNTHETIC_SETUP = '1'  # only for authorized disposable synthetic data
$env:VERIFIER_PORT = '4100'
npm run dev
```

## Register and run main suite (third PowerShell terminal)

```powershell
Invoke-RestMethod 'http://127.0.0.1:4100/api/health'
Invoke-RestMethod 'http://127.0.0.1:4100/api/readiness'
node scripts/register-grocery-suites.mjs main
$body = @{revisionLabel='v1-protected';approveSyntheticWrites=$true} | ConvertTo-Json
$r = Invoke-RestMethod -Uri 'http://127.0.0.1:4100/api/suites/grocery-owner-staff-g01-g10-v2/run' -Method Post -ContentType 'application/json' -Body $body
$r.aggregateVerdict
$r.results | Format-Table testId, verdict, reasonCode
```

NOTE: Only run synthetic PATCH checks on a private local fixture you control. Running a suite creates actual changes to disposable records and then attempts trusted cleanup.

Do not register/rerun an unchanged suite with the same suiteId repeatedly: registration can return a 409 if it already exists; use the existing saved ID.

G11 (`node scripts/register-grocery-suites.mjs g11`) requires an actual authorized faulty local app revision; G12 requires `GROCERY_ENABLE_G12_FAULT=1` in the verifier terminal before startup. See the original team RUNBOOK.md from the uploaded integration package.

## Evidence status

- Successfully merged with verified original Generic Verifier V2 ZIP here.
- 11 adapter/suite integration offline tests passed here.
- 12 fixture contract offline tests passed here.
- Full npm/Vitest and live GoodBasket app integration NOT verified here (dependencies and complete GoodBasket source unavailable).
- Do not claim G01–G12 PASS until the actual services and evidence have been checked.

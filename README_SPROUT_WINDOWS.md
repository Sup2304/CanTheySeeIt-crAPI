# CanTheySeeIt — Sprout & Stone local integration (Windows)

This archive includes the original Generic Verifier V2 source, a new **Sprout & Stone trusted target adapter**, two **separate declarative test-suite files**, and the uploaded synthetic grocery lab under `lab/grocery-security-lab/`.

**Nothing is deployed.** Run only on your own laptop with synthetic, disposable data. Both services bind to loopback; never publish this deliberately vulnerable lab.

## Architecture, ports, and files

- `lab/grocery-security-lab/` — local application (port **4200**). The original source is preserved.
- `adapters/sprout-stone.adapter.ts` — trusted synthetic sessions, exact paths, known fixtures, snapshots, and reset. No arbitrary URL/test payloads from UI.
- `suites/sprout.g01-g10.json` — G01–G10, plus `G01B` checking customer B's own record.
- `suites/sprout-known-vulnerabilities.json` — separate S01–S05 checks that find the uploaded lab's *actual* planted bugs: order disclosure and shop-settings modification.
- `src/engine.ts`, `src/verdict.ts`, `src/httpRunner.ts`, etc. — unchanged reusable Generic Verifier V2 components.
- `src/server.ts` — registers the Sprout adapter instead of the previous, incompatible GoodBasket adapter. Verifier API port **4100**.
- `tests/sprout-live.mjs` — direct, real-HTTP end-to-end integration assertions using Node's TypeScript stripping. Does **not** depend on Express, Zod, Vitest, or tsx installation on the verifier side. Requires Node 22+.

**IMPORTANT:** `ADAPTER_REGISTERED` at `/api/readiness` is not proof the lab is running; the actual adapter checks readiness again on every suite run.

## First run: 2 terminals (smoke verification, no npm install needed)

Extract the ZIP and open the root folder in VS Code.

**Terminal 1: start the synthetic grocery app:**

```powershell
cd .\lab\grocery-security-lab
$env:PORT = '4200'
node .\src\app.mjs
```

If Express is not installed, the lab explicitly uses its included *mini-express preview fallback*. For the real Express environment, run `npm install` inside `lab/grocery-security-lab` and restart the server. The fallback smoke test validates the app's expected HTTP behavior, but is not proof of Express-specific compatibility.

**Terminal 2: from the integrated backend project root:**

```powershell
node --experimental-strip-types .\tests\sprout-live.mjs
```

Expected summary in the uploaded **vulnerable lab**:

- `sprout-grocery-g01-g10-v1 => PASS` (11 checks, including additional G01B)
- `sprout-lab-known-vulnerabilities-v1 => FAIL` (S03 detects another customer's protected order; S05 detects changed shop settings)
- `All Sprout & Stone integration assertions passed.`

The last message means the **verifier correctly detected the intentionally vulnerable application**. It does not mean the app is secure.

## Full API server: 3 terminals

Leave the lab running on **4200**. In another terminal at the integrated project root:

```powershell
npm install
npm run typecheck
npm test
npm run dev
```

Start another terminal at the project root for the REST calls:

```powershell
Invoke-RestMethod 'http://127.0.0.1:4100/api/health'
Invoke-RestMethod 'http://127.0.0.1:4100/api/readiness'
node .\scripts\register-sprout.mjs
```

Run the protected grocery suite (G01–G10, plus G01B):

```powershell
$body = @{ revisionLabel = 'sprout-vulnerable'; approveSyntheticWrites = $true } | ConvertTo-Json
$run = Invoke-RestMethod -Uri 'http://127.0.0.1:4100/api/suites/sprout-grocery-g01-g10-v1/run' -Method Post -ContentType 'application/json' -Body $body
$run.aggregateVerdict
$run.results | Format-Table testId, verdict, reasonCode
```

Run the separate lab's planted-vulnerability suite:

```powershell
$run2 = Invoke-RestMethod -Uri 'http://127.0.0.1:4100/api/suites/sprout-lab-known-vulnerabilities-v1/run' -Method Post -ContentType 'application/json' -Body $body
$run2.aggregateVerdict
$run2.results | Format-Table testId, verdict, reasonCode
```

Expected results: first suite PASS; second suite FAIL, with S03 `PRIVATE_FIXTURE_EXPOSED` and S05 `UNAUTHORIZED_STATE_CHANGED`.

### Review saved results

```powershell
Invoke-RestMethod 'http://127.0.0.1:4100/api/suites/sprout-lab-known-vulnerabilities-v1/runs'
```

The V2 server stores run history in `data/ledger.json` (ignored by Git). Never store credentials or raw response bodies there.

## G01–G12 coverage truthfully

| Cases | Current observed support |
| --- | --- |
| G01–G03 | Tested actual owner/peer/anonymous address GET responses |
| G04–G06 | Tested controlled address PATCH with independent authorized read-back and reset |
| G07–G09 | Tested owner/staff-equivalent inventory update, ordinary customer and anonymous denial |
| G10 | Tested denied attempt to change `ownerUserId` and unchanged state |
| G11 | **BLOCKED**: the lab does not currently contain the exact 403-while-persisting-data fault. The generic verdict algorithm supports it, but this specific local scenario is not demonstrated. |
| G12 | **BLOCKED**: the lab currently lacks an adapter-controlled session-expiry mechanism. Do not fabricate a PASS or test result. |

The laboratory has no distinct staff actor. The **owner** performs the G07 authorized inventory operation. If judges require `staff-1`, Snehal must add a separate synthetic staff account and update the agreed role/adapter contract.

## Regression demonstration: real code changes

Sprout & Stone has real authorization policy modules under `lab/grocery-security-lab/src/access.mjs` and `patches/`.

- `patches/access.secure.mjs` enforces order ownership and owner-only settings updates.
- `patches/access.vulnerable.mjs` intentionally omits these two checks.

Stop lab with `Ctrl+C`, copy the secure patch and restart the lab (port 4200):

```powershell
Copy-Item .\patches\access.secure.mjs .\src\access.mjs -Force
node .\src\app.mjs
```

(Commands above assume current directory is `lab/grocery-security-lab`.)

Rerun the **same saved** `sprout-lab-known-vulnerabilities-v1` suite with `revisionLabel='v1-protected'` and expect PASS. Then stop lab, replace policy with `patches/access.vulnerable.mjs`, restart and rerun label `v2-regression` to observe FAIL. Finally restore secure policy and rerun `v3-fixed` to observe PASS.

The revision label never sets or fakes verdicts; observed HTTP response and persisted-state changes do.

**Warning:** The laboratory's own `npm test` suite contains assertions that deliberately expect its initially vulnerable state. These are expected to fail after applying the secure policy patch. Use the generic verifier's saved suite to demonstrate security improvement.

## Notes for Snehal / Suprita / Arjun

- The Sprout adapter uses the known test-only credentials in the lab README. Tokens remain in the verifier process and are never sent to frontend API clients.
- The adapter verifies known synthetic private markers and seed values, refuses dirty fixtures at start, and uses owner-authorized reset after each controlled edit.
- G11 requires an isolated variant in which a PATCH returns an accepted denial but the intended state nevertheless changes (ideally as a clearly labeled local code fixture), plus a state read-back.
- G12 requires an explicit, synthetic-only capability to expire one session during verification, distinguish it from a normal ownership denial, and return INCONCLUSIVE.
- The previous GoodBasket adapter/suites remain in folders for reference but are **not registered** or executed here. Do not accidentally import both targets in a hackathon demo.
- The new verification code was exercised with real local HTTP in this environment via the mini-express fallback; the full TypeScript typecheck / npm/Vitest install must be run on your Windows laptop.

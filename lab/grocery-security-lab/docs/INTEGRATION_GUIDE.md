# Integrating the Grocery Lab with CanTheySeeIt?

**Integration status:** A runnable local lab and sample manifest are supplied. These are **not** proof that the current team's verifier already supports these endpoints or can onboard them without an adapter.

## Approved target

- Base URL: `http://127.0.0.1:4000` (or change `PORT` and `GROCERY_LAB_URL` consistently).
- `GET /api/health`: `{"status":"ok","app":"sprout-stone-grocery-lab","contractVersion":"grocery-lab-1"}`.
- `POST /api/auth/token`: trusted local script provides synthetic `email` + `password`, receives a disposable bearer `token`. Never expose it in a browser-facing onboarding response or persist it to Git.
- `GET /api/me` with `Authorization: Bearer ...`: returns `userId`, `displayName`, `role`, `email`. Use this to verify session identity before **and after** cross-user access tests.

## Supported identities and fixtures

| Actor | Role | Test records |
|---|---|---|
| `owner` | `owner` | Full shop settings and inventory management |
| `customer-a` | `customer` | `order-a-1001`, `address-a-101` |
| `customer-b` | `customer` | `order-b-1002`, `address-b-102` |
| `anonymous` | no credentials | No private records |

**There is no separate staff login.** In this specific shop, the owner is the only inventory editor. If the current QA matrix requires `staff-1`, explicitly update the contract rather than claiming the actor exists.

### Suggested verified API checks

| Test | Request & actor | Intended policy | Baseline vulnerable observation |
|---|---|---|---|
| OWN-1 | A `GET /api/orders/order-a-1001` | Own order readable | 200 + A marker |
| CROSS-1 | A `GET /api/orders/order-b-1002` | Other customer's order forbidden | **200 + B marker => FAIL** |
| CROSS-2 | B `GET /api/orders/order-a-1001` | Other customer's order forbidden | **200 + A marker => FAIL** |
| ANON-1 | Anonymous `GET /api/orders/order-a-1001` | Private read forbidden | 401 |
| ADMIN-1 | Owner `PATCH /api/shop/settings` | Owner can edit shop profile | 200 + changed field |
| ADMIN-2 | Customer B `PATCH /api/shop/settings` | Customers cannot edit | **200 + stored change => FAIL** |
| ADDR-1 | A `GET /api/addresses/address-a-101` | Own address readable | 200 |
| ADDR-2 | B `PATCH /api/addresses/address-a-101` | No cross-owner edit | 403 + unchanged record |
| STOCK-1 | Owner `PATCH /api/products/apple-01/inventory` | Owner can update stock | 200 + changed stock |
| STOCK-2 | Customer A `PATCH /api/products/apple-01/inventory` | Customer cannot update stock | 403 + unchanged stock |

**The verifier must confirm that the owner/customer identities and records are real**, and for every forbidden write use a separate privileged GET (before and after) to check *persisted state*, not just the HTTP status. Only make reversible changes against seeded fixtures.

## Supported test setup / cleanup sequence

1. Select the **approved** loopback project ID `sprout-stone-local-grocery-lab`.
2. Developer confirms each security promise (order ownership, owner-only settings, address ownership, owner-only inventory).
3. A **trusted server-side adapter** loads synthetic credentials, requests tokens through `/api/auth/token`, validates each role through `/api/me`, and resolves the stable fixture IDs and markers in `target-manifest.json`.
4. Treat the target manifest as **adapter-declared**, not source-inspected. If a true source inspector identifies these Express routes, record that separately with evidence.
5. Generate read checks and bounded, explicitly approved PATCH checks; do not call arbitrary methods or external hosts.
6. Before any write test, take snapshots through an authorized identity; after the test, independently read back and compare state.
7. Reset via `POST /api/lab/reset` using the owner's token. If reset is unsuccessful, do **not** attempt further write tests; mark them NOT_RUN/INCONCLUSIVE.
8. Store only sanitized request metadata, observed status, exact synthetic marker matches and change/no-change flags. Do not store raw bearer tokens, credentials or full address responses in public reports.

## Three-state expected verdicts

- **FAIL:** Verified unauthorized private record disclosure (matching B's ID/owner/marker) or unauthorized persisted modification.
- **PASS:** Required positive controls and sessions valid, expected denials observed, no record exposure or unauthorized state change, and every required check concluded.
- **INCONCLUSIVE:** Missing fixture, unexpected response with unverified state, expired session, server unreachable, reset not performed or anything else preventing trustworthy evidence.

A **200 alone is not a confirmed private leak**; the target record marker and owner must match. A **403 alone doesn't prove a write was blocked**; independently check persisted state. In this lab, a customer may see only their own order list while still being able to fetch another customer's order detail directly; that discrepancy is the target of the test.

## Compatibility notice

This project's JSON shapes and proposed policy identifiers are **examples**, not the existing `POST /api/promises` team's contract. Do not wire the manifest blindly into the current backend until Suprita, Snehal, Maulik and QA approve the shared schema and decide how multi-target adapters are represented.

## Regression demonstration

1. With vulnerable `src/access.mjs`, run `npm.cmd run verify` => actual **FAIL**.
2. Stop server; copy `patches/access.secure.mjs` to `src/access.mjs`; restart; rerun => actual **PASS**.
3. Stop; copy `patches/access.vulnerable.mjs` back; restart; rerun => actual **FAIL**.

For the desired **PASS → FAIL → PASS** order, start with secure code, use the vulnerable file for the middle revision, then restore secure code. Each step is a real backend source edit. The same manifest/fixtures/checks stay unchanged, and no revision label influences the result.

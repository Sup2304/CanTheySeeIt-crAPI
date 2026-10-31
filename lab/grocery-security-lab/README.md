# Sprout & Stone — Grocery Security Lab

A **fully runnable, deliberately vulnerable local grocery website** for testing CanTheySeeIt?'s authorization verification. All data is imaginary and resettable. The customer UI looks like a normal small-shop storefront; the lab flaws are in the API and are described separately in **[docs/REVEAL_AND_REPRODUCE.md](docs/REVEAL_AND_REPRODUCE.md)**.

> **Local-only lab:** Do not host this publicly, connect real accounts, process payments, or copy the deliberately vulnerable access-policy module into another application. The server binds to `127.0.0.1` only. It is a training fixture, not a production deployment template.

## Launch (Windows PowerShell + VS Code)

```powershell
cd grocery-security-lab
npm.cmd install
npm.cmd start
```

Open **http://127.0.0.1:4000** in your browser. If port 4000 is already used by another teammate's service, set `$env:PORT="4200"` before `npm.cmd start`, and set `$env:GROCERY_LAB_URL="http://127.0.0.1:4200"` before `npm.cmd run verify`. For a quick local preview without installing dependencies, `npm.cmd start` falls back to a tiny built-in HTTP compatibility layer; **install Express before claiming actual Express integration/onboarding**.

### Three demo logins

| Persona | Email | Password |
|---|---|---|
| Shopkeeper / owner | `owner@sprout.local` | `OwnerDemo!26` |
| Customer A / Alice | `alice@sprout.local` | `AppleA!26` |
| Customer B / Bob | `bob@sprout.local` | `BerryB!26` |

On the login page, click a persona card to fill its credentials, then click **Sign in**. The cards do not automatically sign you in.

Customers can browse/search the catalog, add products to a basket, place fictional orders, review their order history, and edit *their own* delivery address. The owner can view all orders, edit store details, change inventory quantities, and reset the synthetic lab data. The customer navigation does **not** show the shop-management screen.

## Integration / QA

1. Leave the server running.
2. In a second terminal, run:

```powershell
npm.cmd test
npm.cmd run verify
```

- `npm.cmd test` validates the **deliberately vulnerable initial variant** with eight local HTTP tests. Some passing tests deliberately confirm that the known vulnerabilities exist; **8/8 passing does not mean the shop is secure**.
- `npm.cmd run verify` behaves like a small independent checker. It validates identities, confirms an actual cross-user order disclosure and a customer-to-owner settings modification, prints PASS / FAIL / INCONCLUSIVE based on evidence, and resets the synthetic data afterward. The aggregate should be **FAIL in the starting vulnerable code**.
- `target-manifest.json` includes route candidates, actors, fixtures and proposed policies for integration with the team's verifier. It is deliberately labelled **adapter-declared**, not automatically source-discovered.

See [docs/INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md) for technical details and [docs/REVEAL_AND_REPRODUCE.md](docs/REVEAL_AND_REPRODUCE.md) for the step-by-step reveal and secure fix.

## Data safety and reset

- Data lives **in process memory**. Stop/restart the Node server to discard every temporary change and return to initial fixtures.
- The shopkeeper can select **Reset demo data** from Shop management. The trusted test adapter can also call `POST /api/lab/reset` with the owner's bearer session.
- Passwords and markers are only for synthetic training; do not reuse them for real accounts.
- Lab bearer tokens are generated per login in memory using `crypto.randomBytes`. Normal browser sign-ins get an HttpOnly session cookie; `/api/auth/token` can issue a bearer token to authorized **local test scripts**.
- `npm.cmd run verify` is explicitly blocked from contacting non-loopback targets.

## Changing the actual security code

This lab comes with two replacement modules in `patches/` for **a real server code change**, not a visual status toggle. See the reveal guide. Changing `src/access.mjs` and restarting changes actual authorization behavior. The independent checker should change from **FAIL** to **PASS** after fixing those policies, while normal customer/owner features still work.

## Files

- `public/` — responsive, browser-usable store UI (HTML/CSS/JS, no frontend dependencies).
- `src/app.mjs` — API, auth, catalog, orders, addresses, inventory, checkout and lab reset.
- `src/access.mjs` — isolated security policy functions to inspect and patch.
- `src/data.mjs` — seed users, products, private synthetic addresses and orders.
- `src/mini-express.mjs` — zero-dependency **local preview fallback**, not the production Express runtime.
- `patches/` — vulnerable and corrected access-control modules.
- `scripts/verify-security.mjs` — standalone local evidence-based authorization checker.
- `scripts/reproduce-bugs.ps1` — optional PowerShell reproduction script.
- `tests/lab.test.mjs` — eight runnable local HTTP acceptance tests for the initial vulnerable variant.
- `target-manifest.json` — integration notes and proposed security promise mapping.

## Limitations

This is a controlled OWASP-style teaching lab, **not** a real marketplace, not a generic security scanner, and not a ready-made adapter for the current CanTheySeeIt? API. The team must explicitly confirm its supported target profile and endpoint contracts. The lab has only three accounts; any test plans expecting a fourth `staff-1` account must instead use the shopkeeper as the inventory-editing actor or update the agreed contract. No payment processing or production encryption is provided.

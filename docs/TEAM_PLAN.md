# Four-person 24-hour work split — crAPI independent benchmark

## Shared definition of done
Our existing verifier runs a **real read-only authorization test** against an isolated local crAPI instance with two disposable identities. The result contains independent evidence; a failed login, expired token, or unknown fixture must be INCONCLUSIVE. The Sprout & Stone baseline keeps working.

| Owner | Workstream | Deliverables | Acceptance test |
|---|---|---|---|
| Suprita | Engine + crAPI adapter | `adapters/crapi.adapter.ts`, schema-safe test mapping, authentication in trusted adapter, exact fixture checks, readiness + redacted evidence | Unit tests and read-only suite produce credible verdict without engine duplication |
| Snehal | Local crAPI fixture and contract owner | Isolated Docker Compose lab, version pin, two disposable test users, documented own-resource IDs, legitimate user flows, reset/reseed guidance | Other team members can start the lab and view both accounts' own data |
| Maulik | Frontend | Target selector for Sprout/crAPI, suite runner UI, evidence and uncertainty, no JWT display | Dashboard consumes actual backend JSON, zero mocked results in live mode |
| Arjun | QA + evidence | Happy-path test cases, invalid-session tests, audit of claimed findings, clean-room repeatability, screenshots/report | Reproduce run from fresh clone; confirm false-positive controls and clean-up behavior |

## Shared contract gate: agree before parallel implementation
Snehal provides the following **documented** information; Suprita confirms it is safe and supported:
- Local crAPI address and version/commit (default `127.0.0.1:8888`).
- Normal sign-in flow, response shape and safe token handling for two disposable accounts.
- A self-owned readable record for each account (only approved GET operations in milestone 1).
- Independent expected ownership (fixture ID and exact marker) for both records.
- Known allowed paths for the verifier; no generic route scanning or guessing IDs.
- Known login/identity failure cases that must be INCONCLUSIVE.
- A way to reset lab state after test runs (for future write checks).

## Timeboxed milestones
- 0–2h: freeze original working demo and check repo; confirm branch/repo ownership.
- 2–5h: Snehal starts local lab and documents happy path; Suprita validates contracts; Maulik builds static UI shell; Arjun drafts test matrix.
- 5–10h: integrate GET-only owner/other-owner checks with 2 accounts; run positive controls; keep exact evidence.
- 10–14h: automate isolated read-only integration tests; dashboard wires to real API; QA independently reproduces.
- 14–18h: demonstrate evidence and run-history comparison, ensure Sprout unchanged.
- 18–22h: integration and clean-install tests, security review (no secrets in logs), pitch proof.
- 22–24h: freeze, record fallback demo, rehearse.

## Stretch only if time remains
BFLA as an additional **non-destructive, approved** test; BOPLA field-level read. Never add write tests without trusted before/after state and reset.

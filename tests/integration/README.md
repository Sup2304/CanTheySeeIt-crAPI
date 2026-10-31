# V2 bridge checks

Use the `node --experimental-strip-types --test tests/integration/member2-v2-adapter.test.mjs` offline command.
This checks the bridge against a controlled fixture source and a loopback identity endpoint,
not the real Express app, and does not install or exercise the complete generic V2 runner.

Full integration requires the approved synthetic app at 127.0.0.1:4000 and V2 verifier at
127.0.0.1:4100. See root RUNBOOK.md.

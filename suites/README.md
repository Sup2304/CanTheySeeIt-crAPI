# Declarative test suites (not yet defined)

Once the grocery environment and adapter are received, define the reviewed G01–G12
suite in a separate JSON file and send it to POST /api/suites. Supported keys:

`suiteId`, `title`, `originalRequirement`, `targetProfileId`, `confirmed:true`, `cases`.
Each case needs `testId`, `actorRef`, `resourceRef`, `operationRef`, `method` GET/PATCH,
`expectation` ALLOW/DENY, `requiredControls`, `acceptedDenialStatuses`, and for PATCH
`mutationRef` (refers to a trusted adapter-supplied synthetic payload, NOT raw JSON).

No guessed endpoint paths, synthetic records or G-cases are included here.

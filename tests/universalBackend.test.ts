import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";

import { analyzeProject } from "../src/analyzer/projectAnalyzer.js";
import { generateTestCandidates } from "../src/analyzer/testPlanner.js";
import { buildTestConfig } from "../src/analyzer/configBuilder.js";
import { executePermissionTests } from "../src/analyzer/genericExecutor.js";

test("Discovers routes and generates test candidates", async () => {
  const analysis = await analyzeProject("./samples/demo-app");
  const candidates = generateTestCandidates(analysis);

  assert.equal(analysis.routes.length, 3);
  assert.equal(candidates.length, 3);

  assert.ok(
    candidates.some(c => c.path === "/api/orders/:id")
  );

  assert.ok(
    candidates.every(c => c.requiresConfiguration)
  );
});

test("Executes real HTTP permission tests", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/api/products") {
      res.writeHead(200);
      res.end("Public");
    } else if (req.url === "/api/orders/123") {
      res.writeHead(403);
      res.end("Forbidden");
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>(resolve => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();

    assert.ok(address && typeof address !== "string");

    const analysis = await analyzeProject("./samples/demo-app");
    const candidates = generateTestCandidates(analysis);

    const config = buildTestConfig(
      `http://127.0.0.1:${address.port}`,
      candidates,
      [{ id: "anonymous", headers: {} }],
      [
        {
          candidateId: "AUTO-001",
          actor: "anonymous",
          expected: "allow",
          path: "/api/products"
        },
        {
          candidateId: "AUTO-002",
          actor: "anonymous",
          expected: "deny",
          path: "/api/orders/123"
        }
      ]
    );

    const results = await executePermissionTests(config);

    assert.equal(results.length, 2);
    assert.equal(results[0]?.verdict, "PASS");
    assert.equal(results[1]?.verdict, "PASS");

  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
});

test("Rejects external targets", async () => {
  await assert.rejects(
    executePermissionTests({
      baseUrl: "https://example.com",
      actors: [{ id: "anonymous", headers: {} }],
      tests: []
    }),
    /Only local applications/
  );
});

test("Rejects unconfirmed test candidates", async () => {
  const analysis = await analyzeProject("./samples/demo-app");
  const candidates = generateTestCandidates(analysis);

  assert.throws(
    () => buildTestConfig(
      "http://127.0.0.1:3000",
      candidates,
      [{ id: "anonymous", headers: {} }],
      [{
        candidateId: "DOES-NOT-EXIST",
        actor: "anonymous",
        expected: "deny",
        path: "/api/orders/123"
      }]
    ),
    /Unknown candidate/
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { executePermissionTests } from "../src/analyzer/genericExecutor.js";

test("Handles different HTTP responses correctly", async () => {
  const server = createServer((req, res) => {
    const statuses: Record<string, number> = {
      "/allowed": 200,
      "/denied": 403,
      "/unauthorized": 401,
      "/missing": 404,
      "/error": 500
    };

    res.writeHead(statuses[req.url ?? ""] ?? 404);
    res.end();
  });

  await new Promise<void>(resolve => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const results = await executePermissionTests({
      baseUrl: `http://127.0.0.1:${address.port}`,
      actors: [{ id: "anonymous", headers: {} }],
      tests: [
        { id: "T1", method: "GET", path: "/allowed", actor: "anonymous", expected: "allow" },
        { id: "T2", method: "GET", path: "/denied", actor: "anonymous", expected: "deny" },
        { id: "T3", method: "GET", path: "/unauthorized", actor: "anonymous", expected: "deny" },
        { id: "T4", method: "GET", path: "/allowed", actor: "anonymous", expected: "deny" },
        { id: "T5", method: "GET", path: "/missing", actor: "anonymous", expected: "allow" },
        { id: "T6", method: "GET", path: "/error", actor: "anonymous", expected: "allow" }
      ]
    });

    assert.deepEqual(
      results.map(r => r.verdict),
      ["PASS", "PASS", "PASS", "FAIL", "INCONCLUSIVE", "INCONCLUSIVE"]
    );

    console.table(results);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
});

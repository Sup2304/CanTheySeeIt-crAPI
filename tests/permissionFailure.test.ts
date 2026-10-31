import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { executePermissionTests } from "../src/analyzer/genericExecutor.js";

test("Detects unauthorized access as FAIL", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/private") {
      res.writeHead(200);
      res.end("Private information exposed");
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

    const results = await executePermissionTests({
      baseUrl: `http://127.0.0.1:${address.port}`,
      actors: [{ id: "anonymous", headers: {} }],
      tests: [{
        id: "SECURITY-001",
        method: "GET",
        path: "/private",
        actor: "anonymous",
        expected: "deny"
      }]
    });

    assert.equal(results.length, 1);
    assert.equal(results[0]?.status, 200);
    assert.equal(results[0]?.verdict, "FAIL");

    console.log("SECURITY TEST: Unauthorized access detected correctly");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
});

import type { GenericTestConfig } from "./testConfig.js";

export interface TestResult {
  id: string;
  actor: string;
  status: number | null;
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE";
  reason: string;
}

const BLOCKED_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "upgrade",
  "proxy-authorization",
  "proxy-connection",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-for"
]);

function validateBaseUrl(value: string): URL {
  const base = new URL(value);

  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(base.hostname)) {
    throw new Error("Only local applications are supported");
  }

  if (!["http:", "https:"].includes(base.protocol)) {
    throw new Error("Unsupported URL protocol");
  }

  if (base.username || base.password || base.search || base.hash) {
    throw new Error("Invalid base URL");
  }

  return base;
}

function validateHeaders(headers: Record<string, string>): void {
  for (const [name, value] of Object.entries(headers)) {
    if (BLOCKED_HEADERS.has(name.toLowerCase())) {
      throw new Error(`Restricted HTTP header: ${name}`);
    }

    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
      throw new Error("Invalid HTTP header name");
    }

    if (typeof value !== "string" || /[\r\n]/.test(value)) {
      throw new Error("Invalid HTTP header value");
    }
  }
}

export async function executePermissionTests(
  config: GenericTestConfig
): Promise<TestResult[]> {
  const base = validateBaseUrl(config.baseUrl);
  const results: TestResult[] = [];

  for (const test of config.tests) {
    const actor = config.actors.find(a => a.id === test.actor);

    if (!actor) {
      results.push({
        id: test.id,
        actor: test.actor,
        status: null,
        verdict: "INCONCLUSIVE",
        reason: "Actor not configured"
      });
      continue;
    }

    try {
      validateHeaders(actor.headers);

      if (
        !test.path.startsWith("/") ||
        test.path.startsWith("//") ||
        test.path.includes("\\") ||
        /[\r\n]/.test(test.path)
      ) {
        throw new Error("Invalid test path");
      }

      const url = new URL(test.path, base);

      if (url.origin !== base.origin) {
        throw new Error("Cross-origin request blocked");
      }

      const response = await fetch(url, {
        method: test.method,
        headers: actor.headers,
        redirect: "manual",
        signal: AbortSignal.timeout(5000)
      });

      const allowed = response.status >= 200 && response.status < 300;
      const denied = response.status === 401 || response.status === 403;

      let verdict: TestResult["verdict"] = "INCONCLUSIVE";

      if (test.expected === "allow") {
        verdict = allowed ? "PASS" : denied ? "FAIL" : "INCONCLUSIVE";
      } else {
        verdict = denied ? "PASS" : allowed ? "FAIL" : "INCONCLUSIVE";
      }

      results.push({
        id: test.id,
        actor: test.actor,
        status: response.status,
        verdict,
        reason: `Expected ${test.expected}; received HTTP ${response.status}`
      });
    } catch (error) {
      results.push({
        id: test.id,
        actor: test.actor,
        status: null,
        verdict: "INCONCLUSIVE",
        reason: error instanceof Error ? error.message : "Request failed"
      });
    }
  }

  return results;
}

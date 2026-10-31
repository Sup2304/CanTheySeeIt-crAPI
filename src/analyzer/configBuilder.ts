import type { TestCandidate } from "./testPlanner.js";
import type {
  GenericTestConfig,
  Permission,
  TestActor
} from "./testConfig.js";

export interface ConfirmedRule {
  candidateId: string;
  actor: string;
  expected: Permission;
  path: string;
}

export function buildTestConfig(
  baseUrl: string,
  candidates: TestCandidate[],
  actors: TestActor[],
  rules: ConfirmedRule[]
): GenericTestConfig {
  const tests: GenericTestConfig["tests"] = [];

  for (const rule of rules) {
    const candidate = candidates.find(c => c.id === rule.candidateId);

    if (!candidate) {
      throw new Error(`Unknown candidate: ${rule.candidateId}`);
    }

    if (candidate.method !== "GET") {
      throw new Error(`Unsupported method: ${candidate.method}`);
    }

    if (!actors.some(a => a.id === rule.actor)) {
      throw new Error(`Unknown actor: ${rule.actor}`);
    }

    if (!["allow", "deny"].includes(rule.expected)) {
      throw new Error("Expected permission must be confirmed");
    }

    if (
      !rule.path.startsWith("/") ||
      rule.path.startsWith("//") ||
      rule.path.includes(":")
    ) {
      throw new Error(`Invalid concrete path: ${rule.path}`);
    }

    tests.push({
      id: `${candidate.id}-${rule.actor}`,
      method: "GET",
      path: rule.path,
      actor: rule.actor,
      expected: rule.expected
    });
  }

  return { baseUrl, actors, tests };
}

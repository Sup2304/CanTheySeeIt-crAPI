import type { ProjectAnalysis, ProjectRoute } from "./projectAnalyzer.js";

export type ActorType = "owner" | "other-user" | "anonymous";

export interface TestCandidate {
  id: string;
  method: string;
  path: string;
  sourceFile: string;
  category: "OBJECT_ACCESS" | "AUTHENTICATION" | "GENERAL_ACCESS";
  description: string;
  actors: ActorType[];
  expectedPermissions: Record<ActorType, "allow" | "deny" | "unknown">;
  requiresConfiguration: boolean;
  missingConfiguration: string[];
}

function isObjectRoute(route: ProjectRoute): boolean {
  return /\/:(id|orderId|userId|documentId|resourceId|[a-zA-Z]+Id)(\/|$)/i.test(
    route.path
  );
}

export function generateTestCandidates(
  analysis: ProjectAnalysis
): TestCandidate[] {
  return analysis.routes.map((route, index) => {
    const objectRoute = isObjectRoute(route);

    const category: TestCandidate["category"] = objectRoute
      ? "OBJECT_ACCESS"
      : route.authenticationDetected
        ? "AUTHENTICATION"
        : "GENERAL_ACCESS";

    const missingConfiguration = [
      "Application base URL",
      "Expected permission rules",
      "Test account credentials or tokens",
    ];

    if (objectRoute) {
      missingConfiguration.push("Owner-controlled resource ID");
    }

    return {
      id: `AUTO-${String(index + 1).padStart(3, "0")}`,
      method: route.method,
      path: route.path,
      sourceFile: route.file,
      category,
      description: objectRoute
        ? `Verify whether different users can access ${route.path}`
        : `Verify access permissions for ${route.method} ${route.path}`,
      actors: ["owner", "other-user", "anonymous"],
      expectedPermissions: {
        owner: "unknown",
        "other-user": "unknown",
        anonymous: "unknown",
      },
      requiresConfiguration: true,
      missingConfiguration,
    };
  });
}

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";

export interface DiscoveredRoute {
  method: string;
  path: string;
  middleware: string[];
  authenticationDetected: boolean;
  authorizationStatus: "unknown";
  requiresVerification: boolean;
}

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
]);

export function scanRoutes(source: string): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];

  const ast = parse(source, {
    sourceType: "unambiguous",
    plugins: ["typescript", "jsx"],
  });

  traverse(ast, {
    CallExpression(path) {
      const call = path.node;
      const callee = call.callee;

      if (callee.type !== "MemberExpression") return;
      if (callee.property.type !== "Identifier") return;

      const method = callee.property.name.toLowerCase();

      if (!HTTP_METHODS.has(method)) return;

      if (callee.object.type !== "Identifier") return;

      const receiver = callee.object.name;

      if (receiver !== "app" && receiver !== "router") return;

      const firstArgument = call.arguments[0];

      if (!firstArgument || firstArgument.type !== "StringLiteral") {
        return;
      }

      const routePath = firstArgument.value;

      const middleware = call.arguments
        .slice(1, -1)
        .filter((arg) => arg.type === "Identifier")
        .map((arg) => (arg.type === "Identifier" ? arg.name : ""));

      const authenticationDetected = middleware.some((name) =>
        /auth|login|session|jwt|token/i.test(name)
      );

      routes.push({
        method: method.toUpperCase(),
        path: routePath,
        middleware,
        authenticationDetected,
        authorizationStatus: "unknown",
        requiresVerification: true,
      });
    },
  });

  return routes;
}
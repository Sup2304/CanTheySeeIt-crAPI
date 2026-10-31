import fs from "node:fs/promises";
import path from "node:path";
import { scanRoutes, type DiscoveredRoute } from "./routeScanner.js";

export interface ProjectRoute extends DiscoveredRoute {
  file: string;
}

export interface ProjectAnalysis {
  framework: string;
  projectPath: string;
  filesScanned: number;
  routes: ProjectRoute[];
  warnings: string[];
}

const IGNORED = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
]);

const EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

export async function analyzeProject(
  projectPath: string
): Promise<ProjectAnalysis> {
  const root = path.resolve(projectPath);

  const result: ProjectAnalysis = {
    framework: "express-candidate",
    projectPath: root,
    filesScanned: 0,
    routes: [],
    warnings: [],
  };

  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (IGNORED.has(entry.name)) continue;

      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!EXTENSIONS.has(path.extname(entry.name))) continue;

      const relativePath = path.relative(root, fullPath);

      try {
        const stat = await fs.stat(fullPath);

        if (stat.size > 1024 * 1024) {
          result.warnings.push(`Skipped large file: ${relativePath}`);
          continue;
        }

        const source = await fs.readFile(fullPath, "utf8");
        const routes = scanRoutes(source);

        result.filesScanned++;

        for (const route of routes) {
          result.routes.push({
            ...route,
            file: relativePath,
          });
        }
      } catch (error) {
        result.warnings.push(
          `Could not analyze ${relativePath}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }
  }

  await walk(root);
  return result;
}

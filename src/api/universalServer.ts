import express from "express";
import path from "node:path";
import { realpath, stat } from "node:fs/promises";

import { analyzeProject } from "../analyzer/projectAnalyzer.js";
import { generateTestCandidates } from "../analyzer/testPlanner.js";
import { executePermissionTests } from "../analyzer/genericExecutor.js";
import type { GenericTestConfig } from "../analyzer/testConfig.js";

const app = express();
const PORT = 4200;
const PROJECT_ROOT = path.resolve("workspace/projects");

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

// Only allow explicitly configured local frontend origins.
const allowedOrigins = new Set(
  (process.env.CTSI_FRONTEND_ORIGINS ??
    "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin) {
    if (!allowedOrigins.has(origin)) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, OPTIONS"
    );
  }

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

// HEALTH CHECK
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "CanTheySeeIt Universal Backend",
    version: "0.1.0"
  });
});

// ANALYZE A PROJECT
app.post("/api/analyze", async (req, res) => {
  try {
    const projectId = req.body?.projectId;

    if (
      typeof projectId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(projectId)
    ) {
      res.status(400).json({
        error: "Invalid projectId"
      });
      return;
    }

    const root = await realpath(PROJECT_ROOT);
    const projectPath = await realpath(
      path.join(PROJECT_ROOT, projectId)
    );

    if (!projectPath.startsWith(root + path.sep)) {
      res.status(403).json({
        error: "Project outside allowed directory"
      });
      return;
    }

    const info = await stat(projectPath);

    if (!info.isDirectory()) {
      res.status(400).json({
        error: "Project must be a directory"
      });
      return;
    }

    const analysis = await analyzeProject(projectPath);
    const candidates = generateTestCandidates(analysis);

    res.json({
      projectId,
      analysis,
      candidates
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      res.status(404).json({
        error: "Project not found"
      });
      return;
    }

    console.error("Analysis error:", error);
    res.status(500).json({
      error: "Analysis failed"
    });
  }
});

// EXECUTE CONFIRMED PERMISSION TESTS
app.post("/api/test", async (req, res) => {
  try {
    const config = req.body as GenericTestConfig;

    if (
      !config ||
      typeof config.baseUrl !== "string" ||
      !Array.isArray(config.actors) ||
      !Array.isArray(config.tests) ||
      config.actors.length > 10 ||
      config.tests.length > 100 ||
      !config.actors.every(
        a =>
          a &&
          typeof a.id === "string" &&
          a.headers &&
          typeof a.headers === "object" &&
          !Array.isArray(a.headers) &&
          Object.values(a.headers).every(
            value => typeof value === "string"
          )
      ) ||
      !config.tests.every(
        t =>
          t &&
          typeof t.id === "string" &&
          ["GET", "HEAD"].includes(t.method) &&
          typeof t.actor === "string" &&
          typeof t.path === "string" &&
          t.path.startsWith("/") &&
          !t.path.startsWith("//") &&
          !t.path.includes("\\") &&
          !/[\r\n]/.test(t.path) &&
          ["allow", "deny"].includes(t.expected)
      ) ||
      !config.tests.every(t =>
        config.actors.some(a => a.id === t.actor)
      )
    ) {
      res.status(400).json({
        error: "Invalid test configuration"
      });
      return;
    }

    const results = await executePermissionTests(config);

    res.json({
      total: results.length,
      passed: results.filter(
        r => r.verdict === "PASS"
      ).length,
      failed: results.filter(
        r => r.verdict === "FAIL"
      ).length,
      inconclusive: results.filter(
        r => r.verdict === "INCONCLUSIVE"
      ).length,
      results
    });
  } catch (error) {
    console.error("Test execution error:", error);
    res.status(400).json({
      error: "Unable to execute tests"
    });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(
    `CanTheySeeIt backend running at http://127.0.0.1:${PORT}`
  );
});

/**
 * 🌐 BOWO Web Server — Dashboard & API
 *
 * Express server with real-time dashboard,
 * REST API for agents, and WebSocket for live updates.
 */

import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Orchestrator } from "./orchestrator.js";
import { MemoryType } from "./memory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? "3001");

async function main() {
  const app = express();
  app.use(express.json());

  // Initialize BOWO
  const bowo = new Orchestrator({ logLevel: "warn" });

  // Serve static dashboard
  app.use(express.static(path.join(__dirname, "../public")));

  // ─── API Routes ───

  // System status
  app.get("/api/status", (req, res) => {
    res.json(bowo.getStatus());
  });

  // List agents
  app.get("/api/agents", (req, res) => {
    const status = bowo.getStatus();
    const emojis: Record<string, string> = {
      planner: "📋", architect: "🏗", backend: "⚙️", frontend: "🎨",
      qa: "✅", debug: "🔍", security: "🔒", devops: "🚀", reporter: "📊",
    };
    const agents = status.agents.map((name) => ({
      name,
      emoji: emojis[name] ?? "🤖",
      enabled: true,
    }));
    res.json({ agents });
  });

  // Memory summary
  app.get("/api/memory", (req, res) => {
    res.json(bowo.getMemory().getSummary());
  });

  // Memory entries
  app.get("/api/memory/entries", (req, res) => {
    const type = req.query.type as string | undefined;
    const agent = req.query.agent as string | undefined;
    const limit = parseInt(req.query.limit as string ?? "50");

    const entries = bowo.getMemory().query({
      type: type as any,
      agent,
      limit,
    });

    res.json({ entries });
  });

  // Execute a task
  app.post("/api/execute", async (req, res) => {
    const { task, agents } = req.body;

    if (!task) {
      return res.status(400).json({ error: "task is required" });
    }

    try {
      const result = await bowo.execute(task, { agents });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Recent pipelines
  app.get("/api/pipelines", (req, res) => {
    const mem = bowo.getMemory();
    const results = mem.query({ type: MemoryType.RESULT, limit: 20 });
    res.json({ pipelines: results });
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", version: "1.0.0", name: "BOWO" });
  });

  // SPA fallback (Express v5 syntax)
  app.get("/{*splat}", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
  });

  // ─── Start Server ───
  app.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════════╗
  ║       🌐 BOWO Dashboard v1.0                 ║
  ║  http://localhost:${PORT}                       ║
  ╚══════════════════════════════════════════════╝
    `);
  });
}

main().catch((err) => {
  console.error("❌ Server error:", err);
  process.exit(1);
});

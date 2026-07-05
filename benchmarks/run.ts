#!/usr/bin/env tsx
/**
 * BOWO Benchmark Runner
 *
 * Measures performance of core subsystems:
 *   1. Pipeline execution (sequential workflow vs DAG parallel)
 *   2. Agent response time (with vs without LLM)
 *   3. Memory read/write speed
 *   4. Checkpoint save/load speed
 *   5. Cache hit/miss performance
 *   6. Database CRUD operations
 *
 * Run:  npx tsx benchmarks/run.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ─── Source imports ──────────────────────────────────────────────────
import { BowoMemory, MemoryType } from "../src/memory.js";
import { Communication } from "../src/communication.js";
import { Workflow } from "../src/workflow.js";
import { CacheManager } from "../src/cache.js";
import { CheckpointManager, type Checkpoint } from "../src/checkpoint.js";
import { DatabaseManager } from "../src/database.js";
import {
  DAGExecutor,
  buildSequentialGraph,
  buildParallelGraph,
} from "../src/dag.js";
import { BaseAgent } from "../src/agents/base.js";
import type { TaskInput, TaskResult } from "../src/agents/base.js";

// ─── Helpers ────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface BenchResult {
  name: string;
  ops: number;
  totalMs: number;
  avgMs: number;
  opsPerSec: number;
  extra?: string;
}

function hrMs(start: number, end: number): number {
  return Math.round((end - start) * 100) / 100;
}

function opsPerSec(ops: number, ms: number): number {
  if (ms === 0) return Infinity;
  return Math.round((ops / ms) * 1000 * 100) / 100;
}

function formatTable(results: BenchResult[]): string {
  const nameWidth = Math.max(42, ...results.map((r) => r.name.length));
  const sep = "─".repeat(nameWidth) + "─┬───────────────┬──────────┬────────────┬─────────────┬──────────────";
  const sepMid = "─".repeat(nameWidth) + "─┼───────────────┼──────────┼────────────┼─────────────┼──────────────";
  const hdr = [
    "Benchmark".padEnd(nameWidth),
    "   Ops",
    " Total ms",
    "  Avg µs",
    "   Ops/s",
    "  Notes",
  ].join(" │ ");

  const lines: string[] = [sep, hdr, sepMid];
  for (const r of results) {
    const row = [
      r.name.padEnd(nameWidth),
      String(r.ops).padStart(8),
      r.totalMs.toFixed(2).padStart(10),
      (r.avgMs * 1000).toFixed(1).padStart(9),
      opsPerSec(r.ops, r.totalMs).toFixed(2).padStart(11),
      (r.extra ?? "").padStart(12),
    ].join(" │ ");
    lines.push(row);
  }
  lines.push(sep);
  return lines.join("\n");
}

function tmpDir(prefix: string): string {
  const dir = path.join(
    path.dirname(__dirname),
    ".bench-tmp",
    `${prefix}-${Date.now()}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function rmDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── Mock Agent (no LLM) ───────────────────────────────────────────

class MockAgent extends BaseAgent {
  constructor(name: string, memory: BowoMemory, comm: Communication) {
    super(
      {
        name,
        displayName: name,
        icon: "🤖",
        description: `Mock ${name}`,
        systemPrompt: "",
        capabilities: [],
      },
      memory,
      comm,
      null // no LLM
    );
  }

  async execute(input: TaskInput): Promise<TaskResult> {
    const start = performance.now();
    // Simulate minimal work
    const summary = `Done: ${input.goal}`;
    const duration = hrMs(start, performance.now());
    return {
      agent: this.config.name,
      taskId: input.taskId,
      status: "completed",
      summary,
      artifacts: [],
      duration,
    };
  }
}

// ─── Mock DAG Agent (lighter interface) ─────────────────────────────

function makeDAGAgent(name: string) {
  return {
    async execute(_input: any) {
      return {
        status: "completed",
        summary: `${name} done`,
        artifacts: [],
      };
    },
  };
}

// ─── 1. Pipeline Benchmark ──────────────────────────────────────────

async function benchPipelineSequential(ops: number): Promise<BenchResult> {
  const dir = tmpDir("pipeline-seq");
  try {
    const memory = new BowoMemory(path.join(dir, "memory"));
    const comm = new Communication();
    const workflow = new Workflow();

    const agents = ["planner", "architect", "backend", "qa", "reporter"];
    for (const name of agents) {
      const agent = new MockAgent(name, memory, comm);
      workflow.registerAgent(agent);
    }

    const steps = agents.map((name) => ({
      agentName: name,
      input: {
        taskId: `seq-${Date.now()}`,
        goal: `Sequential step: ${name}`,
        context: {},
      },
    }));

    const start = performance.now();
    for (let i = 0; i < ops; i++) {
      await workflow.runPipeline(`bench-seq-${i}`, steps);
    }
    const total = hrMs(start, performance.now());

    return {
      name: "Pipeline — Sequential (5 steps)",
      ops,
      totalMs: total,
      avgMs: Math.round((total / ops) * 100) / 100,
      opsPerSec: opsPerSec(ops, total),
      extra: `${agents.length} agents`,
    };
  } finally {
    rmDir(dir);
  }
}

async function benchDAGParallel(ops: number): Promise<BenchResult> {
  const dir = tmpDir("pipeline-dag");
  try {
    const memory = new BowoMemory(path.join(dir, "memory"));

    const agentNames = ["planner", "architect", "backend", "frontend", "qa"];
    const agentMap = new Map<string, { execute(input: any): Promise<any> }>();
    for (const name of agentNames) {
      agentMap.set(name, makeDAGAgent(name));
    }

    // Diamond DAG: planner → {architect, backend, frontend} → qa
    const graph = buildParallelGraph("bench-dag", [
      [{ agentName: "planner" }],
      [
        { agentName: "architect" },
        { agentName: "backend" },
        { agentName: "frontend" },
      ],
      [{ agentName: "qa" }],
    ]);

    const start = performance.now();
    for (let i = 0; i < ops; i++) {
      const executor = new DAGExecutor(agentMap, memory);
      await executor.execute(graph, { run: i });
    }
    const total = hrMs(start, performance.now());

    return {
      name: "Pipeline — DAG Parallel (5 nodes, 3 waves)",
      ops,
      totalMs: total,
      avgMs: Math.round((total / ops) * 100) / 100,
      opsPerSec: opsPerSec(ops, total),
      extra: "parallel waves",
    };
  } finally {
    rmDir(dir);
  }
}

// ─── 2. Agent Response Benchmark ────────────────────────────────────

async function benchAgentWithoutLLM(ops: number): Promise<BenchResult> {
  const dir = tmpDir("agent-nollm");
  try {
    const memory = new BowoMemory(path.join(dir, "memory"));
    const comm = new Communication();
    const agent = new MockAgent("mock", memory, comm);

    const start = performance.now();
    for (let i = 0; i < ops; i++) {
      await agent.execute({
        taskId: `no-llm-${i}`,
        goal: "Test without LLM",
        context: {},
      });
    }
    const total = hrMs(start, performance.now());

    return {
      name: "Agent Response — Without LLM",
      ops,
      totalMs: total,
      avgMs: Math.round((total / ops) * 100) / 100,
      opsPerSec: opsPerSec(ops, total),
      extra: "mock agent",
    };
  } finally {
    rmDir(dir);
  }
}

async function benchAgentWithLLM(ops: number): Promise<BenchResult> {
  // When no LLM is configured, the agent still goes through the tools
  // layer. This benchmarks the overhead of the LLM tool path when
  // the LLM is unavailable (immediate rejection).
  const dir = tmpDir("agent-witllm");
  try {
    const memory = new BowoMemory(path.join(dir, "memory"));
    const comm = new Communication();
    const agent = new MockAgent("mock-llm", memory, comm);

    // Simulate calling llmReason (which returns "LLM not available")
    const start = performance.now();
    for (let i = 0; i < ops; i++) {
      await (agent as any).llmReason("test prompt");
    }
    const total = hrMs(start, performance.now());

    return {
      name: "Agent Response — LLM path (unavailable)",
      ops,
      totalMs: total,
      avgMs: Math.round((total / ops) * 100) / 100,
      opsPerSec: opsPerSec(ops, total),
      extra: "no provider",
    };
  } finally {
    rmDir(dir);
  }
}

// ─── 3. Memory Benchmark ────────────────────────────────────────────

async function benchMemoryWrite(ops: number): Promise<BenchResult> {
  const dir = tmpDir("memory-write");
  try {
    const memory = new BowoMemory(path.join(dir, "memory"));

    const start = performance.now();
    for (let i = 0; i < ops; i++) {
      memory.store(MemoryType.STATE, "bench", { index: i, data: "x".repeat(64) });
    }
    const total = hrMs(start, performance.now());

    return {
      name: "Memory — Write",
      ops,
      totalMs: total,
      avgMs: Math.round((total / ops) * 100) / 100,
      opsPerSec: opsPerSec(ops, total),
    };
  } finally {
    rmDir(dir);
  }
}

async function benchMemoryRead(ops: number): Promise<BenchResult> {
  const dir = tmpDir("memory-read");
  try {
    const memory = new BowoMemory(path.join(dir, "memory"));

    // Pre-populate
    const count = Math.min(ops, 500);
    for (let i = 0; i < count; i++) {
      memory.store(MemoryType.STATE, "bench", { index: i });
    }

    const start = performance.now();
    for (let i = 0; i < ops; i++) {
      memory.query({ type: MemoryType.STATE, agent: "bench", limit: 10 });
    }
    const total = hrMs(start, performance.now());

    return {
      name: "Memory — Read (query)",
      ops,
      totalMs: total,
      avgMs: Math.round((total / ops) * 100) / 100,
      opsPerSec: opsPerSec(ops, total),
      extra: `${count} entries`,
    };
  } finally {
    rmDir(dir);
  }
}

// ─── 4. Checkpoint Benchmark ────────────────────────────────────────

async function benchCheckpointSave(ops: number): Promise<BenchResult> {
  const dir = tmpDir("ckpt-save");
  try {
    const mgr = new CheckpointManager(path.join(dir, "checkpoints"));

    const sample: Checkpoint = {
      id: "bench-ckpt",
      pipelineId: "pipe-bench",
      stepIndex: 0,
      status: "saved",
      context: { goal: "bench", data: Array.from({ length: 50 }, (_, i) => i) },
      nodeResults: { step1: { status: "completed", duration: 42 } },
      timestamp: new Date().toISOString(),
    };

    const start = performance.now();
    for (let i = 0; i < ops; i++) {
      mgr.save({ ...sample, id: `ckpt-${i}` });
    }
    const total = hrMs(start, performance.now());

    return {
      name: "Checkpoint — Save",
      ops,
      totalMs: total,
      avgMs: Math.round((total / ops) * 100) / 100,
      opsPerSec: opsPerSec(ops, total),
    };
  } finally {
    rmDir(dir);
  }
}

async function benchCheckpointLoad(ops: number): Promise<BenchResult> {
  const dir = tmpDir("ckpt-load");
  try {
    const mgr = new CheckpointManager(path.join(dir, "checkpoints"));

    // Pre-save
    const count = Math.min(ops, 500);
    for (let i = 0; i < count; i++) {
      mgr.save({
        id: `ckpt-${i}`,
        pipelineId: "pipe-bench",
        stepIndex: i,
        status: "saved",
        context: { index: i },
        nodeResults: {},
        timestamp: new Date().toISOString(),
      });
    }

    const start = performance.now();
    for (let i = 0; i < ops; i++) {
      mgr.load(`ckpt-${i % count}`);
    }
    const total = hrMs(start, performance.now());

    return {
      name: "Checkpoint — Load",
      ops,
      totalMs: total,
      avgMs: Math.round((total / ops) * 100) / 100,
      opsPerSec: opsPerSec(ops, total),
      extra: `${count} files`,
    };
  } finally {
    rmDir(dir);
  }
}

// ─── 5. Cache Benchmark ─────────────────────────────────────────────

async function benchCacheHit(ops: number): Promise<BenchResult> {
  const cache = new CacheManager(600);

  // Populate
  for (let i = 0; i < ops; i++) {
    cache.set(`key-${i}`, { index: i, payload: "data".repeat(10) });
  }

  const start = performance.now();
  for (let i = 0; i < ops; i++) {
    cache.get(`key-${i}`);
  }
  const total = hrMs(start, performance.now());
  cache.destroy();

  return {
    name: "Cache — Hit (get)",
    ops,
    totalMs: total,
    avgMs: Math.round((total / ops) * 100) / 100,
    opsPerSec: opsPerSec(ops, total),
  };
}

async function benchCacheMiss(ops: number): Promise<BenchResult> {
  const cache = new CacheManager(600);

  const start = performance.now();
  for (let i = 0; i < ops; i++) {
    cache.get(`nonexistent-${i}`);
  }
  const total = hrMs(start, performance.now());
  cache.destroy();

  return {
    name: "Cache — Miss (get missing)",
    ops,
    totalMs: total,
    avgMs: Math.round((total / ops) * 100) / 100,
    opsPerSec: opsPerSec(ops, total),
  };
}

// ─── 6. Database Benchmark ──────────────────────────────────────────

async function benchDBInsert(ops: number): Promise<BenchResult> {
  const dir = tmpDir("db-insert");
  try {
    const db = new DatabaseManager(path.join(dir, "db"));
    const col = db.collection("bench");

    const start = performance.now();
    for (let i = 0; i < ops; i++) {
      col.insert({ name: `item-${i}`, value: i, tags: ["bench", "insert"] });
    }
    const total = hrMs(start, performance.now());

    return {
      name: "Database — Insert",
      ops,
      totalMs: total,
      avgMs: Math.round((total / ops) * 100) / 100,
      opsPerSec: opsPerSec(ops, total),
    };
  } finally {
    rmDir(dir);
  }
}

async function benchDBFind(ops: number): Promise<BenchResult> {
  const dir = tmpDir("db-find");
  try {
    const db = new DatabaseManager(path.join(dir, "db"));
    const col = db.collection("bench");

    // Pre-populate
    const count = Math.min(ops, 500);
    for (let i = 0; i < count; i++) {
      col.insert({ name: `item-${i}`, value: i, category: "bench" });
    }

    const start = performance.now();
    for (let i = 0; i < ops; i++) {
      col.find([{ field: "category", operator: "eq", value: "bench" }]);
    }
    const total = hrMs(start, performance.now());

    return {
      name: "Database — Find (filter)",
      ops,
      totalMs: total,
      avgMs: Math.round((total / ops) * 100) / 100,
      opsPerSec: opsPerSec(ops, total),
      extra: `${count} records`,
    };
  } finally {
    rmDir(dir);
  }
}

async function benchDBUpdate(ops: number): Promise<BenchResult> {
  const dir = tmpDir("db-update");
  try {
    const db = new DatabaseManager(path.join(dir, "db"));
    const col = db.collection("bench");

    // Pre-populate and collect IDs
    const ids: string[] = [];
    const count = Math.min(ops, 500);
    for (let i = 0; i < count; i++) {
      const r = col.insert({ name: `item-${i}`, value: i });
      ids.push(r.id);
    }

    const start = performance.now();
    for (let i = 0; i < ops; i++) {
      col.update(ids[i % count], { value: i, updated: true });
    }
    const total = hrMs(start, performance.now());

    return {
      name: "Database — Update",
      ops,
      totalMs: total,
      avgMs: Math.round((total / ops) * 100) / 100,
      opsPerSec: opsPerSec(ops, total),
      extra: `${count} records`,
    };
  } finally {
    rmDir(dir);
  }
}

async function benchDBInsertMany(ops: number): Promise<BenchResult> {
  const dir = tmpDir("db-insertmany");
  try {
    const db = new DatabaseManager(path.join(dir, "db"));
    const col = db.collection("bench");
    const batchSize = 100;

    const batch = Array.from({ length: batchSize }, (_, i) => ({
      name: `bulk-${i}`,
      value: i,
      tags: ["bulk"],
    }));

    const batches = Math.ceil(ops / batchSize);
    const start = performance.now();
    for (let i = 0; i < batches; i++) {
      col.insertMany(batch);
    }
    const total = hrMs(start, performance.now());
    const totalInserted = batches * batchSize;

    return {
      name: "Database — InsertMany (batch 100)",
      ops: totalInserted,
      totalMs: total,
      avgMs: Math.round((total / totalInserted) * 100) / 100,
      opsPerSec: opsPerSec(totalInserted, total),
    };
  } finally {
    rmDir(dir);
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║          🐾 BOWO Benchmark Suite                       ║");
  console.log("║          Performance measurement for core subsystems     ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const results: BenchResult[] = [];
  const OPS = 200; // operations per benchmark

  // ── 1. Pipelines ──
  console.log("▸ Running Pipeline benchmarks...");
  results.push(await benchPipelineSequential(OPS));
  results.push(await benchDAGParallel(OPS));

  // ── 2. Agent Response ──
  console.log("▸ Running Agent Response benchmarks...");
  results.push(await benchAgentWithoutLLM(OPS));
  results.push(await benchAgentWithLLM(OPS));

  // ── 3. Memory ──
  console.log("▸ Running Memory benchmarks...");
  results.push(await benchMemoryWrite(OPS));
  results.push(await benchMemoryRead(OPS));

  // ── 4. Checkpoints ──
  console.log("▸ Running Checkpoint benchmarks...");
  results.push(await benchCheckpointSave(OPS));
  results.push(await benchCheckpointLoad(OPS));

  // ── 5. Cache ──
  console.log("▸ Running Cache benchmarks...");
  results.push(await benchCacheHit(OPS));
  results.push(await benchCacheMiss(OPS));

  // ── 6. Database ──
  console.log("▸ Running Database benchmarks...");
  results.push(await benchDBInsert(OPS));
  results.push(await benchDBFind(OPS));
  results.push(await benchDBUpdate(OPS));
  results.push(await benchDBInsertMany(OPS));

  // ── Print results ──
  console.log("\n" + formatTable(results));

  // ── Save to JSON ──
  const outDir = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.join(outDir, "results.json");
  const jsonOut = {
    meta: {
      timestamp: new Date().toISOString(),
      opsPerBenchmark: OPS,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    results: results.map((r) => ({
      name: r.name,
      ops: r.ops,
      totalMs: r.totalMs,
      avgMs: r.avgMs,
      opsPerSec: opsPerSec(r.ops, r.totalMs),
      extra: r.extra ?? null,
    })),
  };
  fs.writeFileSync(outPath, JSON.stringify(jsonOut, null, 2), "utf-8");
  console.log(`\n✅ Results saved to ${outPath}\n`);
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});

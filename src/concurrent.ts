/**
 * BOWO Concurrent Executor — Parallel Pipeline Runner
 *
 * Runs multiple agent tasks in parallel using Promise.allSettled,
 * with configurable concurrency limits and result collection.
 */

import { EventEmitter } from "node:events";
import type { BaseAgent, TaskInput, TaskResult } from "./agents/base.js";

// ─── Types ──────────────────────────────────────────────

export interface ConcurrentTask {
  /** Name of the registered agent to execute this task */
  agentName: string;
  /** Input to pass to the agent */
  input: TaskInput;
  /** Optional priority — higher = scheduled first (default: 0) */
  priority?: number;
}

export interface SettledTaskResult {
  /** The original task definition */
  task: ConcurrentTask;
  /** The agent's result if fulfilled */
  result?: TaskResult;
  /** Error if the promise was rejected */
  error?: Error;
  /** "fulfilled" or "rejected" */
  status: "fulfilled" | "rejected";
}

export interface ConcurrentExecutionResult {
  /** Unique ID for this batch run */
  batchId: string;
  /** Overall status — "completed" if all succeeded, "partial" if some failed, "failed" if all failed */
  status: "completed" | "partial" | "failed";
  /** Individual results in the same order as input tasks */
  results: SettledTaskResult[];
  /** Number of successful tasks */
  succeeded: number;
  /** Number of failed tasks */
  failed: number;
  /** Total wall-clock duration in ms */
  duration: number;
}

export interface ConcurrencyOptions {
  /** Maximum number of tasks running in parallel (default: Infinity = no limit) */
  maxConcurrency?: number;
  /** Overall timeout in ms per individual task (0 = no limit) */
  perTaskTimeoutMs?: number;
  /** If true, log progress to console (default: false) */
  verbose?: boolean;
}

// ─── Helpers ────────────────────────────────────────────

/** Resolve a task with an optional timeout wrapper */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) return promise;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Task "${label}" timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ─── ConcurrentExecutor ─────────────────────────────────

export class ConcurrentExecutor extends EventEmitter {
  private agents: Map<string, BaseAgent> = new Map();
  private batchCounter = 0;

  /**
   * Register an agent so it can be invoked by name.
   */
  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.config.name, agent);
  }

  /**
   * Register multiple agents at once.
   */
  registerAgents(agents: BaseAgent[]): void {
    for (const agent of agents) {
      this.registerAgent(agent);
    }
  }

  /**
   * Execute multiple tasks concurrently with a concurrency limit.
   *
   * Uses a semaphore pattern on top of Promise.allSettled so that at
   * most `maxConcurrency` agents run at the same time.
   */
  async runBatch(
    tasks: ConcurrentTask[],
    options: ConcurrencyOptions = {}
  ): Promise<ConcurrentExecutionResult> {
    const { maxConcurrency = Infinity, perTaskTimeoutMs = 0, verbose = false } = options;

    const batchId = `batch-${String(++this.batchCounter).padStart(4, "0")}`;
    const startMs = Date.now();

    this.emit("batch:start", { batchId, taskCount: tasks.length });
    if (verbose) {
      console.log(`\n⚡ [${batchId}] Running ${tasks.length} tasks (concurrency: ${maxConcurrency === Infinity ? "unlimited" : maxConcurrency})`);
    }

    // Sort by priority descending so higher-priority tasks are enqueued first
    const sorted = [...tasks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    // Semaphore-based concurrency control
    const semaphore = new Semaphore(maxConcurrency);

    // Execute all tasks with semaphore-based concurrency
    const taskPromises: Array<Promise<SettledTaskResult>> = sorted.map(async (task) => {
      await semaphore.acquire();
      if (verbose) {
        console.log(`  ▶ [${batchId}] Starting: ${task.agentName} (${task.input.taskId})`);
      }

      try {
        const agent = this.agents.get(task.agentName);
        if (!agent) {
          throw new Error(`Agent "${task.agentName}" not registered`);
        }

        if ((agent.config as any).enabled === false) {
          throw new Error(`Agent "${task.agentName}" is disabled`);
        }

        const resultPromise = agent.execute(task.input);
        const result = await withTimeout(
          resultPromise,
          perTaskTimeoutMs,
          task.agentName
        );

        this.emit("task:complete", { batchId, task, result });
        if (verbose) {
          console.log(`  ✅ [${batchId}] Done: ${task.agentName} — ${result.status}`);
        }
        return { task, result, status: "fulfilled" as const };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.emit("task:error", { batchId, task, error });
        if (verbose) {
          console.log(`  ❌ [${batchId}] Failed: ${task.agentName} — ${error.message}`);
        }
        return { task, error, status: "rejected" as const };
      } finally {
        semaphore.release();
      }
    });

    const settled = await Promise.allSettled(taskPromises);

    // Map PromiseSettledResult to our SettledTaskResult shape
    const results: SettledTaskResult[] = [];
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i];
      if (s.status === "fulfilled") {
        results.push(s.value);
      } else {
        results.push({
          task: sorted[i],
          error: s.reason instanceof Error ? s.reason : new Error(String(s.reason)),
          status: "rejected",
        });
      }
    }

    const succeeded = results.filter((r) => r.status === "fulfilled" && !r.error).length;
    const failed = results.length - succeeded;
    const duration = Date.now() - startMs;

    const overallStatus = failed === 0 ? "completed" : succeeded === 0 ? "failed" : "partial";

    const executionResult: ConcurrentExecutionResult = {
      batchId,
      status: overallStatus,
      results,
      succeeded,
      failed,
      duration,
    };

    this.emit("batch:complete", executionResult);
    if (verbose) {
      console.log(`\n  📊 [${batchId}] ${overallStatus}: ${succeeded} ok, ${failed} failed — ${duration}ms`);
    }

    return executionResult;
  }

  /**
   * Convenience: run a single task with concurrency context (useful for one-offs).
   */
  async runSingle(
    task: ConcurrentTask,
    options: ConcurrencyOptions = {}
  ): Promise<ConcurrentExecutionResult> {
    return this.runBatch([task], options);
  }

  /**
   * Get list of registered agent names.
   */
  getAgentNames(): string[] {
    return [...this.agents.keys()];
  }
}

// ─── Semaphore ──────────────────────────────────────────

class Semaphore {
  private current = 0;
  private readonly max: number;
  private readonly queue: Array<() => void> = [];

  constructor(max: number) {
    this.max = max;
  }

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.current--;
    if (this.queue.length > 0) {
      this.current++;
      const next = this.queue.shift()!;
      next();
    }
  }
}

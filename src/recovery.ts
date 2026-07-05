/**
 * BOWO Error Recovery — Retry & Fallback System
 *
 * Provides retry logic with exponential backoff, fallback agent support,
 * and configurable recovery strategies for agent task execution.
 */

import { EventEmitter } from "node:events";
import type { BaseAgent, TaskInput, TaskResult } from "./agents/base.js";

// ─── Types ──────────────────────────────────────────────

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in ms, caps backoff growth (default: 30_000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Optional jitter: adds random ms in [0, jitterMs] to each delay (default: 500) */
  jitterMs?: number;
}

export interface RecoveryConfig {
  /** Retry configuration */
  retry?: RetryConfig;
  /** Ordered list of fallback agent names to try if primary agent fails */
  fallbackAgentNames?: string[];
  /** If true, treat "partial" status as a failure worth retrying (default: true) */
  retryOnPartial?: boolean;
  /** If true, stop retrying on "failed" status and only retry on exceptions (default: false) */
  onlyRetryExceptions?: boolean;
  /** Overall timeout in ms for the entire recovery chain (0 = no limit, default: 0) */
  overallTimeoutMs?: number;
  /** Per-attempt timeout in ms (0 = no limit, default: 0) */
  perAttemptTimeoutMs?: number;
}

export interface AttemptRecord {
  /** 1-based attempt number */
  attempt: number;
  /** Agent name used for this attempt */
  agentName: string;
  /** Was this the primary agent or a fallback? */
  isFallback: boolean;
  /** The result if the attempt succeeded */
  result?: TaskResult;
  /** The error if the attempt failed */
  error?: string;
  /** Duration of this attempt in ms */
  duration: number;
  /** Timestamp when this attempt started */
  startedAt: string;
}

export interface RecoveryResult {
  /** The final successful result, or the last failed result */
  result: TaskResult;
  /** Total number of attempts made */
  totalAttempts: number;
  /** Was the final result successful? */
  success: boolean;
  /** All attempt records for debugging */
  attempts: AttemptRecord[];
  /** Total wall-clock duration in ms */
  duration: number;
  /** Which agent ultimately produced the result */
  finalAgent: string;
  /** Number of retries performed on the primary agent */
  primaryRetries: number;
  /** Number of fallback agents tried */
  fallbacksUsed: number;
}

// ─── Helpers ────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoff(attempt: number, config: Required<RetryConfig>): number {
  // attempt is 0-based for the delay calculation
  const exponential = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const capped = Math.min(exponential, config.maxDelayMs);
  const jitter = Math.random() * config.jitterMs;
  return capped + jitter;
}

function isRetryable(result: TaskResult, config: RecoveryConfig): boolean {
  if (config.onlyRetryExceptions) return false;
  if (result.status === "failed") return true;
  if (result.status === "partial" && config.retryOnPartial !== false) return true;
  return false;
}

// ─── RecoveryExecutor ───────────────────────────────────

export class RecoveryExecutor extends EventEmitter {
  private agents: Map<string, BaseAgent> = new Map();
  private executionCounter = 0;

  /**
   * Register an agent.
   */
  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.config.name, agent);
  }

  /**
   * Register multiple agents.
   */
  registerAgents(agents: BaseAgent[]): void {
    for (const agent of agents) {
      this.registerAgent(agent);
    }
  }

  /**
   * Execute a task with full recovery logic:
   * 1. Try the primary agent up to `maxRetries` times with exponential backoff.
   * 2. On exhaustion, try each fallback agent in order (each also retried).
   * 3. Return the best result or the last failure.
   */
  async execute(
    primaryAgentName: string,
    input: TaskInput,
    config: RecoveryConfig = {}
  ): Promise<RecoveryResult> {
    const retryConfig: Required<RetryConfig> = {
      maxRetries: config.retry?.maxRetries ?? 3,
      baseDelayMs: config.retry?.baseDelayMs ?? 1_000,
      maxDelayMs: config.retry?.maxDelayMs ?? 30_000,
      backoffMultiplier: config.retry?.backoffMultiplier ?? 2,
      jitterMs: config.retry?.jitterMs ?? 500,
    };
    const fallbacks = config.fallbackAgentNames ?? [];

    const executionId = `recovery-${String(++this.executionCounter).padStart(4, "0")}`;
    const startMs = Date.now();
    const attempts: AttemptRecord[] = [];

    // Build the chain: primary retries → fallback agents (each with retries)
    const agentChain: Array<{ name: string; isFallback: boolean }> = [
      { name: primaryAgentName, isFallback: false },
      ...fallbacks.map((n) => ({ name: n, isFallback: true })),
    ];

    let lastResult: TaskResult | null = null;
    let lastError: string | null = null;

    this.emit("recovery:start", { executionId, primaryAgentName, input });

    for (const { name: agentName, isFallback } of agentChain) {
      const agent = this.agents.get(agentName);
      if (!agent) {
        lastError = `Agent "${agentName}" not registered`;
        attempts.push({
          attempt: attempts.length + 1,
          agentName,
          isFallback,
          error: lastError,
          duration: 0,
          startedAt: new Date().toISOString(),
        });
        continue;
      }

      if ((agent.config as any).enabled === false) {
        lastError = `Agent "${agentName}" is disabled`;
        attempts.push({
          attempt: attempts.length + 1,
          agentName,
          isFallback,
          error: lastError,
          duration: 0,
          startedAt: new Date().toISOString(),
        });
        continue;
      }

      // How many times to try this agent
      const maxAttempts = isFallback ? 1 : retryConfig.maxRetries;

      for (let attempt = 0; attempt <= maxAttempts; attempt++) {
        // Check overall timeout
        if (config.overallTimeoutMs && config.overallTimeoutMs > 0) {
          const elapsed = Date.now() - startMs;
          if (elapsed >= config.overallTimeoutMs) {
            lastError = `Overall timeout of ${config.overallTimeoutMs}ms exceeded (${elapsed}ms elapsed)`;
            this.emit("recovery:timeout", { executionId, elapsed });
            break;
          }
        }

        const attemptNum = attempts.length + 1;
        const attemptStart = new Date().toISOString();
        const attemptMs = Date.now();

        this.emit("recovery:attempt", { executionId, agentName, attempt: attemptNum, isFallback });

        try {
          let resultPromise = agent.execute(input);

          // Apply per-attempt timeout if configured
          if (config.perAttemptTimeoutMs && config.perAttemptTimeoutMs > 0) {
            resultPromise = withTimeout(
              resultPromise,
              config.perAttemptTimeoutMs,
              agentName
            );
          }

          const result = await resultPromise;
          const attemptDuration = Date.now() - attemptMs;

          attempts.push({
            attempt: attemptNum,
            agentName,
            isFallback,
            result,
            duration: attemptDuration,
            startedAt: attemptStart,
          });

          // Success or non-retryable failure
          if (result.status === "completed") {
            this.emit("recovery:success", { executionId, agentName, attempt: attemptNum });
            return buildResult(attempts, result, agentName, startMs);
          }

          // Retryable failure — check if we have more attempts
          if (isRetryable(result, config) && attempt < maxAttempts) {
            lastResult = result;
            const delay = computeBackoff(attempt, retryConfig);
            this.emit("recovery:retry", {
              executionId,
              agentName,
              attempt: attemptNum,
              nextDelay: Math.round(delay),
              reason: `Agent returned "${result.status}"`,
            });
            await sleep(delay);
            continue;
          }

          // Non-retryable or exhausted retries
          lastResult = result;
          this.emit("recovery:agent-exhausted", { executionId, agentName });
          break;
        } catch (err) {
          const attemptDuration = Date.now() - attemptMs;
          const errorMsg = err instanceof Error ? err.message : String(err);
          lastError = errorMsg;

          attempts.push({
            attempt: attemptNum,
            agentName,
            isFallback,
            error: errorMsg,
            duration: attemptDuration,
            startedAt: attemptStart,
          });

          this.emit("recovery:error", { executionId, agentName, attempt: attemptNum, error: errorMsg });

          // Retry on exception if we have attempts left
          if (attempt < maxAttempts) {
            const delay = computeBackoff(attempt, retryConfig);
            this.emit("recovery:retry", {
              executionId,
              agentName,
              attempt: attemptNum,
              nextDelay: Math.round(delay),
              reason: `Exception: ${errorMsg}`,
            });
            await sleep(delay);
            continue;
          }
        }
      }

      // If we reach here, this agent is exhausted — try next fallback
    }

    // All attempts exhausted — return the best available result
    const finalResult: TaskResult = lastResult ?? {
      agent: primaryAgentName,
      taskId: input.taskId,
      status: "failed",
      summary: lastError ?? "All recovery attempts exhausted",
      artifacts: [],
      duration: Date.now() - startMs,
    };

    return buildResult(attempts, finalResult, finalResult.agent, startMs);
  }
}

// ─── Internal helpers ───────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Task "${label}" timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function buildResult(
  attempts: AttemptRecord[],
  result: TaskResult,
  finalAgent: string,
  startMs: number
): RecoveryResult {
  const primaryRetries = attempts.filter((a) => !a.isFallback).length - 1;
  const fallbacksUsed = new Set(attempts.filter((a) => a.isFallback).map((a) => a.agentName)).size;

  return {
    result,
    totalAttempts: attempts.length,
    success: result.status === "completed",
    attempts,
    duration: Date.now() - startMs,
    finalAgent,
    primaryRetries: Math.max(0, primaryRetries),
    fallbacksUsed,
  };
}

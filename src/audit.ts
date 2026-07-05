/**
 * BOWO Audit — Action Logging & Audit Trail
 *
 * Records all agent actions (executions, file writes, commands run,
 * errors) with timestamps and metadata. Persists to a JSON file for
 * later analysis and replay.
 *
 * Usage:
 *   const audit = new AuditLog("output/audit.json");
 *   audit.log({ action: "file.write", agent: "backend", detail: { path: "src/index.ts" } });
 *   const entries = audit.query({ agent: "backend", action: "file.write" });
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ─── Types ──────────────────────────────────────────────

export enum AuditAction {
  /** Agent started a task execution */
  EXECUTION_STARTED = "execution.started",
  /** Agent completed a task */
  EXECUTION_COMPLETED = "execution.completed",
  /** Agent failed a task */
  EXECUTION_FAILED = "execution.failed",

  /** A file was read */
  FILE_READ = "file.read",
  /** A file was written or created */
  FILE_WRITE = "file.write",
  /** A file was deleted */
  FILE_DELETE = "file.delete",

  /** A shell command was executed */
  COMMAND_RUN = "command.run",
  /** A shell command completed */
  COMMAND_COMPLETED = "command.completed",
  /** A shell command failed */
  COMMAND_FAILED = "command.failed",

  /** LLM prompt was sent */
  LLM_PROMPT = "llm.prompt",
  /** LLM response was received */
  LLM_RESPONSE = "llm.response",
  /** LLM call failed */
  LLM_ERROR = "llm.error",

  /** An error occurred */
  ERROR = "error",
  /** A warning was logged */
  WARNING = "warning",
  /** General informational event */
  INFO = "info",

  /** Memory was stored or queried */
  MEMORY_OP = "memory.operation",

  /** Pipeline event (start, step, complete) */
  PIPELINE = "pipeline.event",

  /** Agent sent a message to another agent */
  AGENT_COMM = "agent.communication",

  /** Template was generated */
  TEMPLATE_GENERATED = "template.generated",

  /** Custom / user-defined action */
  CUSTOM = "custom",
}

export interface AuditEntry {
  /** Unique ID */
  id: string;
  /** Action type */
  action: AuditAction | string;
  /** Agent that performed the action (or "system") */
  agent: string;
  /** ISO timestamp */
  timestamp: string;
  /** Human-readable detail or message */
  detail: string;
  /** Structured metadata */
  metadata: Record<string, unknown>;
  /** Success or failure */
  success: boolean;
  /** Duration in ms (if applicable) */
  duration?: number;
  /** Error message (if failed) */
  error?: string;
}

export interface AuditStats {
  totalEntries: number;
  byAction: Record<string, number>;
  byAgent: Record<string, number>;
  failures: number;
  successes: number;
}

// ─── Audit Log ──────────────────────────────────────────

export class AuditLog {
  private entries: AuditEntry[] = [];
  private counter: number = 0;
  private storagePath: string;
  private maxEntries: number;

  constructor(storagePath: string = "output/audit.json", maxEntries: number = 10_000) {
    this.storagePath = storagePath;
    this.maxEntries = maxEntries;

    // Ensure directory exists
    const dir = path.dirname(this.storagePath);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.load();
  }

  // ── Persistence ─────────────────────────────────────

  private load(): void {
    if (fs.existsSync(this.storagePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.storagePath, "utf-8"));
        this.entries = Array.isArray(data) ? data : [];
        this.counter = this.entries.length;
      } catch {
        this.entries = [];
        this.counter = 0;
      }
    }
  }

  private save(): void {
    // Trim to max entries (keep most recent)
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
    fs.writeFileSync(this.storagePath, JSON.stringify(this.entries, null, 2), "utf-8");
  }

  // ── Core API ────────────────────────────────────────

  /**
   * Log an audit entry.
   */
  log(params: {
    action: AuditAction | string;
    agent?: string;
    detail?: string;
    metadata?: Record<string, unknown>;
    success?: boolean;
    duration?: number;
    error?: string;
  }): AuditEntry {
    this.counter++;
    const entry: AuditEntry = {
      id: `aud-${String(this.counter).padStart(6, "0")}`,
      action: params.action,
      agent: params.agent ?? "system",
      timestamp: new Date().toISOString(),
      detail: params.detail ?? "",
      metadata: params.metadata ?? {},
      success: params.success ?? true,
      duration: params.duration,
      error: params.error,
    };

    this.entries.push(entry);
    this.save();
    return entry;
  }

  /**
   * Log an execution started event.
   */
  logExecutionStarted(agent: string, goal: string, taskId: string): AuditEntry {
    return this.log({
      action: AuditAction.EXECUTION_STARTED,
      agent,
      detail: `Execution started: ${goal}`,
      metadata: { goal, taskId },
    });
  }

  /**
   * Log an execution completed event.
   */
  logExecutionCompleted(agent: string, taskId: string, duration: number, artifactCount: number): AuditEntry {
    return this.log({
      action: AuditAction.EXECUTION_COMPLETED,
      agent,
      detail: `Execution completed (${artifactCount} artifacts)`,
      metadata: { taskId, artifactCount },
      success: true,
      duration,
    });
  }

  /**
   * Log an execution failed event.
   */
  logExecutionFailed(agent: string, taskId: string, error: string): AuditEntry {
    return this.log({
      action: AuditAction.EXECUTION_FAILED,
      agent,
      detail: `Execution failed: ${error}`,
      metadata: { taskId },
      success: false,
      error,
    });
  }

  /**
   * Log a file write operation.
   */
  logFileWrite(agent: string, filePath: string, size: number): AuditEntry {
    return this.log({
      action: AuditAction.FILE_WRITE,
      agent,
      detail: `File written: ${filePath} (${size} bytes)`,
      metadata: { path: filePath, size },
    });
  }

  /**
   * Log a file read operation.
   */
  logFileRead(agent: string, filePath: string): AuditEntry {
    return this.log({
      action: AuditAction.FILE_READ,
      agent,
      detail: `File read: ${filePath}`,
      metadata: { path: filePath },
    });
  }

  /**
   * Log a command execution.
   */
  logCommand(agent: string, command: string, success: boolean, duration: number, output?: string, error?: string): AuditEntry {
    return this.log({
      action: success ? AuditAction.COMMAND_COMPLETED : AuditAction.COMMAND_FAILED,
      agent,
      detail: `Command ${success ? "completed" : "failed"}: ${command}`,
      metadata: { command, output: output?.slice(0, 500) },
      success,
      duration,
      error,
    });
  }

  /**
   * Log an LLM call.
   */
  logLLM(agent: string, prompt: string, tokens?: number, duration?: number): AuditEntry {
    return this.log({
      action: AuditAction.LLM_PROMPT,
      agent,
      detail: `LLM prompt sent (${tokens ?? "?"} tokens)`,
      metadata: { promptPreview: prompt.slice(0, 200), tokens },
      success: true,
      duration,
    });
  }

  /**
   * Log an error.
   */
  logError(agent: string, error: string, context?: Record<string, unknown>): AuditEntry {
    return this.log({
      action: AuditAction.ERROR,
      agent,
      detail: error,
      metadata: context ?? {},
      success: false,
      error,
    });
  }

  /**
   * Log a pipeline event.
   */
  logPipeline(agent: string, event: string, detail: string, metadata?: Record<string, unknown>): AuditEntry {
    return this.log({
      action: AuditAction.PIPELINE,
      agent,
      detail,
      metadata: { event, ...metadata },
    });
  }

  // ── Query ───────────────────────────────────────────

  /**
   * Query audit entries with filters.
   */
  query(filters: {
    action?: string;
    agent?: string;
    success?: boolean;
    since?: string; // ISO date string
    until?: string;
    limit?: number;
  }): AuditEntry[] {
    let results = [...this.entries];

    if (filters.action) {
      results = results.filter((e) => e.action === filters.action);
    }
    if (filters.agent) {
      results = results.filter((e) => e.agent === filters.agent);
    }
    if (filters.success !== undefined) {
      results = results.filter((e) => e.success === filters.success);
    }
    if (filters.since) {
      results = results.filter((e) => e.timestamp >= filters.since!);
    }
    if (filters.until) {
      results = results.filter((e) => e.timestamp <= filters.until!);
    }

    const limit = filters.limit ?? 100;
    return results.slice(-limit);
  }

  /**
   * Get recent N entries.
   */
  getRecent(n: number = 20): AuditEntry[] {
    return this.entries.slice(-n);
  }

  /**
   * Get an entry by ID.
   */
  getById(id: string): AuditEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  /**
   * Get all entries for a specific agent.
   */
  getByAgent(agent: string): AuditEntry[] {
    return this.entries.filter((e) => e.agent === agent);
  }

  /**
   * Get all failures.
   */
  getFailures(): AuditEntry[] {
    return this.entries.filter((e) => !e.success);
  }

  // ── Stats ───────────────────────────────────────────

  /**
   * Get aggregate statistics about the audit log.
   */
  getStats(): AuditStats {
    const stats: AuditStats = {
      totalEntries: this.entries.length,
      byAction: {},
      byAgent: {},
      failures: 0,
      successes: 0,
    };

    for (const entry of this.entries) {
      stats.byAction[entry.action] = (stats.byAction[entry.action] ?? 0) + 1;
      stats.byAgent[entry.agent] = (stats.byAgent[entry.agent] ?? 0) + 1;
      if (entry.success) {
        stats.successes++;
      } else {
        stats.failures++;
      }
    }

    return stats;
  }

  /**
   * Get total duration of all timed entries for an agent.
   */
  getTotalDuration(agent: string): number {
    return this.entries
      .filter((e) => e.agent === agent && e.duration != null)
      .reduce((sum, e) => sum + (e.duration ?? 0), 0);
  }

  // ── Maintenance ─────────────────────────────────────

  /**
   * Clear all audit entries.
   */
  clear(): void {
    this.entries = [];
    this.counter = 0;
    this.save();
  }

  /**
   * Get the total number of entries.
   */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Export all entries as JSON string.
   */
  export(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  /**
   * Get the time range of the log.
   */
  getTimeRange(): { first: string | null; last: string | null } {
    if (this.entries.length === 0) {
      return { first: null, last: null };
    }
    return {
      first: this.entries[0].timestamp,
      last: this.entries[this.entries.length - 1].timestamp,
    };
  }
}

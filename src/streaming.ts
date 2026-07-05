/**
 * BOWO Streaming — Real-Time Pipeline Progress Updates
 *
 * EventEmitter-based streaming system for real-time progress tracking
 * across the agent pipeline. Emits events for step lifecycle, artifact
 * generation, and pipeline-level status changes.
 *
 * Usage:
 *   const stream = new PipelineStream();
 *   stream.on("step:started", (e) => console.log(`▶ ${e.step}`));
 *   stream.on("pipeline:completed", (e) => console.log("Done!", e));
 *   stream.emitStepStarted({ pipelineId, agent: "backend", step: "Generate routes" });
 */

import { EventEmitter } from "node:events";

// ─── Event Types ────────────────────────────────────────

export enum StreamEvent {
  /** A pipeline started processing */
  PIPELINE_STARTED = "pipeline:started",
  /** A pipeline completed all steps */
  PIPELINE_COMPLETED = "pipeline:completed",
  /** A pipeline failed */
  PIPELINE_FAILED = "pipeline:failed",

  /** A step within a pipeline started */
  STEP_STARTED = "step:started",
  /** A step completed successfully */
  STEP_COMPLETED = "step:completed",
  /** A step failed */
  STEP_FAILED = "step:failed",
  /** A step was skipped (e.g. cached or not applicable) */
  STEP_SKIPPED = "step:skipped",

  /** A progress percentage update for long-running steps */
  STEP_PROGRESS = "step:progress",

  /** An artifact was generated (file, code, report, etc.) */
  ARTIFACT_GENERATED = "artifact:generated",

  /** A message or log line from a step */
  STEP_LOG = "step:log",

  /** Token usage reported for a step */
  TOKENS_USED = "tokens:used",
}

// ─── Payload Types ──────────────────────────────────────

export interface PipelineEvent {
  pipelineId: string;
  timestamp: string;
}

export interface PipelineStartPayload extends PipelineEvent {
  goal: string;
  agents: string[];
  model?: string;
}

export interface PipelineEndPayload extends PipelineEvent {
  status: "completed" | "failed" | "partial";
  duration: number;
  totalArtifacts: number;
  totalTokens: number;
}

export interface StepEvent extends PipelineEvent {
  agent: string;
  step: string;
  index: number;
  totalSteps: number;
}

export interface StepStartedPayload extends StepEvent {}

export interface StepCompletedPayload extends StepEvent {
  duration: number;
  artifactCount: number;
}

export interface StepFailedPayload extends StepEvent {
  error: string;
  duration: number;
}

export interface StepSkippedPayload extends StepEvent {
  reason: string;
}

export interface StepProgressPayload extends StepEvent {
  percent: number;
  message?: string;
}

export interface ArtifactPayload extends PipelineEvent {
  agent: string;
  name: string;
  type: string;
  path?: string;
  size?: number;
}

export interface StepLogPayload extends StepEvent {
  level: "info" | "warn" | "error" | "debug";
  message: string;
}

export interface TokensUsedPayload extends StepEvent {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ─── Pipeline Stream ────────────────────────────────────

export class PipelineStream extends EventEmitter {
  private pipelineId: string;
  private stepIndex: number = 0;
  private totalSteps: number = 0;
  private totalTokens: number = 0;
  private totalArtifacts: number = 0;
  private startedAt: number = 0;
  private stepStarts: Map<string, number> = new Map();

  constructor(pipelineId?: string) {
    super();
    this.pipelineId = pipelineId ?? `pipe-${Date.now()}`;
  }

  // ── Pipeline Lifecycle ────────────────────────────────

  /**
   * Emit that a pipeline has started.
   */
  emitPipelineStarted(goal: string, agents: string[], model?: string): void {
    this.startedAt = Date.now();
    this.stepIndex = 0;
    this.totalTokens = 0;
    this.totalArtifacts = 0;
    this.stepStarts.clear();

    const payload: PipelineStartPayload = {
      pipelineId: this.pipelineId,
      goal,
      agents,
      model,
      timestamp: new Date().toISOString(),
    };
    this.emit(StreamEvent.PIPELINE_STARTED, payload);
  }

  /**
   * Emit that a pipeline completed.
   */
  emitPipelineCompleted(status: "completed" | "failed" | "partial"): void {
    const duration = Date.now() - this.startedAt;
    const payload: PipelineEndPayload = {
      pipelineId: this.pipelineId,
      status,
      duration,
      totalArtifacts: this.totalArtifacts,
      totalTokens: this.totalTokens,
      timestamp: new Date().toISOString(),
    };
    this.emit(StreamEvent.PIPELINE_COMPLETED, payload);
  }

  /**
   * Emit that a pipeline failed.
   */
  emitPipelineFailed(error: string): void {
    const duration = Date.now() - this.startedAt;
    const payload: PipelineEndPayload = {
      pipelineId: this.pipelineId,
      status: "failed",
      duration,
      totalArtifacts: this.totalArtifacts,
      totalTokens: this.totalTokens,
      timestamp: new Date().toISOString(),
    };
    this.emit(StreamEvent.PIPELINE_FAILED, { ...payload, error });
  }

  /**
   * Set the total number of steps (for progress tracking).
   */
  setTotalSteps(total: number): void {
    this.totalSteps = total;
  }

  // ── Step Lifecycle ────────────────────────────────────

  /**
   * Emit that a step started.
   */
  emitStepStarted(agent: string, step: string): void {
    this.stepIndex++;
    const key = `${agent}:${step}`;
    this.stepStarts.set(key, Date.now());

    const payload: StepStartedPayload = {
      pipelineId: this.pipelineId,
      agent,
      step,
      index: this.stepIndex,
      totalSteps: this.totalSteps,
      timestamp: new Date().toISOString(),
    };
    this.emit(StreamEvent.STEP_STARTED, payload);
  }

  /**
   * Emit that a step completed successfully.
   */
  emitStepCompleted(agent: string, step: string, artifactCount: number = 0): void {
    const key = `${agent}:${step}`;
    const started = this.stepStarts.get(key) ?? Date.now();
    const duration = Date.now() - started;
    this.totalArtifacts += artifactCount;

    const payload: StepCompletedPayload = {
      pipelineId: this.pipelineId,
      agent,
      step,
      index: this.stepIndex,
      totalSteps: this.totalSteps,
      duration,
      artifactCount,
      timestamp: new Date().toISOString(),
    };
    this.emit(StreamEvent.STEP_COMPLETED, payload);
  }

  /**
   * Emit that a step failed.
   */
  emitStepFailed(agent: string, step: string, error: string): void {
    const key = `${agent}:${step}`;
    const started = this.stepStarts.get(key) ?? Date.now();
    const duration = Date.now() - started;

    const payload: StepFailedPayload = {
      pipelineId: this.pipelineId,
      agent,
      step,
      index: this.stepIndex,
      totalSteps: this.totalSteps,
      error,
      duration,
      timestamp: new Date().toISOString(),
    };
    this.emit(StreamEvent.STEP_FAILED, payload);
  }

  /**
   * Emit that a step was skipped.
   */
  emitStepSkipped(agent: string, step: string, reason: string): void {
    const payload: StepSkippedPayload = {
      pipelineId: this.pipelineId,
      agent,
      step,
      index: this.stepIndex,
      totalSteps: this.totalSteps,
      reason,
      timestamp: new Date().toISOString(),
    };
    this.emit(StreamEvent.STEP_SKIPPED, payload);
  }

  /**
   * Emit a progress update for the current step.
   */
  emitStepProgress(agent: string, step: string, percent: number, message?: string): void {
    const payload: StepProgressPayload = {
      pipelineId: this.pipelineId,
      agent,
      step,
      index: this.stepIndex,
      totalSteps: this.totalSteps,
      percent: Math.min(100, Math.max(0, percent)),
      message,
      timestamp: new Date().toISOString(),
    };
    this.emit(StreamEvent.STEP_PROGRESS, payload);
  }

  // ── Artifacts & Logging ───────────────────────────────

  /**
   * Emit that an artifact was generated.
   */
  emitArtifact(agent: string, name: string, type: string, path?: string, size?: number): void {
    const payload: ArtifactPayload = {
      pipelineId: this.pipelineId,
      agent,
      name,
      type,
      path,
      size,
      timestamp: new Date().toISOString(),
    };
    this.emit(StreamEvent.ARTIFACT_GENERATED, payload);
  }

  /**
   * Emit a log message from a step.
   */
  emitLog(agent: string, step: string, level: StepLogPayload["level"], message: string): void {
    const payload: StepLogPayload = {
      pipelineId: this.pipelineId,
      agent,
      step,
      index: this.stepIndex,
      totalSteps: this.totalSteps,
      level,
      message,
      timestamp: new Date().toISOString(),
    };
    this.emit(StreamEvent.STEP_LOG, payload);
  }

  /**
   * Emit token usage for a step.
   */
  emitTokens(agent: string, step: string, promptTokens: number, completionTokens: number): void {
    const total = promptTokens + completionTokens;
    this.totalTokens += total;

    const payload: TokensUsedPayload = {
      pipelineId: this.pipelineId,
      agent,
      step,
      index: this.stepIndex,
      totalSteps: this.totalSteps,
      promptTokens,
      completionTokens,
      totalTokens: total,
      timestamp: new Date().toISOString(),
    };
    this.emit(StreamEvent.TOKENS_USED, payload);
  }

  // ── Helpers ───────────────────────────────────────────

  /**
   * Get a summary of the current pipeline run.
   */
  getSummary(): {
    pipelineId: string;
    totalTokens: number;
    totalArtifacts: number;
    elapsed: number;
  } {
    return {
      pipelineId: this.pipelineId,
      totalTokens: this.totalTokens,
      totalArtifacts: this.totalArtifacts,
      elapsed: this.startedAt ? Date.now() - this.startedAt : 0,
    };
  }

  /**
   * Create a snapshot of all listeners currently attached.
   */
  getListenerSnapshot(): Record<string, number> {
    const events = Object.values(StreamEvent);
    const snapshot: Record<string, number> = {};
    for (const event of events) {
      snapshot[event] = this.listenerCount(event);
    }
    return snapshot;
  }
}

// ─── Convenience: Console Logger ────────────────────────

/**
 * Attach a pre-built console logger to a PipelineStream.
 * Prints colored status lines to stdout for each event.
 *
 * Returns a cleanup function that removes all listeners.
 */
export function attachConsoleLogger(stream: PipelineStream): () => void {
  stream.on(StreamEvent.PIPELINE_STARTED, (e: PipelineStartPayload) => {
    console.log(`\n🚀 Pipeline ${e.pipelineId} started`);
    console.log(`   Goal: ${e.goal}`);
    console.log(`   Agents: ${e.agents.join(", ")}`);
    if (e.model) console.log(`   Model: ${e.model}`);
  });

  stream.on(StreamEvent.STEP_STARTED, (e: StepStartedPayload) => {
    const pct = e.totalSteps > 0 ? ` [${e.index}/${e.totalSteps}]` : "";
    console.log(`\n▶ [${e.agent}] ${e.step}${pct}`);
  });

  stream.on(StreamEvent.STEP_COMPLETED, (e: StepCompletedPayload) => {
    const artStr = e.artifactCount > 0 ? ` (${e.artifactCount} artifacts)` : "";
    console.log(`  ✅ Done in ${(e.duration / 1000).toFixed(1)}s${artStr}`);
  });

  stream.on(StreamEvent.STEP_FAILED, (e: StepFailedPayload) => {
    console.log(`  ❌ Failed: ${e.error}`);
  });

  stream.on(StreamEvent.STEP_SKIPPED, (e: StepSkippedPayload) => {
    console.log(`  ⏭ Skipped: ${e.reason}`);
  });

  stream.on(StreamEvent.STEP_PROGRESS, (e: StepProgressPayload) => {
    const bar = `${"█".repeat(Math.floor(e.percent / 5))}${"░".repeat(20 - Math.floor(e.percent / 5))}`;
    const msg = e.message ? ` ${e.message}` : "";
    process.stdout.write(`\r  [${bar}] ${e.percent}%${msg}  `);
  });

  stream.on(StreamEvent.ARTIFACT_GENERATED, (e: ArtifactPayload) => {
    const pathStr = e.path ? ` → ${e.path}` : "";
    console.log(`  📄 Artifact: ${e.name} (${e.type})${pathStr}`);
  });

  stream.on(StreamEvent.PIPELINE_COMPLETED, (e: PipelineEndPayload) => {
    const statusIcon = e.status === "completed" ? "✅" : e.status === "partial" ? "⚠️" : "❌";
    console.log(`\n${statusIcon} Pipeline ${e.pipelineId}: ${e.status}`);
    console.log(`   Duration: ${(e.duration / 1000).toFixed(1)}s`);
    console.log(`   Artifacts: ${e.totalArtifacts} | Tokens: ${e.totalTokens}`);
  });

  stream.on(StreamEvent.PIPELINE_FAILED, (e: PipelineEndPayload & { error: string }) => {
    console.log(`\n❌ Pipeline FAILED: ${e.error}`);
  });

  // Return cleanup function
  const handlers: Array<{ event: string; fn: (...args: unknown[]) => void }> = [];

  const events = [
    StreamEvent.PIPELINE_STARTED,
    StreamEvent.STEP_STARTED,
    StreamEvent.STEP_COMPLETED,
    StreamEvent.STEP_FAILED,
    StreamEvent.STEP_SKIPPED,
    StreamEvent.STEP_PROGRESS,
    StreamEvent.ARTIFACT_GENERATED,
    StreamEvent.PIPELINE_COMPLETED,
    StreamEvent.PIPELINE_FAILED,
  ];

  // We can't easily get back the exact listeners, so we use a simpler approach:
  return () => {
    for (const event of events) {
      stream.removeAllListeners(event);
    }
  };
}

/**
 * Create a PipelineStream with a console logger already attached.
 */
export function createStreamedPipeline(pipelineId?: string): {
  stream: PipelineStream;
  detach: () => void;
} {
  const stream = new PipelineStream(pipelineId);
  const detach = attachConsoleLogger(stream);
  return { stream, detach };
}

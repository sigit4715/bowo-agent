/**
 * BOWO Sessions — Pipeline Execution State Management
 *
 * Saves, loads, and resumes pipeline execution state to JSON files
 * in output/sessions/. Tracks completed steps, artifacts, and remaining work.
 */

import fs from "node:fs";
import path from "node:path";
import { PipelineStatus, type Pipeline, type PipelineStep } from "./workflow.js";

// ─── Types ──────────────────────────────────────────────

export enum SessionStatus {
  CREATED = "created",
  RUNNING = "running",
  PAUSED = "paused",
  COMPLETED = "completed",
  FAILED = "failed",
}

export interface ArtifactRecord {
  agentName: string;
  stepIndex: number;
  name: string;
  type: string;
  content: string;
  path?: string;
  createdAt: string;
}

export interface StepSnapshot {
  index: number;
  agentName: string;
  input: {
    taskId: string;
    goal: string;
    context: Record<string, unknown>;
  };
  status: PipelineStep["status"];
  result?: {
    summary: string;
    artifacts: ArtifactRecord[];
    duration: number;
    tokens?: number;
    error?: string;
  };
  startedAt?: string;
  completedAt?: string;
}

export interface SessionData {
  sessionId: string;
  pipelineId: string;
  pipelineName: string;
  goal: string;
  status: SessionStatus;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  remainingSteps: number;
  steps: StepSnapshot[];
  artifacts: ArtifactRecord[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  metadata: Record<string, unknown>;
}

export interface SessionSummary {
  sessionId: string;
  goal: string;
  status: SessionStatus;
  progress: string; // e.g. "5/9"
  createdAt: string;
  updatedAt: string;
}

// ─── Constants ──────────────────────────────────────────

const DEFAULT_SESSIONS_DIR = "output/sessions";
const SESSION_PREFIX = "session";

// ─── Session Manager ────────────────────────────────────

export class SessionManager {
  private sessionsDir: string;
  private counter: number;

  constructor(sessionsDir: string = DEFAULT_SESSIONS_DIR) {
    this.sessionsDir = sessionsDir;
    this.counter = 0;
    fs.mkdirSync(this.sessionsDir, { recursive: true });
    this.counter = this.discoverExistingSessions();
  }

  // ── Session Lifecycle ──

  /**
   * Create a new session from a pipeline definition.
   * Returns the session ID for later use.
   */
  createSession(pipeline: Pipeline, goal: string): string {
    this.counter++;
    const sessionId = `${SESSION_PREFIX}-${String(this.counter).padStart(5, "0")}`;

    const steps: StepSnapshot[] = pipeline.steps.map((s, i) => ({
      index: i,
      agentName: s.agentName,
      input: { ...s.input },
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
    }));

    const session: SessionData = {
      sessionId,
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      goal,
      status: SessionStatus.CREATED,
      totalSteps: steps.length,
      completedSteps: 0,
      failedSteps: 0,
      skippedSteps: 0,
      remainingSteps: steps.length,
      steps,
      artifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    };

    this.saveSession(session);
    return sessionId;
  }

  /**
   * Load a session from disk by ID.
   */
  loadSession(sessionId: string): SessionData | null {
    const filePath = this.sessionPath(sessionId);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as SessionData;
  }

  /**
   * Save a session to disk.
   */
  saveSession(session: SessionData): void {
    session.updatedAt = new Date().toISOString();
    const filePath = this.sessionPath(session.sessionId);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8");
  }

  /**
   * Delete a session file from disk.
   */
  deleteSession(sessionId: string): boolean {
    const filePath = this.sessionPath(sessionId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }

  // ── Step Tracking ──

  /**
   * Record a step starting. Updates the session file.
   */
  recordStepStart(sessionId: string, stepIndex: number): SessionData | null {
    const session = this.loadSession(sessionId);
    if (!session) return null;

    const step = session.steps[stepIndex];
    if (!step) return null;

    step.status = "running";
    step.startedAt = new Date().toISOString();
    session.status = SessionStatus.RUNNING;
    this.recountSteps(session);
    this.saveSession(session);
    return session;
  }

  /**
   * Record a step completing successfully. Captures artifacts.
   */
  recordStepComplete(
    sessionId: string,
    stepIndex: number,
    result: StepSnapshot["result"]
  ): SessionData | null {
    const session = this.loadSession(sessionId);
    if (!session) return null;

    const step = session.steps[stepIndex];
    if (!step) return null;

    step.status = "completed";
    step.completedAt = new Date().toISOString();
    step.result = result;

    // Collect artifacts
    if (result?.artifacts) {
      for (const art of result.artifacts) {
        session.artifacts.push({
          ...art,
          agentName: step.agentName,
          stepIndex,
          createdAt: new Date().toISOString(),
        });
      }
    }

    this.recountSteps(session);
    this.saveSession(session);
    return session;
  }

  /**
   * Record a step failure.
   */
  recordStepFailure(
    sessionId: string,
    stepIndex: number,
    error: string
  ): SessionData | null {
    const session = this.loadSession(sessionId);
    if (!session) return null;

    const step = session.steps[stepIndex];
    if (!step) return null;

    step.status = "failed";
    step.completedAt = new Date().toISOString();
    step.result = {
      summary: `Step failed: ${error}`,
      artifacts: [],
      duration: 0,
      error,
    };

    this.recountSteps(session);
    this.saveSession(session);
    return session;
  }

  /**
   * Record a step being skipped (e.g. agent disabled).
   */
  recordStepSkipped(sessionId: string, stepIndex: number): SessionData | null {
    const session = this.loadSession(sessionId);
    if (!session) return null;

    const step = session.steps[stepIndex];
    if (!step) return null;

    step.status = "skipped";
    step.completedAt = new Date().toISOString();

    this.recountSteps(session);
    this.saveSession(session);
    return session;
  }

  // ── Resume Support ──

  /**
   * Pause a running session.
   */
  pauseSession(sessionId: string): SessionData | null {
    const session = this.loadSession(sessionId);
    if (!session) return null;
    if (session.status !== SessionStatus.RUNNING) return null;

    session.status = SessionStatus.PAUSED;
    this.saveSession(session);
    return session;
  }

  /**
   * Get the list of steps that still need execution (pending or paused steps).
   */
  getRemainingSteps(sessionId: string): StepSnapshot[] {
    const session = this.loadSession(sessionId);
    if (!session) return [];
    return session.steps.filter(
      (s) => s.status === "pending" || s.status === "running"
    );
  }

  /**
   * Build a pipeline definition from a saved session, containing only
   * the remaining (uncompleted) steps — useful for resuming execution.
   */
  buildResumePipeline(sessionId: string): { goal: string; steps: { agentName: string; input: StepSnapshot["input"] }[] } | null {
    const session = this.loadSession(sessionId);
    if (!session) return null;

    const remaining = this.getRemainingSteps(sessionId);
    return {
      goal: session.goal,
      steps: remaining.map((s) => ({
        agentName: s.agentName,
        input: { ...s.input },
      })),
    };
  }

  /**
   * Mark a session as completed (or failed) and record the final timestamp.
   */
  completeSession(sessionId: string, finalStatus: SessionStatus.COMPLETED | SessionStatus.FAILED, error?: string): SessionData | null {
    const session = this.loadSession(sessionId);
    if (!session) return null;

    session.status = finalStatus;
    session.completedAt = new Date().toISOString();
    this.recountSteps(session);

    if (error) {
      session.error = error;
    }

    this.saveSession(session);
    return session;
  }

  // ── Metadata ──

  /**
   * Attach arbitrary metadata to a session.
   */
  setMetadata(sessionId: string, key: string, value: unknown): SessionData | null {
    const session = this.loadSession(sessionId);
    if (!session) return null;

    session.metadata[key] = value;
    this.saveSession(session);
    return session;
  }

  // ── Queries ──

  /**
   * List all sessions (summaries only).
   */
  listSessions(): SessionSummary[] {
    const files = this.listSessionFiles();
    const summaries: SessionSummary[] = [];

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(this.sessionsDir, file), "utf-8");
        const session = JSON.parse(raw) as SessionData;
        summaries.push({
          sessionId: session.sessionId,
          goal: session.goal,
          status: session.status,
          progress: `${session.completedSteps + session.skippedSteps}/${session.totalSteps}`,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        });
      } catch {
        // Skip corrupt files
      }
    }

    return summaries.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Find sessions by status.
   */
  findByStatus(status: SessionStatus): SessionSummary[] {
    return this.listSessions().filter((s) => s.status === status);
  }

  /**
   * Find the most recent session with a given goal substring.
   */
  findByGoal(goalFragment: string): SessionSummary[] {
    return this.listSessions().filter((s) =>
      s.goal.toLowerCase().includes(goalFragment.toLowerCase())
    );
  }

  // ── Internal Helpers ──

  private recountSteps(session: SessionData): void {
    session.completedSteps = 0;
    session.failedSteps = 0;
    session.skippedSteps = 0;
    session.remainingSteps = 0;

    for (const step of session.steps) {
      switch (step.status) {
        case "completed":
          session.completedSteps++;
          break;
        case "failed":
          session.failedSteps++;
          break;
        case "skipped":
          session.skippedSteps++;
          break;
        case "pending":
        case "running":
          session.remainingSteps++;
          break;
      }
    }
  }

  private sessionPath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.json`);
  }

  private listSessionFiles(): string[] {
    if (!fs.existsSync(this.sessionsDir)) return [];
    return fs
      .readdirSync(this.sessionsDir)
      .filter((f) => f.endsWith(".json") && f.startsWith(SESSION_PREFIX));
  }

  private discoverExistingSessions(): number {
    const files = this.listSessionFiles();
    let maxNum = 0;
    const regex = new RegExp(`^${SESSION_PREFIX}-(\\d+)\\.json$`);

    for (const file of files) {
      const match = file.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    return maxNum;
  }
}

/**
 * 🤖 BOWO — Real-Time Streaming Response Server
 *
 * WebSocket-based streaming server that sends LLM responses
 * token-by-token to connected clients. Zero external deps.
 *
 * Usage:
 *   import { StreamingServer, streamHermesResponse } from "./streaming-server.js";
 *   const server = new StreamingServer();
 *   const session = server.createSession("my-agent");
 *   server.streamResponse(session.id, streamHermesResponse("Hello, world!"));
 *   server.subscribe(session.id, (event) => console.log(event));
 */

import { spawn, type ChildProcess } from "node:child_process";

// ─── Types ──────────────────────────────────────────────

export type StreamEventType = "token" | "done" | "error" | "metadata";

export interface StreamEvent {
  type: StreamEventType;
  data: string | object;
  timestamp: number;
}

export type StreamSessionStatus = "streaming" | "completed" | "error";

export interface StreamSession {
  id: string;
  agentId: string;
  status: StreamSessionStatus;
  startTime: number;
  tokens: number;
  events: StreamEvent[];
}

export interface StreamConfig {
  /** Max simultaneous active streams. Default: 16 */
  maxConcurrentStreams: number;
  /** Number of tokens to buffer before flushing. Default: 10 */
  tokenBufferSize: number;
  /** Milliseconds between buffer flushes. Default: 100 */
  flushIntervalMs: number;
  /** Milliseconds before completed sessions are auto-cleaned. Default: 300000 (5 min) */
  sessionTtlMs: number;
}

export interface StreamStats {
  totalSessions: number;
  activeSessions: number;
  totalTokens: number;
  avgTokensPerSession: number;
}

// ─── Defaults ───────────────────────────────────────────

const DEFAULT_CONFIG: StreamConfig = {
  maxConcurrentStreams: 16,
  tokenBufferSize: 10,
  flushIntervalMs: 100,
  sessionTtlMs: 5 * 60 * 1000,
};

// ─── Helpers ────────────────────────────────────────────

let _nextId = 0;

function generateSessionId(): string {
  _nextId++;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `stream-${ts}-${rand}-${_nextId}`;
}

// ─── StreamingServer ────────────────────────────────────

export class StreamingServer {
  private config: StreamConfig;
  private sessions = new Map<string, StreamSession>();
  private subscribers = new Map<string, Set<(event: StreamEvent) => void>>();
  private buffers = new Map<string, string[]>();
  private flushTimers = new Map<string, ReturnType<typeof setInterval>>();
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private cancelFlags = new Map<string, boolean>();

  constructor(config?: Partial<StreamConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Session Management ──

  /**
   * Create a new streaming session for an agent.
   * Throws if max concurrent streams exceeded.
   */
  createSession(agentId: string): StreamSession {
    const active = this.getActiveSessions();
    if (active.length >= this.config.maxConcurrentStreams) {
      throw new Error(
        `Max concurrent streams (${this.config.maxConcurrentStreams}) reached. ` +
        `Wait for an active session to complete or cancel one.`
      );
    }

    const session: StreamSession = {
      id: generateSessionId(),
      agentId,
      status: "streaming",
      startTime: Date.now(),
      tokens: 0,
      events: [],
    };

    this.sessions.set(session.id, session);
    this.subscribers.set(session.id, new Set());
    this.buffers.set(session.id, []);

    // Emit metadata event
    this.emitEvent(session.id, {
      type: "metadata",
      data: { sessionId: session.id, agentId, startTime: session.startTime },
      timestamp: Date.now(),
    });

    return session;
  }

  /**
   * Stream an async generator of tokens through a session.
   * Buffers tokens and flushes to subscribers periodically.
   */
  async streamResponse(
    sessionId: string,
    generator: AsyncGenerator<string>
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    if (session.status !== "streaming") {
      throw new Error(`Session ${sessionId} is not in streaming state (current: ${session.status})`);
    }

    // Start flush interval
    this.startFlushTimer(sessionId);

    const startTime = Date.now();
    let errored = false;
    let tokenCount = 0;

    try {
      // Consume the generator manually so we can yield to the event loop
      // periodically. `for await` on a synchronous async generator never
      // yields control, making cancellation impossible.
      let result = await generator.next();
      while (!result.done) {
        // Check cancellation
        if (this.cancelFlags.get(sessionId)) {
          break;
        }

        tokenCount++;
        session.tokens++;
        const buf = this.buffers.get(sessionId)!;
        buf.push(result.value);

        // Flush if buffer is full
        if (buf.length >= this.config.tokenBufferSize) {
          this.flushBuffer(sessionId);
        }

        // Yield to the event loop periodically so cancel flags are checked
        // and other I/O (WebSocket sends, etc.) can proceed.
        if (tokenCount % this.config.tokenBufferSize === 0) {
          await new Promise<void>((r) => setImmediate(r));
        }

        result = await generator.next();
      }
    } catch (err) {
      errored = true;
      const message = err instanceof Error ? err.message : String(err);
      this.emitEvent(sessionId, {
        type: "error",
        data: { message, elapsed: Date.now() - startTime },
        timestamp: Date.now(),
      });
      session.status = "error";
    }

    // Final flush of remaining tokens
    this.flushBuffer(sessionId);

    // Stop flush timer
    this.stopFlushTimer(sessionId);

    // Mark completed (unless error or cancel)
    if (!errored && session.status === "streaming") {
      session.status = "completed";
    }

    // Emit done event
    this.emitEvent(sessionId, {
      type: "done",
      data: {
        tokens: session.tokens,
        elapsedMs: Date.now() - startTime,
        status: session.status,
      },
      timestamp: Date.now(),
    });

    // Schedule cleanup
    this.scheduleCleanup(sessionId);
  }

  // ── Subscriber Management ──

  /**
   * Subscribe to events for a session.
   * Returns an unsubscribe function.
   */
  subscribe(
    sessionId: string,
    callback: (event: StreamEvent) => void
  ): () => void {
    if (!this.subscribers.has(sessionId)) {
      this.subscribers.set(sessionId, new Set());
    }
    this.subscribers.get(sessionId)!.add(callback);

    return () => {
      this.subscribers.get(sessionId)?.delete(callback);
    };
  }

  // ── Queries ──

  /** Get a session by ID. */
  getSession(sessionId: string): StreamSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Get all active (streaming) sessions. */
  getActiveSessions(): StreamSession[] {
    const active: StreamSession[] = [];
    for (const session of Array.from(this.sessions.values())) {
      if (session.status === "streaming") {
        active.push(session);
      }
    }
    return active;
  }

  /** Get aggregate statistics. */
  getStats(): StreamStats {
    let totalSessions = 0;
    let activeSessions = 0;
    let totalTokens = 0;

    for (const session of Array.from(this.sessions.values())) {
      totalSessions++;
      if (session.status === "streaming") {
        activeSessions++;
      }
      totalTokens += session.tokens;
    }

    return {
      totalSessions,
      activeSessions,
      totalTokens,
      avgTokensPerSession: totalSessions > 0 ? Math.round(totalTokens / totalSessions) : 0,
    };
  }

  // ── Cancellation ──

  /**
   * Cancel an active session.
   * Returns true if the session was found and cancelled.
   */
  cancelSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (session.status === "completed" || session.status === "error") {
      return false;
    }

    this.cancelFlags.set(sessionId, true);
    session.status = "error";

    // Flush any buffered tokens
    this.flushBuffer(sessionId);
    this.stopFlushTimer(sessionId);

    // Emit error event for cancellation
    this.emitEvent(sessionId, {
      type: "error",
      data: { message: "Session cancelled by user" },
      timestamp: Date.now(),
    });

    // Emit done
    this.emitEvent(sessionId, {
      type: "done",
      data: { tokens: session.tokens, elapsedMs: Date.now() - session.startTime, status: "error" },
      timestamp: Date.now(),
    });

    this.scheduleCleanup(sessionId);
    return true;
  }

  // ── Lifecycle / Cleanup ──

  /**
   * Remove a completed session and all its state.
   */
  removeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Don't remove active sessions
    if (session.status === "streaming") return false;

    const cleanupTimer = this.cleanupTimers.get(sessionId);
    if (cleanupTimer) {
      clearTimeout(cleanupTimer);
      this.cleanupTimers.delete(sessionId);
    }

    this.stopFlushTimer(sessionId);
    this.cancelFlags.delete(sessionId);
    this.buffers.delete(sessionId);
    this.subscribers.delete(sessionId);
    this.sessions.delete(sessionId);

    return true;
  }

  /**
   * Destroy the entire server — cancel all sessions, clear all state.
   */
  destroy(): void {
    for (const session of Array.from(this.sessions.values())) {
      if (session.status === "streaming") {
        this.cancelSession(session.id);
      }
    }

    for (const timer of Array.from(this.flushTimers.values())) {
      clearInterval(timer);
    }
    for (const timer of Array.from(this.cleanupTimers.values())) {
      clearTimeout(timer);
    }

    this.sessions.clear();
    this.subscribers.clear();
    this.buffers.clear();
    this.flushTimers.clear();
    this.cleanupTimers.clear();
    this.cancelFlags.clear();
  }

  // ── Internal ──

  private emitEvent(sessionId: string, event: StreamEvent): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.events.push(event);
    }

    const subs = this.subscribers.get(sessionId);
    if (subs) {
      for (const cb of Array.from(subs)) {
        try {
          cb(event);
        } catch {
          // Subscriber errors must not crash the server
        }
      }
    }
  }

  private flushBuffer(sessionId: string): void {
    const buf = this.buffers.get(sessionId);
    if (!buf || buf.length === 0) return;

    const batch = buf.splice(0, buf.length).join("");

    this.emitEvent(sessionId, {
      type: "token",
      data: batch,
      timestamp: Date.now(),
    });
  }

  private startFlushTimer(sessionId: string): void {
    this.stopFlushTimer(sessionId);

    const timer = setInterval(() => {
      this.flushBuffer(sessionId);
    }, this.config.flushIntervalMs);

    this.flushTimers.set(sessionId, timer);
  }

  private stopFlushTimer(sessionId: string): void {
    const timer = this.flushTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.flushTimers.delete(sessionId);
    }
  }

  private scheduleCleanup(sessionId: string): void {
    // Clear any existing timer
    const existing = this.cleanupTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.removeSession(sessionId);
      this.cleanupTimers.delete(sessionId);
    }, this.config.sessionTtlMs);

    this.cleanupTimers.set(sessionId, timer);
  }
}

// ─── Hermes Integration ─────────────────────────────────

/**
 * Stream a Hermes response as an async generator of token strings.
 *
 * Spawns `hermes chat` as a subprocess and yields stdout lines
 * as they arrive. Each meaningful chunk of text is yielded as
 * a separate token.
 *
 * @param prompt  The prompt to send to Hermes
 * @param model   Optional model override
 * @param options Optional: cliPath, profile, extra args
 */
export async function* streamHermesResponse(
  prompt: string,
  model?: string,
  options?: { cliPath?: string; profile?: string; timeoutMs?: number }
): AsyncGenerator<string> {
  const cliPath = options?.cliPath ?? "hermes";
  const timeoutMs = options?.timeoutMs ?? 120_000;

  const args: string[] = ["chat", "-q", prompt, "-Q"];

  if (model) {
    args.push("-m", model);
  }

  if (options?.profile) {
    args.push("-p", options.profile);
  }

  const proc: ChildProcess = spawn(cliPath, args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });

  const timer = setTimeout(() => {
    proc.kill("SIGTERM");
  }, timeoutMs);

  // Accumulate stdout remainder for partial lines
  let stdoutRemainder = "";
  let stderrRemainder = "";

  // Queue-based async delivery from process events → generator
  const tokenQueue: string[] = [];
  let resolveNext: (() => void) | null = null;
  let streamDone = false;
  let streamError: Error | null = null;

  function pushToken(token: string): void {
    tokenQueue.push(token);
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r();
    }
  }

  function signalDone(err?: Error): void {
    streamError = err ?? null;
    streamDone = true;
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r();
    }
  }

  proc.stdout!.on("data", (chunk: Buffer) => {
    const text = stdoutRemainder + chunk.toString();
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (i === lines.length - 1) {
        // Last piece — may be an incomplete line
        stdoutRemainder = line;
      } else if (line.trim().length > 0) {
        pushToken(line);
      }
    }
  });

  proc.stderr!.on("data", (chunk: Buffer) => {
    stderrRemainder += chunk.toString();
  });

  proc.on("close", (code) => {
    clearTimeout(timer);

    // Flush remaining stdout
    if (stdoutRemainder.trim().length > 0) {
      pushToken(stdoutRemainder);
      stdoutRemainder = "";
    }

    if (code !== 0 && code !== null) {
      const msg = stderrRemainder.trim() || `Hermes exited with code ${code}`;
      signalDone(new Error(msg));
    } else {
      signalDone();
    }
  });

  proc.on("error", (err) => {
    clearTimeout(timer);
    signalDone(err instanceof Error ? err : new Error(String(err)));
  });

  // Yield tokens as they arrive
  try {
    while (true) {
      if (tokenQueue.length > 0) {
        const token = tokenQueue.shift()!;
        yield token;
      } else if (streamDone) {
        break;
      } else {
        // Wait for next token
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
      }
    }

    // Yield any final error message as a token
    if (streamError) {
      yield `\n[ERROR] ${(streamError as Error).message}`;
    }
  } finally {
    // Ensure the process is cleaned up
    if (!proc.killed) {
      proc.kill("SIGTERM");
    }
  }
}

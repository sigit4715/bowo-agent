/**
 * BOWO Agent — Hermes-as-Brain Integration
 *
 * Wraps the Hermes CLI (`hermes chat`) to provide structured LLM access.
 * All methods shell out to hermes via child_process.execSync.
 */

import { execSync } from "node:child_process";

/** Options for the think() method. */
export interface ThinkOptions {
  /** Optional system prompt prepended to the user message */
  systemPrompt?: string;
  /** Override the timeout (default 120 000 ms) */
  timeoutMs?: number;
  /** Hermes profile to use */
  profile?: string;
}

/** A single subtask returned by plan(). */
export interface Subtask {
  id: number;
  title: string;
  description: string;
}

/** Full plan output from plan(). */
export interface PlanResult {
  goal: string;
  subtasks: Subtask[];
  raw: string;
}

/** Default timeout for hermes CLI calls. */
const DEFAULT_TIMEOUT_MS = 120_000;

// ────────────────────────────────────────────────────────────────────────

export class HermesBrain {
  private hermesPath: string;
  private defaultProfile: string;
  private defaultTimeoutMs: number;

  /**
   * @param hermesPath   Path / command name for the hermes binary (default "hermes").
   * @param profile      Default Hermes profile to use.
   * @param timeoutMs    Default timeout in milliseconds.
   */
  constructor(
    hermesPath?: string,
    profile?: string,
    timeoutMs?: number,
  ) {
    this.hermesPath = hermesPath ?? process.env["HERMES_PATH"] ?? "hermes";
    this.defaultProfile = profile ?? process.env["HERMES_PROFILE"] ?? "default";
    this.defaultTimeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Send a free-form prompt to Hermes and return the response text.
   */
  async think(prompt: string, options?: ThinkOptions): Promise<string> {
    const fullPrompt = options?.systemPrompt
      ? `[System: ${options.systemPrompt}]\n\n${prompt}`
      : prompt;

    return this.invokeHermes(fullPrompt, options?.timeoutMs, options?.profile);
  }

  /**
   * Structure a high-level goal into ordered subtasks.
   */
  async plan(goal: string): Promise<PlanResult> {
    const prompt = [
      "You are a project planner. Break the following goal into concrete, ordered subtasks.",
      "Respond ONLY with a numbered list where each line follows the format:",
      "  N. Title — Description",
      "",
      `Goal: ${goal}`,
    ].join("\n");

    const raw = await this.invokeHermes(prompt);
    const subtasks = this.parsePlan(raw);

    return { goal, subtasks, raw };
  }

  /**
   * Review a piece of code and return structured feedback.
   */
  async review(code: string): Promise<string> {
    const prompt = [
      "You are a senior code reviewer. Analyze the following code and provide feedback on:",
      "  1. Correctness and potential bugs",
      "  2. Performance concerns",
      "  3. Security issues",
      "  4. Code style and readability",
      "  5. Suggestions for improvement",
      "",
      "Be concise and actionable.",
      "",
      "```",
      code,
      "```",
    ].join("\n");

    return this.invokeHermes(prompt);
  }

  /**
   * Suggest improvements for the given context (code, architecture, docs, etc.).
   */
  async suggest(improvement: string): Promise<string> {
    const prompt = [
      "You are an expert software consultant. Based on the following context,",
      "suggest concrete, actionable improvements. Prioritize by impact.",
      "",
      improvement,
    ].join("\n");

    return this.invokeHermes(prompt);
  }

  /**
   * General-purpose chat — lightweight wrapper around think().
   */
  async chat(message: string): Promise<string> {
    return this.invokeHermes(message);
  }

  // ── Internals ────────────────────────────────────────────────────────

  /**
   * Execute `hermes chat -q "<prompt>" -Q` and return stdout.
   */
  private async invokeHermes(
    prompt: string,
    timeoutMs?: number,
    profile?: string,
  ): Promise<string> {
    const timeout = timeoutMs ?? this.defaultTimeoutMs;
    const prof = profile ?? this.defaultProfile;

    // Build the command. We use -q for the prompt and -Q for non-interactive output.
    // Escape single quotes in the prompt to avoid shell injection.
    const escaped = prompt.replace(/'/g, "'\\''");

    const cmd = prof === "default"
      ? `${this.hermesPath} chat -q '${escaped}' -Q`
      : `${this.hermesPath} chat -q '${escaped}' -Q --profile ${prof}`;

    try {
      const stdout = execSync(cmd, {
        timeout,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024, // 10 MB
        stdio: ["pipe", "pipe", "pipe"],
      });
      return stdout.trim();
    } catch (err: unknown) {
      if (err instanceof Error) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ETIMEOUT" || (err.message && err.message.includes("timeout"))) {
          throw new Error(`Hermes call timed out after ${timeout}ms`);
        }
        // execSync can embed details in err.message (command, status, stderr)
        throw new Error(`Hermes call failed: ${err.message}`);
      }
      throw err;
    }
  }

  /**
   * Parse plan output into structured Subtask[].
   * Expects lines like: "1. Title — Description"
   */
  private parsePlan(raw: string): Subtask[] {
    const lines = raw.split("\n").filter((l) => /^\d+\./.test(l.trim()));
    return lines.map((line, idx) => {
      const cleaned = line.replace(/^\d+\.\s*/, "");
      const parts = cleaned.split(/[—–-]\s*/);
      return {
        id: idx + 1,
        title: (parts[0] ?? "").trim(),
        description: (parts[1] ?? "").trim(),
      };
    });
  }
}

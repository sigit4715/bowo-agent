/**
 * BOWO BaseAgent — Abstract Base Class for All Agents
 *
 * Every specialist agent extends this class.
 * Includes LLM, File I/O, and Terminal tools.
 */

import type { BowoMemory } from "../memory.js";
import type { Communication } from "../communication.js";
import type { LLMClient } from "../llm.js";
import { createTools, type AgentTools, type ToolResult } from "../tools.js";

// ─── Types ──────────────────────────────────────────────

export interface AgentConfig {
  name: string;
  displayName: string;
  icon: string;
  description: string;
  systemPrompt: string;
  capabilities: string[];
}

export interface TaskInput {
  taskId: string;
  goal: string;
  context: Record<string, unknown>;
  parentTaskId?: string;
}

export interface TaskResult {
  agent: string;
  taskId: string;
  status: "completed" | "failed" | "partial";
  summary: string;
  artifacts: Artifact[];
  tokens?: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
  error?: string;
  duration: number;
}

export interface Artifact {
  name: string;
  type: string;
  content: string;
  path?: string;
}

// ─── Base Agent ─────────────────────────────────────────

export abstract class BaseAgent {
  readonly config: AgentConfig;
  protected memory: BowoMemory;
  protected communication: Communication;
  protected tools: AgentTools;
  protected llm: LLMClient | null;

  constructor(
    config: AgentConfig,
    memory: BowoMemory,
    communication: Communication,
    llm?: LLMClient | null,
    workDir?: string
  ) {
    this.config = config;
    this.memory = memory;
    this.communication = communication;
    this.llm = llm ?? null;
    this.tools = createTools(workDir ?? process.cwd(), this.llm);
  }

  /**
   * Execute a task. Override in subclasses.
   */
  abstract execute(input: TaskInput): Promise<TaskResult>;

  /**
   * Log a message to memory.
   */
  protected log(message: string, data?: unknown): void {
    this.memory.store("log" as any, this.config.name, { message, data, timestamp: new Date().toISOString() });
  }

  /**
   * Emit an event via communication bus.
   */
  protected emit(type: string, data: unknown): void {
    this.communication.send(type as any, this.config.name, "*", data);
  }

  /**
   * Get context from memory for this agent.
   */
  protected getContext(taskId: string): Record<string, unknown> {
    const entries = this.memory.query({
      agent: this.config.name,
      limit: 10,
    });
    const ctx: Record<string, unknown> = {};
    for (const entry of entries) {
      ctx[entry.type] = entry.content;
    }
    return ctx;
  }

  /**
   * Get all artifacts from previous agents in the pipeline.
   */
  protected getPreviousArtifacts(taskId: string): Artifact[] {
    const artifacts = this.memory.query({
      type: "artifact" as any,
      limit: 50,
    });
    return (artifacts as any[]).map((a: any) => a.content as Artifact);
  }

  // ─── Tool Helpers ───────────────────────────────────

  /**
   * Read a file.
   */
  protected readFile(path: string): ToolResult {
    return this.tools.file.readFile(path);
  }

  /**
   * Write a file.
   */
  protected writeFile(path: string, content: string): ToolResult {
    return this.tools.file.writeFile(path, content);
  }

  /**
   * List directory contents.
   */
  protected listDir(path?: string): ToolResult {
    return this.tools.file.listDir(path);
  }

  /**
   * Search files by name.
   */
  protected findFiles(pattern: string, dir?: string): ToolResult {
    return this.tools.file.findFiles(pattern, dir);
  }

  /**
   * Search content inside files.
   */
  protected grep(pattern: string, dir?: string, filePattern?: string): ToolResult {
    return this.tools.file.grep(pattern, dir, filePattern);
  }

  /**
   * Execute a shell command.
   */
  protected exec(command: string, options?: { timeout?: number; cwd?: string }): ToolResult {
    return this.tools.terminal.exec(command, options);
  }

  /**
   * Run npm command.
   */
  protected npm(args: string, cwd?: string): ToolResult {
    return this.tools.terminal.npm(args, cwd);
  }

  /**
   * Run git command.
   */
  protected git(args: string, cwd?: string): ToolResult {
    return this.tools.terminal.git(args, cwd);
  }

  /**
   * Ask LLM to reason about something.
   */
  protected async llmReason(task: string, context?: string): Promise<ToolResult> {
    if (!this.tools.llm) {
      return { success: false, output: "", error: "LLM not available", duration: 0 };
    }
    return this.tools.llm.reason(task, context);
  }

  /**
   * Ask LLM to generate code.
   */
  protected async llmGenerateCode(task: string, language?: string, context?: string): Promise<ToolResult> {
    if (!this.tools.llm) {
      return { success: false, output: "", error: "LLM not available", duration: 0 };
    }
    return this.tools.llm.generateCode(task, language, context);
  }

  /**
   * Ask LLM to review code.
   */
  protected async llmReviewCode(code: string, criteria?: string): Promise<ToolResult> {
    if (!this.tools.llm) {
      return { success: false, output: "", error: "LLM not available", duration: 0 };
    }
    return this.tools.llm.reviewCode(code, criteria);
  }

  /**
   * Ask LLM to fix a bug.
   */
  protected async llmFixBug(error: string, code?: string, context?: string): Promise<ToolResult> {
    if (!this.tools.llm) {
      return { success: false, output: "", error: "LLM not available", duration: 0 };
    }
    return this.tools.llm.fixBug(error, code, context);
  }

  /**
   * Ask LLM a general-purpose question and return the response content string.
   * Returns null if LLM is not available or the call fails.
   */
  protected async askLLM(task: string, context?: string): Promise<string | null> {
    try {
      if (!this.llm || !this.llm.isAvailable()) {
        return null;
      }
      const systemPrompt = this.config.systemPrompt;
      const userMessage = context ? `${task}\n\nContext:\n${context}` : task;
      const response = await this.llm.prompt(systemPrompt, userMessage);
      return response.content;
    } catch {
      return null;
    }
  }
}

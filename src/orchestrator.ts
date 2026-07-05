/**
 * 🧠 BOWO Orchestrator — The Brain
 *
 * Coordinates all agents, manages workflow execution,
 * and handles task routing. Supports LLM-powered reasoning.
 */

import { EventEmitter } from "node:events";
import { BowoMemory, MemoryType } from "./memory.js";
import { Communication } from "./communication.js";
import { Workflow } from "./workflow.js";
import { getLLM, type LLMConfig } from "./llm.js";
import type { TaskInput, TaskResult } from "./agents/base.js";

// Agents
import { PlannerAgent } from "./agents/planner.js";
import { ArchitectAgent } from "./agents/architect.js";
import { BackendAgent } from "./agents/backend.js";
import { FrontendAgent } from "./agents/frontend.js";
import { QAAgent } from "./agents/qa.js";
import { DebugAgent } from "./agents/debug.js";
import { SecurityAgent } from "./agents/security.js";
import { DevOpsAgent } from "./agents/devops.js";
import { ReporterAgent } from "./agents/reporter.js";

// ─── Types ──────────────────────────────────────────────

export interface OrchestratorConfig {
  maxRetries: number;
  timeoutMs: number;
  parallel: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
  llm?: Partial<LLMConfig>;
}

export interface ExecutionResult {
  pipelineId: string;
  status: string;
  goal: string;
  agentResults: { agent: string; status: string; duration: number; tokens?: number }[];
  totalArtifacts: number;
  totalDuration: number;
  report: unknown;
}

// ─── Orchestrator ───────────────────────────────────────

export class Orchestrator extends EventEmitter {
  private memory: BowoMemory;
  private comm: Communication;
  private workflow: Workflow;
  private config: OrchestratorConfig;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    super();

    this.config = {
      maxRetries: config.maxRetries ?? 3,
      timeoutMs: config.timeoutMs ?? 300_000,
      parallel: config.parallel ?? false,
      logLevel: config.logLevel ?? "info",
      llm: config.llm,
    };

    // Initialize LLM
    const llm = getLLM(this.config.llm);
    const llmStatus = llm.isAvailable() ? "🟢 Connected" : "🔴 Offline (rule-based mode)";
    this.log("info", `🧠 LLM: ${llmStatus} (${llm.getConfig().model})`);

    // Initialize core systems
    this.memory = new BowoMemory("output/memory");
    this.comm = new Communication();
    this.workflow = new Workflow();

    // Register all agents
    this.registerAgents();

    // Set up event logging
    this.setupLogging();
  }

  // ── Agent Registration ──

  private registerAgents(): void {
    const agents = [
      new PlannerAgent(this.memory, this.comm),
      new ArchitectAgent(this.memory, this.comm),
      new BackendAgent(this.memory, this.comm),
      new FrontendAgent(this.memory, this.comm),
      new QAAgent(this.memory, this.comm),
      new DebugAgent(this.memory, this.comm),
      new SecurityAgent(this.memory, this.comm),
      new DevOpsAgent(this.memory, this.comm),
      new ReporterAgent(this.memory, this.comm),
    ];

    for (const agent of agents) {
      this.workflow.registerAgent(agent);
      this.memory.setState(`agent:${agent.config.name}:registered`, true, "orchestrator");
    }

    this.log("info", `🤖 Registered ${agents.length} agents: ${agents.map((a) => a.config.emoji + " " + a.config.name).join(", ")}`);
  }

  // ── Event Logging ──

  private setupLogging(): void {
    this.workflow.on("pipeline:start", (pipeline) => {
      this.log("info", `\n${"═".repeat(60)}`);
      this.log("info", `🚀 Pipeline "${pipeline.name}" started (${pipeline.id})`);
      this.log("info", `${"═".repeat(60)}`);
    });

    this.workflow.on("step:start", (step) => {
      this.log("info", `\n  ▶ Step: ${step.agentName}`);
      this.log("info", `    Task: ${step.input.description}`);
    });

    this.workflow.on("step:complete", (step) => {
      const status = step.status === "completed" ? "✅" : "❌";
      this.log("info", `    ${status} Status: ${step.status}`);
      if (step.result?.artifacts.length) {
        this.log("info", `    📦 Artifacts: ${step.result.artifacts.length}`);
      }
      if (step.result?.tokenUsage) {
        this.log("info", `    🧠 Tokens: ${step.result.tokenUsage.total}`);
      }
    });

    this.workflow.on("step:skipped", (step) => {
      this.log("info", `  ⏭ Skipped: ${step.agentName} (disabled)`);
    });

    this.workflow.on("pipeline:complete", (pipeline) => {
      const duration = pipeline.completedAt
        ? new Date(pipeline.completedAt).getTime() - new Date(pipeline.createdAt).getTime()
        : 0;

      this.log("info", `\n${"═".repeat(60)}`);
      this.log("info", `✅ Pipeline "${pipeline.name}" completed in ${duration}ms`);
      this.log("info", `${"═".repeat(60)}`);
    });
  }

  // ── Main Execution ──

  /**
   * Execute a high-level task through the BOWO pipeline.
   */
  async execute(goal: string, options: { agents?: string[] } = {}): Promise<ExecutionResult> {
    const startTime = Date.now();

    this.log("info", `\n🤖 BOWO Orchestrator — Processing: "${goal}"`);

    // Store the task in memory
    this.memory.store(MemoryType.TASK, "orchestrator", goal, {
      tags: ["pipeline", "new"],
    });

    // Step 1: Planning (LLM-powered)
    this.log("info", "\n📋 Phase 1: Planning...");
    const planner = new PlannerAgent(this.memory, this.comm);
    const planInput: TaskInput = {
      taskId: `plan-${Date.now()}`,
      goal: goal,
      context: {},
    };

    const planResult = await planner.execute(planInput);
    const planArtifacts = planResult.artifacts ?? [];
    const planData = planArtifacts.length > 0
      ? JSON.parse(planArtifacts[0].content)
      : { subtasks: [] };
    const subtasks = planData.subtasks ?? [];

    this.log("info", `  → Plan created: ${subtasks.length} subtasks`);
    if (planResult.tokens) {
      this.log("info", `  → Planner used ${planResult.tokens} tokens`);
    }

    // Step 2: Build pipeline from plan
    const pipelineSteps = subtasks
      .filter((st: any) => !options.agents || options.agents.includes(st.agent))
      .map((st: any) => ({
        agentName: st.agent,
        input: {
          taskId: st.id ?? `task-${Date.now()}`,
          goal: st.description ?? st.goal ?? goal,
          context: { goal, plan: planData },
        },
      }));

    // Always add reporter at the end if not already included
    if (!pipelineSteps.some((s: any) => s.agentName === "reporter")) {
      pipelineSteps.push({
        agentName: "reporter",
        input: {
          taskId: `reporter-${Date.now()}`,
          goal: goal,
          context: { goal, plan: planData },
        },
      });
    }

    // Step 3: Execute pipeline
    this.log("info", "\n⚡ Phase 2: Execution...");
    const pipeline = await this.workflow.runPipeline(`BOWO: ${goal}`, pipelineSteps);

    // Step 4: Collect results
    const agentResults = pipeline.steps
      .filter((s) => s.result)
      .map((s) => ({
        agent: s.agentName,
        status: s.status,
        duration: s.result?.duration ?? 0,
        tokens: s.result?.tokenUsage?.total,
      }));

    const totalArtifacts = pipeline.steps.reduce(
      (sum, s) => sum + (s.result?.artifacts.length ?? 0),
      0
    );

    const totalTokens = pipeline.steps.reduce(
      (sum, s) => sum + (s.result?.tokenUsage?.total ?? 0),
      0
    );

    const totalDuration = Date.now() - startTime;

    // Step 5: Store final result
    this.memory.store(MemoryType.RESULT, "orchestrator", {
      goal,
      status: pipeline.status,
      totalArtifacts,
      totalDuration,
      totalTokens,
      agentResults,
    }, { tags: ["final"] });

    // Get the report if reporter ran
    const reporterStep = pipeline.steps.find((s) => s.agentName === "reporter");
    const report = reporterStep?.result?.output;

    if (totalTokens > 0) {
      this.log("info", `\n🧠 Total tokens used: ${totalTokens}`);
    }

    return {
      pipelineId: pipeline.id,
      status: pipeline.status,
      goal,
      agentResults,
      totalArtifacts,
      totalDuration,
      report,
    };
  }

  // ── Utilities ──

  /**
   * Get system status.
   */
  getStatus(): {
    agents: string[];
    memory: ReturnType<BowoMemory["getSummary"]>;
    pipelines: number;
    llm: { available: boolean; model: string };
  } {
    const llm = getLLM();
    return {
      agents: this.workflow.getAgentNames(),
      memory: this.memory.getSummary(),
      pipelines: this.workflow.getPipelines().length,
      llm: { available: llm.isAvailable(), model: llm.getConfig().model },
    };
  }

  /**
   * Get the memory instance (for external access).
   */
  getMemory(): BowoMemory {
    return this.memory;
  }

  /**
   * Get the communication bus (for external access).
   */
  getCommunication(): Communication {
    return this.comm;
  }

  private log(level: string, message: string): void {
    const levels = ["debug", "info", "warn", "error"];
    if (levels.indexOf(level) >= levels.indexOf(this.config.logLevel)) {
      console.log(message);
    }
  }
}

/**
 * 🤖 BOWO — Backend Orchestrator for Workflow Optimization
 */

import { EventEmitter } from "node:events";
import { BowoMemory, MemoryType } from "./memory.js";
import { Communication } from "./communication.js";
import { Workflow } from "./workflow.js";
import { getLLM } from "./llm.js";
import type { TaskInput } from "./agents/base.js";
import { PlannerAgent } from "./agents/planner.js";
import { ArchitectAgent } from "./agents/architect.js";
import { BackendAgent } from "./agents/backend.js";
import { FrontendAgent } from "./agents/frontend.js";
import { QAAgent } from "./agents/qa.js";
import { DebugAgent } from "./agents/debug.js";
import { SecurityAgent } from "./agents/security.js";
import { DevOpsAgent } from "./agents/devops.js";
import { ReporterAgent } from "./agents/reporter.js";

// Hermes Brain — lazy import
let HermesBrainClass: any = null;

// New modules — lazy init
let modCostTracker: any = null;
let modRecovery: any = null;
let modSessions: any = null;
let modAudit: any = null;
let modTemplates: any = null;
let modMonitor: any = null;

async function loadModules() {
  try { const m = await import("./hermes-brain.js"); HermesBrainClass = m.HermesBrain; } catch {}
  try { const m = await import("./cost-tracker.js"); modCostTracker = m.CostTracker; } catch {}
  try { const m = await import("./recovery.js"); modRecovery = m.RecoveryExecutor; } catch {}
  try { const m = await import("./sessions.js"); modSessions = m.SessionManager; } catch {}
  try { const m = await import("./audit.js"); modAudit = m.AuditLog; } catch {}
  try { const m = await import("./templates.js"); modTemplates = m.TemplateEngine; } catch {}
  try { const m = await import("./monitoring.js"); modMonitor = m.MonitoringCollector; } catch {}
}

export interface OrchestratorConfig {
  logLevel: "debug" | "info" | "warn" | "error";
  language: "en" | "id" | "zh";
}

export interface ExecutionResult {
  pipelineId: string;
  status: string;
  goal: string;
  agentResults: { agent: string; status: string; duration: number; tokens?: number }[];
  totalArtifacts: number;
  totalDuration: number;
  sessionId?: string;
}

export class Orchestrator extends EventEmitter {
  private memory: BowoMemory;
  private comm: Communication;
  private workflow: Workflow;
  private agentList: any[] = [];
  private config: OrchestratorConfig;
  private modulesLoaded = false;

  public costTracker: any = null;
  public recovery: any = null;
  public sessions: any = null;
  public audit: any = null;
  public templates: any = null;
  public monitor: any = null;
  public hermesBrain: any = null;

  constructor(config?: Partial<OrchestratorConfig>) {
    super();
    this.config = { logLevel: config?.logLevel ?? "info", language: config?.language ?? "en" };
    this.memory = new BowoMemory();
    this.comm = new Communication();
    this.workflow = new Workflow();
    this.registerAgents();
  }

  private async ensureModules() {
   if (this.modulesLoaded) return;
   await loadModules();
   if (HermesBrainClass) { try { this.hermesBrain = new HermesBrainClass(); } catch {} }
   this.costTracker = modCostTracker ? new modCostTracker() : null;
    this.recovery = modRecovery ? new modRecovery() : null;
    this.sessions = modSessions ? new modSessions() : null;
    this.audit = modAudit ? new modAudit() : null;
    this.templates = modTemplates ? new modTemplates() : null;
    this.monitor = modMonitor ? new modMonitor() : null;

    // Register agents with recovery
    if (this.recovery?.registerAgent) {
      for (const agent of this.agentList) this.recovery.registerAgent(agent);
    }

    this.modulesLoaded = true;
  }

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
      this.agentList.push(agent);
    }
    this.log("info", `🤖 Registered ${agents.length} agents`);
  }

  async execute(goal: string, options: { agents?: string[] } = {}): Promise<ExecutionResult> {
    await this.ensureModules();

    const startTime = Date.now();
    const sessionId = `session-${Date.now()}`;
    this.log("info", `\n🤖 BOWO Orchestrator — Processing: "${goal}"`);
    this.memory.store(MemoryType.TASK, "orchestrator", goal, { tags: ["pipeline", "new"] });

    // Phase 1: Planning
    this.log("info", "\n📋 Phase 1: Planning...");
    const planner = new PlannerAgent(this.memory, this.comm);
    const planInput: TaskInput = { taskId: `plan-${Date.now()}`, goal, context: {} };

    let planResult: any;
    if (this.recovery?.execute) {
      planResult = await this.recovery.execute("planner", planInput, {});
    } else {
      planResult = await planner.execute(planInput);
    }

    const actualResult = planResult?.result ?? planResult;
    const planArtifacts = actualResult?.artifacts ?? [];
    const planData = planArtifacts.length > 0 ? JSON.parse(planArtifacts[0].content) : { subtasks: [] };
    const subtasks = planData.subtasks ?? [];

    this.log("info", `  → Plan created: ${subtasks.length} subtasks`);

    // Phase 2: Build pipeline
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

    if (!pipelineSteps.some((s: any) => s.agentName === "reporter")) {
      pipelineSteps.push({
        agentName: "reporter",
        input: { taskId: `reporter-${Date.now()}`, goal, context: { goal, plan: planData } },
      });
    }

    // Phase 3: Execute
    this.log("info", "\n⚡ Phase 2: Execution...");
    const pipeline = await this.workflow.runPipeline(`BOWO: ${goal}`, pipelineSteps);

    const agentResults = pipeline.steps
      .filter((s) => s.result)
      .map((s) => ({
        agent: s.agentName,
        status: s.status,
        duration: s.result?.duration ?? 0,
        tokens: s.result?.tokens,
      }));

    const totalArtifacts = pipeline.steps.reduce((sum, s) => sum + (s.result?.artifacts.length ?? 0), 0);
    const totalTokens = pipeline.steps.reduce((sum, s) => sum + (s.result?.tokens ?? 0), 0);
    const totalDuration = Date.now() - startTime;

    if (this.sessions?.saveSession) {
      try { this.sessions.saveSession(sessionId, { goal, pipelineId: pipeline.id, status: pipeline.status, totalArtifacts, totalDuration }); } catch {}
    }
    if (this.monitor?.exportToJson) { try { this.monitor.exportToJson(); } catch {} }
    if (this.audit?.log) {
      try { this.audit.log({ action: "pipeline_complete", agent: "orchestrator", detail: { goal, status: pipeline.status, duration: totalDuration } }); } catch {}
    }

    this.memory.store(MemoryType.RESULT, "orchestrator", {
      goal, status: pipeline.status, totalArtifacts, totalDuration, totalTokens, agentResults,
    }, { tags: ["final"] });

    if (totalTokens > 0) this.log("info", `\n🧠 Total tokens: ${totalTokens}`);

    return { pipelineId: pipeline.id, status: pipeline.status, goal, agentResults, totalArtifacts, totalDuration, sessionId };
  }

  getStatus() {
    const llm = getLLM();
    return {
      agents: this.workflow.getAgentNames(),
      memory: this.memory.getSummary(),
      pipelines: this.workflow.getPipelines().length,
      llm: { available: llm.isAvailable(), model: llm.getConfig().model },
      modules: {
        costTracker: !!this.costTracker, recovery: !!this.recovery,
        sessions: !!this.sessions, audit: !!this.audit,
        templates: !!this.templates, monitoring: !!this.monitor,
      },
    };
  }

  getMemory(): BowoMemory { return this.memory; }
  getCommunication(): Communication { return this.comm; }

  private log(level: string, message: string): void {
    const levels = ["debug", "info", "warn", "error"];
    if (levels.indexOf(level) >= levels.indexOf(this.config.logLevel)) console.log(message);
  }
}

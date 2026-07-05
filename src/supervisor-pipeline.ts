/**
 * 🤖 BOWO — Supervisor Pipeline
 *
 * High-level orchestrator combining Supervisor, DAG, Checkpointing, and Context.
 * Inspired by LangGraph + AutoGen + CrewAI patterns.
 */

import { EventEmitter } from "node:events";
import { BowoMemory, MemoryType } from "./memory.js";
import { Communication } from "./communication.js";
import { Workflow } from "./workflow.js";

// Lazy imports
let DAGExecutor: any, buildSequentialGraph: any;
let CheckpointManager: any;
let SupervisorAgent: any;
let ContextManager: any;

async function loadDeps() {
  if (!DAGExecutor) {
    try { const m = await import("./dag.js"); DAGExecutor = m.DAGExecutor; buildSequentialGraph = m.buildSequentialGraph; } catch {}
  }
  if (!CheckpointManager) {
    try { const m = await import("./checkpoint.js"); CheckpointManager = m.CheckpointManager; } catch {}
  }
  if (!SupervisorAgent) {
    try { const m = await import("./supervisor.js"); SupervisorAgent = m.SupervisorAgent; } catch {}
  }
  if (!ContextManager) {
    try { const m = await import("./context.js"); ContextManager = m.ContextManager; } catch {}
  }
}

// ─── Types ───

export interface PipelineOptions {
  maxRounds?: number;
  resumeFrom?: string;
  agents?: string[];
}

export interface PipelineResult {
  goal: string;
  status: "completed" | "failed" | "partial";
  rounds: number;
  artifacts: any[];
  duration: number;
  context: any;
  checkpointId?: string;
}

// ─── Supervisor Pipeline ───

export class SupervisorPipeline extends EventEmitter {
  private workflow: Workflow;
  private memory: BowoMemory;
  private comm: Communication;

  constructor(workflow: Workflow, memory: BowoMemory, comm: Communication) {
    super();
    this.workflow = workflow;
    this.memory = memory;
    this.comm = comm;
  }

  async run(goal: string, options: PipelineOptions = {}): Promise<PipelineResult> {
    await loadDeps();

    const startTime = Date.now();
    const maxRounds = options.maxRounds || 10;
    const history: { agent: string; result: any }[] = [];

    console.log(`\n🧠 Supervisor Pipeline — Goal: "${goal}"`);
    console.log(`  Max rounds: ${maxRounds}`);

    // 1. Create shared context
    let ctx: any;
    if (ContextManager) {
      ctx = new ContextManager(goal);
    } else {
      ctx = { goal, artifacts: [], metadata: {}, agentOutputs: new Map(), sharedState: {} };
    }

    // 2. Create supervisor
    let supervisor: any;
    if (SupervisorAgent) {
      supervisor = new SupervisorAgent({ maxRounds, allowedAgents: options.agents });
    }

    // 3. Checkpoint manager
    let checkpointMgr: any;
    if (CheckpointManager) {
      checkpointMgr = new CheckpointManager();
    }

    let contextObj = typeof ctx.get === "function" ? ctx.get() : ctx;
    let checkpointId = options.resumeFrom;
    let rounds = 0;

    // 4. Resume from checkpoint if specified
    if (checkpointMgr && checkpointId) {
      const checkpoint = checkpointMgr.load(checkpointId);
      if (checkpoint) {
        console.log(`  📂 Resuming from checkpoint: ${checkpointId}`);
        rounds = checkpoint.stepIndex;
        if (checkpoint.context) {
          contextObj = { ...contextObj, ...checkpoint.context };
        }
      }
    }

    // 5. Supervisor loop
    while (rounds < maxRounds) {
      rounds++;

      // Get supervisor decision
      let decision: any;
      if (supervisor) {
        decision = await supervisor.decide(contextObj, history);
      } else {
        // Fallback: simple round-robin
        decision = this.simpleDecision(contextObj, history);
      }

      if (decision.done || !decision.nextAgent) {
        console.log(`\n✅ Supervisor: Pipeline complete (round ${rounds})`);
        break;
      }

      console.log(`\n  🧠 Round ${rounds}: Next → ${decision.nextAgent}`);
      console.log(`     Reason: ${decision.reason}`);

      // Run agent
      const agentResult = await this.runAgent(decision.nextAgent, contextObj);

      // Store result
      history.push({ agent: decision.nextAgent, result: agentResult });

      // Update context
      if (typeof ctx.setAgentOutput === "function") {
        ctx.setAgentOutput(decision.nextAgent, agentResult);
      } else {
        contextObj.agentOutputs[decision.nextAgent] = agentResult;
      }

      // Collect artifacts
      if (agentResult.artifacts) {
        for (const art of agentResult.artifacts) {
          if (typeof ctx.addArtifact === "function") {
            ctx.addArtifact(art);
          } else {
            contextObj.artifacts.push(art);
          }
        }
      }

      // Save checkpoint
      if (checkpointMgr) {
        const cp = checkpointMgr.autoSave(
          `pipeline-${Date.now()}`,
          rounds,
          typeof ctx.get === "function" ? ctx.get() : contextObj,
          history
        );
        checkpointId = cp.id;
      }

      // Update context object for next round
      contextObj = typeof ctx.get === "function" ? ctx.get() : contextObj;

      this.emit("round:complete", { round: rounds, agent: decision.nextAgent, result: agentResult });
    }

    const totalDuration = Date.now() - startTime;
    const artifacts = typeof ctx.getArtifacts === "function"
      ? ctx.getArtifacts()
      : contextObj.artifacts || [];

    const status = rounds >= maxRounds ? "partial" : "completed";

    console.log(`\n══════════════════════════════════════════════`);
    console.log(`📊 Supervisor Pipeline Result`);
    console.log(`  Goal: ${goal}`);
    console.log(`  Status: ${status}`);
    console.log(`  Rounds: ${rounds}`);
    console.log(`  Artifacts: ${artifacts.length}`);
    console.log(`  Duration: ${totalDuration}ms`);
    if (checkpointId) console.log(`  Checkpoint: ${checkpointId}`);
    console.log(`══════════════════════════════════════════════\n`);

    // Store in memory
    this.memory.store(
      "decision" as MemoryType,
      "supervisor-pipeline",
      `Pipeline completed: ${goal}`,
      { metadata: { status, rounds, artifacts: artifacts.length, duration: totalDuration } }
    );

    return {
      goal,
      status,
      rounds,
      artifacts,
      duration: totalDuration,
      context: typeof ctx.get === "function" ? ctx.get() : contextObj,
      checkpointId,
    };
  }

  private async runAgent(agentName: string, context: any): Promise<any> {
    const agent = (this.workflow as any).agents?.get?.(agentName);
    if (!agent) {
      return {
        status: "error",
        error: `Agent '${agentName}' not found`,
        artifacts: [],
        duration: 0,
      };
    }

    const start = Date.now();
    try {
      const input = {
        taskId: `supervisor-${Date.now()}`,
        goal: context.goal,
        context: {
          plan: context.plan,
          architecture: context.architecture,
          code: context.code,
          tests: context.tests,
          allOutputs: context.agentOutputs || {},
        },
      };
      const result = await agent.execute(input);
      return {
        ...result,
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        status: "error",
        error: err.message,
        artifacts: [],
        duration: Date.now() - start,
      };
    }
  }

  private simpleDecision(context: any, history: { agent: string; result: any }[]): any {
    const doneAgents = new Set(history.map((h) => h.agent));
    const sequence = ["planner", "architect", "backend", "frontend", "qa", "security", "reporter"];

    for (const name of sequence) {
      if (!doneAgents.has(name)) {
        return { nextAgent: name, reason: `Sequential step: ${name}`, done: false };
      }
    }

    return { nextAgent: "", reason: "All agents completed", done: true };
  }
}

export default SupervisorPipeline;

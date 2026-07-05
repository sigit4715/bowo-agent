/**
 * BOWO Workflow — Pipeline Execution Engine
 *
 * Defines and executes agent pipelines.
 * Supports sequential, parallel, and conditional execution.
 */

import { EventEmitter } from "node:events";
import type { BaseAgent, TaskInput, TaskResult } from "./agents/base.js";

// ─── Types ──────────────────────────────────────────────

export enum PipelineStatus {
  IDLE = "idle",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  PAUSED = "paused",
}

export interface PipelineStep {
  agentName: string;
  input: TaskInput;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  result?: TaskResult;
  startedAt?: string;
  completedAt?: string;
}

export interface Pipeline {
  id: string;
  name: string;
  steps: PipelineStep[];
  status: PipelineStatus;
  createdAt: string;
  completedAt?: string;
}

// ─── Workflow Engine ────────────────────────────────────

export class Workflow extends EventEmitter {
  private agents: Map<string, BaseAgent> = new Map();
  private pipelines: Pipeline[] = [];
  private counter = 0;

  /**
   * Register an agent with the workflow engine.
   */
  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.config.name, agent);
  }

  /**
   * Create and run a pipeline.
   */
  async runPipeline(
    name: string,
    steps: { agentName: string; input: TaskInput }[]
  ): Promise<Pipeline> {
    this.counter++;
    const pipeline: Pipeline = {
      id: `pipe-${String(this.counter).padStart(3, "0")}`,
      name,
      steps: steps.map((s) => ({
        agentName: s.agentName,
        input: s.input,
        status: "pending",
      })),
      status: PipelineStatus.RUNNING,
      createdAt: new Date().toISOString(),
    };

    this.pipelines.push(pipeline);
    this.emit("pipeline:start", pipeline);

    for (const step of pipeline.steps) {
      const agent = this.agents.get(step.agentName);
      if (!agent) {
        step.status = "skipped";
        this.emit("step:skipped", step);
        continue;
      }

      if ((agent.config as any).enabled === false) {
        step.status = "skipped";
        this.emit("step:skipped", step);
        continue;
      }

      step.status = "running";
      step.startedAt = new Date().toISOString();
      this.emit("step:start", step);

      try {
        // Merge previous results into context
        const prevResults = pipeline.steps
          .filter((s) => s.result)
          .map((s) => ({
            agent: s.agentName,
            output: s.result?.output,
          }));

        const enrichedInput: TaskInput = {
          ...step.input,
          context: {
            ...(step.input.context as object),
            previousResults: prevResults,
          },
        };

        step.result = await agent.execute(enrichedInput);
        step.status = step.result.status === "completed" ? "completed" : "failed";
        step.completedAt = new Date().toISOString();

        this.emit("step:complete", step);

        // If step failed and it's critical, stop pipeline
        if (step.status === "failed") {
          pipeline.status = PipelineStatus.FAILED;
          this.emit("pipeline:failed", pipeline);
          break;
        }
      } catch (err) {
        step.status = "failed";
        step.completedAt = new Date().toISOString();
        step.result = {
          agent: step.agentName,
          status: "error",
          output: null,
          artifacts: [],
          suggestions: [],
          duration: 0,
          error: String(err),
        };

        this.emit("step:error", { step, error: err });
        pipeline.status = PipelineStatus.FAILED;
        this.emit("pipeline:failed", pipeline);
        break;
      }
    }

    if (pipeline.status === PipelineStatus.RUNNING) {
      pipeline.status = PipelineStatus.COMPLETED;
    }
    pipeline.completedAt = new Date().toISOString();
    this.emit("pipeline:complete", pipeline);

    return pipeline;
  }

  /**
   * Get all pipelines.
   */
  getPipelines(): Pipeline[] {
    return [...this.pipelines];
  }

  /**
   * Get a specific pipeline by ID.
   */
  getPipeline(id: string): Pipeline | undefined {
    return this.pipelines.find((p) => p.id === id);
  }

  /**
   * Get registered agent names.
   */
  getAgentNames(): string[] {
    return [...this.agents.keys()];
  }
}

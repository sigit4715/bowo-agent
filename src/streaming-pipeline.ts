/**
 * 🤖 BOWO — Streaming Pipeline
 *
 * Real-time pipeline execution with streaming output.
 * Inspired by Vercel AI SDK streaming + LangGraph progress.
 */

import { EventEmitter } from "node:events";

// ─── Types ───

export interface StreamEvent {
  type: string;
  timestamp: string;
  data: any;
}

export interface PipelineStep {
  agentName: string;
  label: string;
  input: any;
}

export interface StepResult {
  agentName: string;
  status: "completed" | "error" | "skipped";
  output?: any;
  error?: string;
  duration: number;
  tokenCount?: number;
}

export interface PipelineStreamResult {
  goal: string;
  status: "completed" | "failed" | "partial";
  steps: StepResult[];
  artifacts: any[];
  totalDuration: number;
  totalTokens: number;
}

// ─── Streaming Pipeline ───

export class StreamingPipeline extends EventEmitter {
  private events: StreamEvent[] = [];
  private workflow: any;
  private memory: any;

  constructor(workflow: any, memory: any) {
    super();
    this.workflow = workflow;
    this.memory = memory;
  }

  /**
   * Run pipeline with real-time streaming output
   */
  async run(goal: string, steps: PipelineStep[]): Promise<PipelineStreamResult> {
    const startTime = Date.now();
    const results: StepResult[] = [];
    const artifacts: any[] = [];
    let totalTokens = 0;

    this.emitEvent("pipeline:start", { goal, stepCount: steps.length });
    console.log(`\n🚀 Streaming Pipeline — "${goal}"`);
    console.log(`  Steps: ${steps.length}\n`);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepStart = Date.now();

      this.emitEvent("step:start", {
        index: i,
        agentName: step.agentName,
        label: step.label,
        progress: `${i + 1}/${steps.length}`,
      });

      console.log(`  ⏳ [${i + 1}/${steps.length}] ${step.label} (${step.agentName})...`);

      try {
        // Get agent from workflow
        const agent = this.workflow.agents?.get?.(step.agentName);
        if (!agent) {
          throw new Error(`Agent '${step.agentName}' not found`);
        }

        // Stream progress events
        this.emitEvent("step:progress", { index: i, agentName: step.agentName, percent: 25 });

        // Execute agent
        const result = await agent.execute({
          taskId: `stream-${Date.now()}-${i}`,
          goal,
          context: step.input,
        });

        this.emitEvent("step:progress", { index: i, agentName: step.agentName, percent: 75 });

        const duration = Date.now() - stepStart;
        const tokens = result.tokens || 0;
        totalTokens += tokens;

        const stepResult: StepResult = {
          agentName: step.agentName,
          status: "completed",
          output: result,
          duration,
          tokenCount: tokens,
        };

        results.push(stepResult);

        // Collect artifacts
        if (result.artifacts) {
          for (const art of result.artifacts) {
            artifacts.push(art);
            this.emitEvent("artifact:generated", { agentName: step.agentName, artifact: art });
          }
        }

        this.emitEvent("step:complete", {
          index: i,
          agentName: step.agentName,
          duration,
          tokens,
          artifactCount: result.artifacts?.length || 0,
        });

        console.log(`  ✅ [${i + 1}/${steps.length}] ${step.label} — ${duration}ms, ${tokens} tokens`);

      } catch (err: any) {
        const duration = Date.now() - stepStart;
        const stepResult: StepResult = {
          agentName: step.agentName,
          status: "error",
          error: err.message,
          duration,
        };
        results.push(stepResult);

        this.emitEvent("step:error", { index: i, agentName: step.agentName, error: err.message });
        console.log(`  ❌ [${i + 1}/${steps.length}] ${step.label} — ERROR: ${err.message}`);
      }
    }

    const totalDuration = Date.now() - startTime;
    const failedSteps = results.filter((r) => r.status === "error").length;
    const status = failedSteps === 0 ? "completed" : failedSteps < results.length ? "partial" : "failed";

    this.emitEvent("pipeline:complete", {
      goal,
      status,
      stepCount: results.length,
      failedSteps,
      artifacts: artifacts.length,
      totalDuration,
      totalTokens,
    });

    console.log(`\n══════════════════════════════════════════════`);
    console.log(`📊 Pipeline Complete`);
    console.log(`  Status: ${status}`);
    console.log(`  Steps: ${results.length} (${failedSteps} failed)`);
    console.log(`  Artifacts: ${artifacts.length}`);
    console.log(`  Duration: ${totalDuration}ms`);
    console.log(`  Tokens: ${totalTokens}`);
    console.log(`══════════════════════════════════════════════\n`);

    return {
      goal,
      status,
      steps: results,
      artifacts,
      totalDuration,
      totalTokens,
    };
  }

  /**
   * Attach console logger for real-time output
   */
  attachConsoleLogger(): () => void {
    const handler = (event: StreamEvent) => {
      switch (event.type) {
        case "pipeline:start":
          console.log(`\n🚀 Pipeline: ${event.data.goal}`);
          break;
        case "step:start":
          console.log(`  ⏳ Step ${event.data.index + 1}: ${event.data.label}`);
          break;
        case "step:complete":
          console.log(`  ✅ Step ${event.data.index + 1}: ${event.data.agentName} (${event.data.duration}ms)`);
          break;
        case "step:error":
          console.log(`  ❌ Step ${event.data.index + 1}: ${event.data.error}`);
          break;
        case "artifact:generated":
          console.log(`  📄 Artifact: ${event.data.artifact.name || "unnamed"}`);
          break;
        case "pipeline:complete":
          console.log(`\n✅ Pipeline ${event.data.status} in ${event.data.totalDuration}ms`);
          break;
      }
    };

    this.on("event", handler);
    return () => this.off("event", handler);
  }

  /**
   * Get all events
   */
  getEvents(): StreamEvent[] {
    return [...this.events];
  }

  /**
   * Get events by type
   */
  getEventsByType(type: string): StreamEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  /**
   * Get summary
   */
  getSummary(): { totalEvents: number; eventTypes: Record<string, number> } {
    const eventTypes: Record<string, number> = {};
    for (const event of this.events) {
      eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;
    }
    return { totalEvents: this.events.length, eventTypes };
  }

  private emitEvent(type: string, data: any): void {
    const event: StreamEvent = { type, timestamp: new Date().toISOString(), data };
    this.events.push(event);
    this.emit("event", event);
  }
}

/**
 * Helper: Create streaming steps from goal
 */
export function createStepsFromGoal(goal: string): PipelineStep[] {
  return [
    { agentName: "planner", label: "Planning", input: { goal } },
    { agentName: "architect", label: "Architecture Design", input: { goal } },
    { agentName: "backend", label: "Backend Implementation", input: { goal } },
    { agentName: "frontend", label: "Frontend Implementation", input: { goal } },
    { agentName: "qa", label: "Quality Assurance", input: { goal } },
    { agentName: "security", label: "Security Review", input: { goal } },
    { agentName: "reporter", label: "Report Generation", input: { goal } },
  ];
}

export default StreamingPipeline;

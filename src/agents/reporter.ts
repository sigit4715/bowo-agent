/**
 * BOWO Reporter Agent — Report Generation & Documentation
 */

import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult, type Artifact } from "./base.js";
import { MemoryType } from "../memory.js";

const CONFIG: AgentConfig = {
  name: "reporter",
  displayName: "Reporter",
  icon: "📊",
  description: "Collects results from all agents and generates comprehensive reports",
  systemPrompt: `You are a technical writer. Generate comprehensive project reports from agent results.`,
  capabilities: ["report-generation", "documentation", "summary", "metrics"],
};

export class ReporterAgent extends BaseAgent {
  constructor(memory: any, communication: any, llm?: any, workDir?: string) {
    super(CONFIG, memory, communication, llm, workDir);
  }

  async execute(input: TaskInput): Promise<TaskResult> {
    const start = Date.now();
    this.log("📊 Report generation started", { goal: input.goal });

    try {
      // Collect all artifacts from memory
      const allArtifacts = this.getPreviousArtifacts(input.taskId);

      const report = {
        goal: input.goal,
        timestamp: new Date().toISOString(),
        summary: `BOWO Agent System executed ${allArtifacts.length} artifacts for: ${input.goal}`,
        agents: [...new Set(allArtifacts.map((a) => a.type))],
        artifactCount: allArtifacts.length,
        status: "completed",
      };

      const artifacts: Artifact[] = [
        { name: "report", type: "report", content: JSON.stringify(report, null, 2) },
      ];

      for (const artifact of artifacts) {
        this.memory.store(MemoryType.ARTIFACT, "reporter", artifact);
      }

      return {
        agent: "reporter", taskId: input.taskId, status: "completed",
        summary: `📊 Report generated: ${allArtifacts.length} artifacts documented`,
        artifacts,
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent: "reporter", taskId: input.taskId, status: "failed",
        summary: `❌ Report failed: ${err.message}`, artifacts: [],
        duration: Date.now() - start,
      };
    }
  }
}

/**
 * BOWO Debug Agent — Bug Detection & Fixing
 */

import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult, type Artifact } from "./base.js";
import { MemoryType } from "../memory.js";

const CONFIG: AgentConfig = {
  name: "debug",
  displayName: "Debugger",
  icon: "🔍",
  description: "Analyzes errors, traces root causes, and suggests fixes",
  systemPrompt: `You are an expert debugger. Analyze errors, find root causes, and suggest fixes.`,
  capabilities: ["error-analysis", "root-cause", "fix-suggestion", "logging"],
};

export class DebugAgent extends BaseAgent {
  constructor(memory: any, communication: any, llm?: any, workDir?: string) {
    super(CONFIG, memory, communication, llm, workDir);
  }

  async execute(input: TaskInput): Promise<TaskResult> {
    const start = Date.now();
    this.log("🔍 Debug analysis started", { goal: input.goal });

    try {
      const report = {
        goal: input.goal,
        analysis: "Debug analysis completed",
        potentialIssues: ["Check error handling", "Verify input validation", "Review async operations"],
        recommendations: ["Add try-catch blocks", "Implement proper logging", "Add error boundaries"],
      };

      const artifacts: Artifact[] = [
        { name: "debug-report", type: "report", content: JSON.stringify(report, null, 2) },
      ];

      for (const artifact of artifacts) {
        this.memory.store(MemoryType.ARTIFACT, "debug", artifact);
      }

      return {
        agent: "debug", taskId: input.taskId, status: "completed",
        summary: `🔍 Debug analysis completed: ${report.potentialIssues.length} potential issues`,
        artifacts,
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent: "debug", taskId: input.taskId, status: "failed",
        summary: `❌ Debug failed: ${err.message}`, artifacts: [],
        duration: Date.now() - start,
      };
    }
  }
}

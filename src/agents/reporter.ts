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

    // Try LLM-enhanced reporting first, fall back to template-based rules
    if (this.llm?.isAvailable()) {
      try {
        return await this.reportWithLLM(input, start);
      } catch (err: any) {
        this.log("⚠️ LLM report generation failed, falling back to rules", { error: err.message });
      }
    }

    return await this.reportWithRules(input, start);
  }

  /**
   * LLM-enhanced report generation — asks the model to produce an executive
   * summary, metrics analysis, and actionable recommendations from all
   * previously collected artifacts.
   */
  private async reportWithLLM(input: TaskInput, start: number): Promise<TaskResult> {
    const allArtifacts = this.getPreviousArtifacts(input.taskId);

    // Build a context summary of all artifacts for the LLM
    const artifactSummaries = allArtifacts.map((a, i) =>
      `Artifact ${i + 1} [${a.name} / ${a.type}]:\n${a.content.slice(0, 1000)}`
    ).join("\n\n---\n\n");

    const prompt = `Generate a comprehensive project report for the following goal:
"${input.goal}"

The system has collected ${allArtifacts.length} artifact(s) from various agents.
Here is a summary of the collected artifacts:

${artifactSummaries || "(no artifacts collected yet)"}

Produce a report with:
1. Executive Summary — high-level overview of what was accomplished
2. Key Findings — the most important discoveries or outputs
3. Metrics — quantify results where possible (findings count, risk levels, file counts, etc.)
4. Recommendations — prioritized next steps
5. Risk Assessment — any concerns or issues that need attention

Respond with JSON in this exact structure:
{
  "executiveSummary": "...",
  "keyFindings": ["...", "..."],
  "metrics": { "artifactsCollected": 0, "agentsParticipated": 0, ... },
  "recommendations": [
    { "priority": "high|medium|low", "action": "...", "rationale": "..." }
  ],
  "riskAssessment": "...",
  "fullReport": "Complete markdown report text"
}`;

    const response = await this.askLLM(prompt, artifactSummaries || undefined);
    if (!response) {
      throw new Error("askLLM returned null");
    }

    let parsed: any;
    try {
      const cleaned = response.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {
        executiveSummary: response.slice(0, 500),
        keyFindings: ["LLM analysis completed"],
        metrics: { artifactsCollected: allArtifacts.length },
        recommendations: [],
        riskAssessment: "See full report",
        fullReport: response,
      };
    }

    const report = {
      goal: input.goal,
      timestamp: new Date().toISOString(),
      executiveSummary: parsed.executiveSummary ?? "",
      keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
      metrics: parsed.metrics ?? { artifactsCollected: allArtifacts.length },
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      riskAssessment: parsed.riskAssessment ?? "",
      fullReport: parsed.fullReport ?? "",
      agents: [...new Set(allArtifacts.map((a) => a.type))],
      artifactCount: allArtifacts.length,
      status: "completed",
      source: "llm",
    };

    const reportContent = report.fullReport || JSON.stringify(report, null, 2);
    const artifacts: Artifact[] = [
      { name: "report", type: "report", content: reportContent },
    ];

    for (const artifact of artifacts) {
      this.memory.store(MemoryType.ARTIFACT, "reporter", artifact);
    }

    return {
      agent: "reporter", taskId: input.taskId, status: "completed",
      summary: `📊 Report generated (LLM): ${allArtifacts.length} artifacts, ${report.keyFindings.length} key findings`,
      artifacts,
      duration: Date.now() - start,
    };
  }

  /**
   * Template-based report generation — the original fallback logic.
   */
  private async reportWithRules(input: TaskInput, start: number): Promise<TaskResult> {
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
        source: "rules",
      };

      const artifacts: Artifact[] = [
        { name: "report", type: "report", content: JSON.stringify(report, null, 2) },
      ];

      for (const artifact of artifacts) {
        this.memory.store(MemoryType.ARTIFACT, "reporter", artifact);
      }

      return {
        agent: "reporter", taskId: input.taskId, status: "completed",
        summary: `📊 Report generated (rules): ${allArtifacts.length} artifacts documented`,
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

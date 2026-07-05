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

    // Try LLM-enhanced diagnosis first, fall back to rules
    if (this.llm?.isAvailable()) {
      try {
        return await this.diagnoseWithLLM(input, start);
      } catch (err: any) {
        this.log("⚠️ LLM debug analysis failed, falling back to rules", { error: err.message });
      }
    }

    return await this.diagnoseWithRules(input, start);
  }

  /**
   * LLM-enhanced bug diagnosis — asks the model to analyze errors,
   * identify root causes, and provide fix recommendations.
   */
  private async diagnoseWithLLM(input: TaskInput, start: number): Promise<TaskResult> {
    const contextParts: string[] = [];

    if (typeof input.context?.error === "string") {
      contextParts.push(`Error message:\n${input.context.error}`);
    }
    if (typeof input.context?.stack === "string") {
      contextParts.push(`Stack trace:\n${input.context.stack}`);
    }
    if (typeof input.context?.code === "string") {
      contextParts.push(`Relevant code:\n\`\`\`\n${input.context.code}\n\`\`\``);
    }
    if (typeof input.context?.log === "string") {
      contextParts.push(`Logs:\n${input.context.log}`);
    }
    if (contextParts.length === 0) {
      contextParts.push(`Project context: ${JSON.stringify(input.context ?? {})}`);
    }

    const prompt = `Debug and diagnose the following issue:
"${input.goal}"

Analyze:
1. What went wrong (symptom analysis)
2. Root cause — trace through the code flow to find the origin
3. Contributing factors (race conditions, edge cases, null references, etc.)
4. Fix recommendations with code examples
5. Prevention strategies to avoid this class of bug in the future

Respond with JSON in this exact structure:
{
  "rootCause": "...",
  "symptoms": ["...", "..."],
  "possibleCauses": [
    { "cause": "...", "confidence": "high|medium|low", "explanation": "..." }
  ],
  "fixes": [
    { "description": "...", "code": "optional code snippet", "priority": "high|medium|low" }
  ],
  "prevention": ["...", "..."],
  "summary": "One-paragraph executive summary"
}`;

    const response = await this.askLLM(prompt, contextParts.join("\n\n"));
    if (!response) {
      throw new Error("askLLM returned null");
    }

    // Try to parse structured JSON from the response
    let parsed: any;
    try {
      const cleaned = response.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {
        rootCause: "See analysis below",
        symptoms: [],
        possibleCauses: [{ cause: "LLM analysis provided", confidence: "medium", explanation: response.slice(0, 500) }],
        fixes: [{ description: "Refer to LLM analysis", priority: "medium" }],
        prevention: [],
        summary: response.slice(0, 500),
      };
    }

    const report = {
      goal: input.goal,
      rootCause: parsed.rootCause ?? "Unknown",
      symptoms: Array.isArray(parsed.symptoms) ? parsed.symptoms : [],
      possibleCauses: Array.isArray(parsed.possibleCauses) ? parsed.possibleCauses : [],
      fixes: Array.isArray(parsed.fixes) ? parsed.fixes : [],
      prevention: Array.isArray(parsed.prevention) ? parsed.prevention : [],
      summary: parsed.summary ?? "",
      source: "llm",
    };

    const artifacts: Artifact[] = [
      { name: "debug-report", type: "report", content: JSON.stringify(report, null, 2) },
    ];

    for (const artifact of artifacts) {
      this.memory.store(MemoryType.ARTIFACT, "debug", artifact);
    }

    return {
      agent: "debug", taskId: input.taskId, status: "completed",
      summary: `🔍 Debug analysis (LLM): root cause identified — ${report.rootCause}`,
      artifacts,
      duration: Date.now() - start,
    };
  }

  /**
   * Rule-based bug diagnosis — pattern matching on error messages and stack traces.
   * This is the original fallback logic.
   */
  private async diagnoseWithRules(input: TaskInput, start: number): Promise<TaskResult> {
    try {
      const errorText = String(input.context?.error ?? input.goal);
      const stack = String(input.context?.stack ?? "");

      // Rule-based error pattern matching
      const errorPatterns: { pattern: RegExp; issue: string; fix: string }[] = [
        { pattern: /TypeError:\s*(.+is not a function|Cannot read propert)/i, issue: "Null/undefined reference", fix: "Add null checks and optional chaining (?.)" },
        { pattern: /ReferenceError:\s*(.+is not defined)/i, issue: "Undefined variable", fix: "Check variable scope and imports" },
        { pattern: /SyntaxError:\s*(.+)/i, issue: "Syntax error", fix: "Fix the malformed code syntax" },
        { pattern: /ECONNREFUSED/i, issue: "Connection refused", fix: "Verify the target service is running and the port is correct" },
        { pattern: /ETIMEOUT|ETIMEDOUT/i, issue: "Connection timeout", fix: "Check network connectivity and increase timeout if needed" },
        { pattern: /ENOMEM|heap/i, issue: "Out of memory", fix: "Increase Node.js heap size (--max-old-space-size) or optimize memory usage" },
        { pattern: /ENOSPC/i, issue: "Disk full", fix: "Free disk space or expand storage" },
        { pattern: /ENOENT.*(?:no such file|not found)/i, issue: "File not found", fix: "Verify the file path exists and is accessible" },
        { pattern: /permission denied|EACCES/i, issue: "Permission denied", fix: "Check file/directory permissions" },
        { pattern: /Cannot find module/i, issue: "Missing module", fix: "Run npm install to install dependencies" },
        { pattern: /UnhandledPromiseRejection|unhandledRejection/i, issue: "Unhandled promise rejection", fix: "Add .catch() handlers or try-catch around async code" },
        { pattern: /CORS|cross-origin/i, issue: "CORS error", fix: "Configure CORS headers on the server" },
      ];

      const potentialIssues: string[] = [];
      const recommendations: string[] = [];

      for (const ep of errorPatterns) {
        if (ep.pattern.test(errorText) || ep.pattern.test(stack)) {
          potentialIssues.push(ep.issue);
          recommendations.push(ep.fix);
        }
      }

      if (potentialIssues.length === 0) {
        potentialIssues.push("Check error handling", "Verify input validation", "Review async operations");
        recommendations.push("Add try-catch blocks", "Implement proper logging", "Add error boundaries");
      }

      const report = {
        goal: input.goal,
        analysis: "Debug analysis completed via rule-based matching",
        potentialIssues,
        recommendations,
        source: "rules",
      };

      const artifacts: Artifact[] = [
        { name: "debug-report", type: "report", content: JSON.stringify(report, null, 2) },
      ];

      for (const artifact of artifacts) {
        this.memory.store(MemoryType.ARTIFACT, "debug", artifact);
      }

      return {
        agent: "debug", taskId: input.taskId, status: "completed",
        summary: `🔍 Debug analysis (rules): ${report.potentialIssues.length} potential issues`,
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

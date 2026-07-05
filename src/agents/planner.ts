/**
 * BOWO Planner Agent — LLM-Powered Task Decomposition
 *
 * Uses LLM for intelligent task breakdown.
 * Falls back to rule-based planning when LLM is offline.
 */

import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult, type Artifact } from "./base.js";

export class PlannerAgent extends BaseAgent {
  constructor(memory: any, communication: any, llm?: any, workDir?: string) {
    const config: AgentConfig = {
      name: "planner",
      displayName: "Planner",
      icon: "📋",
      description: "Breaks down complex tasks into actionable subtasks with dependencies",
      systemPrompt: `You are a senior project planner. Your job is to:
1. Analyze the user's goal
2. Break it into clear, actionable subtasks
3. Identify dependencies between tasks
4. Assign the right specialist agent to each task
5. Estimate complexity (low/medium/high)

Available agents: planner, architect, backend, frontend, qa, debug, security, devops, reporter

Always respond with a structured plan.`,
      capabilities: ["task-decomposition", "dependency-analysis", "agent-assignment"],
    };

    super(config, memory, communication, llm, workDir);
  }

  async execute(input: TaskInput): Promise<TaskResult> {
    const start = Date.now();
    this.log("📋 Planning started", { goal: input.goal });

    try {
      // Try LLM-powered planning
      if (this.llm?.isAvailable()) {
        return await this.planWithLLM(input, start);
      }

      // Fallback: rule-based planning
      return this.planWithRules(input, start);
    } catch (err: any) {
      this.log("📋 Planning failed, falling back to rules");
      return this.planWithRules(input, start);
    }
  }

  private async planWithLLM(input: TaskInput, start: number): Promise<TaskResult> {
    const systemPrompt = `${this.config.systemPrompt}

Respond with JSON:
{
  "analysis": "Brief analysis of the goal",
  "subtasks": [
    {
      "id": "task-1",
      "description": "What to do",
      "agent": "agent-name",
      "dependsOn": [],
      "complexity": "low|medium|high"
    }
  ],
  "estimatedDuration": "X minutes",
  "risks": ["potential risks"]
}`;

    const context = JSON.stringify(input.context, null, 2);
    const response = await this.llm!.prompt(systemPrompt, `Goal: ${input.goal}\n\nContext: ${context}`);

    let plan: any;
    try {
      let content = response.content.trim();
      if (content.startsWith("```")) {
        content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      }
      plan = JSON.parse(content);
    } catch {
      // LLM didn't return valid JSON, parse from text
      plan = this.parsePlanFromText(response.content);
    }

    // Store plan in memory
    this.memory.store("decision", "planner", {
      taskId: input.taskId,
      goal: input.goal,
      plan: plan,
      timestamp: new Date().toISOString(),
    });

    // Create artifacts
    const artifacts: Artifact[] = [
      {
        name: "plan",
        type: "json",
        content: JSON.stringify(plan, null, 2),
      },
    ];

    // Store artifacts
    for (const artifact of artifacts) {
      this.memory.store("artifact", "planner", artifact);
    }

    this.emit("planner:complete", { taskId: input.taskId, plan });

    return {
      agent: "planner",
      taskId: input.taskId,
      status: "completed",
      summary: `📋 Plan created: ${plan.subtasks?.length ?? 0} subtasks identified`,
      artifacts,
      tokens: response.tokens.total,
      duration: Date.now() - start,
    };
  }

  private planWithRules(input: TaskInput, start: number): Promise<TaskResult> {
    const goal = input.goal.toLowerCase();
    const subtasks: any[] = [];

    // Analyze goal and assign agents
    if (goal.includes("api") || goal.includes("backend") || goal.includes("server")) {
      subtasks.push({ id: "t1", description: "Design API architecture", agent: "architect", dependsOn: [], complexity: "medium" });
      subtasks.push({ id: "t2", description: "Implement backend", agent: "backend", dependsOn: ["t1"], complexity: "high" });
    }

    if (goal.includes("web") || goal.includes("frontend") || goal.includes("ui")) {
      subtasks.push({ id: "t3", description: "Design UI/UX", agent: "architect", dependsOn: [], complexity: "medium" });
      subtasks.push({ id: "t4", description: "Implement frontend", agent: "frontend", dependsOn: ["t3"], complexity: "high" });
    }

    if (goal.includes("fix") || goal.includes("bug") || goal.includes("error")) {
      subtasks.push({ id: "t5", description: "Debug the issue", agent: "debug", dependsOn: [], complexity: "medium" });
    }

    if (goal.includes("security") || goal.includes("auth") || goal.includes("vulnerability")) {
      subtasks.push({ id: "t6", description: "Security audit", agent: "security", dependsOn: [], complexity: "medium" });
    }

    if (goal.includes("deploy") || goal.includes("docker") || goal.includes("ci/cd")) {
      subtasks.push({ id: "t7", description: "Setup deployment", agent: "devops", dependsOn: [], complexity: "medium" });
    }

    // Default plan if nothing matched
    if (subtasks.length === 0) {
      subtasks.push(
        { id: "t1", description: "Design system architecture", agent: "architect", dependsOn: [], complexity: "medium" },
        { id: "t2", description: "Implement core features", agent: "backend", dependsOn: ["t1"], complexity: "high" },
        { id: "t3", description: "Write tests", agent: "qa", dependsOn: ["t2"], complexity: "medium" },
        { id: "t4", description: "Generate report", agent: "reporter", dependsOn: ["t3"], complexity: "low" }
      );
    }

    const plan = {
      analysis: `Rule-based analysis of: ${input.goal}`,
      subtasks,
      estimatedDuration: "5-15 minutes",
      risks: ["No LLM available — using rule-based planning"],
    };

    const artifacts: Artifact[] = [
      { name: "plan", type: "json", content: JSON.stringify(plan, null, 2) },
    ];

    for (const artifact of artifacts) {
      this.memory.store("artifact", "planner", artifact);
    }

    this.emit("planner:complete", { taskId: input.taskId, plan });

    return Promise.resolve({
      agent: "planner",
      taskId: input.taskId,
      status: "completed",
      summary: `📋 Rule-based plan: ${subtasks.length} subtasks`,
      artifacts,
      duration: Date.now() - start,
    });
  }

  private parsePlanFromText(text: string): any {
    // Fallback: extract plan from unstructured text
    const lines = text.split("\n").filter((l) => l.trim());
    const subtasks: any[] = [];
    let id = 1;

    for (const line of lines) {
      if (line.match(/^\d+[\.\)]\s/)) {
        subtasks.push({
          id: `t${id++}`,
          description: line.replace(/^\d+[\.\)]\s*/, "").trim(),
          agent: this.guessAgent(line),
          dependsOn: id > 1 ? [`t${id - 2}`] : [],
          complexity: "medium",
        });
      }
    }

    return {
      analysis: "Parsed from LLM text response",
      subtasks,
      estimatedDuration: "5-15 minutes",
      risks: [],
    };
  }

  private guessAgent(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes("design") || lower.includes("architect")) return "architect";
    if (lower.includes("code") || lower.includes("implement") || lower.includes("build")) return "backend";
    if (lower.includes("test") || lower.includes("qa")) return "qa";
    if (lower.includes("security") || lower.includes("audit")) return "security";
    if (lower.includes("deploy") || lower.includes("docker")) return "devops";
    if (lower.includes("report") || lower.includes("document")) return "reporter";
    return "backend";
  }
}

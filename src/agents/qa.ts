/**
 * BOWO QA Agent — Quality Assurance & Testing
 */

import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult, type Artifact } from "./base.js";
import { MemoryType } from "../memory.js";

const CONFIG: AgentConfig = {
  name: "qa",
  displayName: "QA Engineer",
  icon: "✅",
  description: "Generates tests, validates code quality, and ensures standards",
  systemPrompt: `You are an expert QA engineer. Generate unit tests, integration tests, and validate code quality.`,
  capabilities: ["unit-testing", "integration-testing", "code-review", "validation"],
};

export class QAAgent extends BaseAgent {
  constructor(memory: any, communication: any, llm?: any, workDir?: string) {
    super(CONFIG, memory, communication, llm, workDir);
  }

  async execute(input: TaskInput): Promise<TaskResult> {
    const start = Date.now();
    this.log("✅ QA testing started", { goal: input.goal });

    try {
      const files: { name: string; path: string; content: string }[] = [];

      files.push({
        name: "test.ts",
        path: "tests/test.ts",
        content: `import { describe, it, expect } from "vitest";

describe("TODO API", () => {
  it("should return health check", async () => {
    const res = await fetch("http://localhost:3000/health");
    const data = await res.json();
    expect(data.status).toBe("ok");
  });

  it("should create a todo", async () => {
    const res = await fetch("http://localhost:3000/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test todo" }),
    });
    expect(res.status).toBe(201);
  });
});`,
      });

      for (const file of files) {
        this.writeFile(file.path, file.content);
      }

      const artifacts: Artifact[] = files.map((f) => ({
        name: f.name, type: "test", content: f.content, path: f.path,
      }));

      for (const artifact of artifacts) {
        this.memory.store(MemoryType.ARTIFACT, "qa", artifact);
      }

      return {
        agent: "qa", taskId: input.taskId, status: "completed",
        summary: `✅ Generated ${files.length} test files`, artifacts,
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent: "qa", taskId: input.taskId, status: "failed",
        summary: `❌ QA failed: ${err.message}`, artifacts: [],
        duration: Date.now() - start,
      };
    }
  }
}

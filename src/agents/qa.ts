/**
 * BOWO QA Agent — Quality Assurance & Testing
 *
 * Uses LLM for intelligent test generation and code review.
 * Falls back to rule-based test generation when LLM is offline.
 */

import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult, type Artifact } from "./base.js";
import { MemoryType } from "../memory.js";

const CONFIG: AgentConfig = {
  name: "qa",
  displayName: "QA Engineer",
  icon: "✅",
  description: "Generates tests, validates code quality, and ensures standards",
  systemPrompt: `You are an expert QA engineer specializing in:
- Unit testing with Vitest/Jest
- Integration testing
- End-to-end testing
- Code quality validation
- Edge case identification

Generate comprehensive, meaningful tests that cover:
- Happy path scenarios
- Edge cases and error handling
- Input validation
- Boundary conditions`,
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
      // Try LLM-powered test generation
      if (this.llm?.isAvailable()) {
        return await this.generateWithLLM(input, start);
      }
      // Fallback: rule-based test generation
      return this.generateWithRules(input, start);
    } catch (err: any) {
      this.log("✅ LLM test generation failed, falling back to rules", { error: err.message });
      return this.generateWithRules(input, start);
    }
  }

  private async generateWithLLM(input: TaskInput, start: number): Promise<TaskResult> {
    this.log("✅ Using LLM for test generation", { goal: input.goal });

    const prevArtifacts = this.getPreviousArtifacts(input.taskId);
    const context = prevArtifacts.length > 0
      ? `\nCode to test:\n${prevArtifacts.map((a) => `### ${a.name} (${a.path ?? "unknown path"})\n\`\`\`\n${a.content.slice(0, 2000)}\n\`\`\``).join("\n\n")}`
      : "";

    const prompt = `Generate comprehensive tests for: ${input.goal}

${context}

Requirements:
- Use Vitest as the test framework
- Write unit tests and integration tests
- Cover happy path, edge cases, and error scenarios
- Include meaningful assertions (not just checking existence)
- Add descriptive test names that explain what's being tested
- Group related tests with describe blocks

Respond with JSON:
{
  "testPlan": {
    "summary": "Brief overview of test strategy",
    "testCount": 10,
    "coverage": ["area1", "area2"]
  },
  "files": [
    {
      "name": "filename.test.ts",
      "path": "tests/filename.test.ts",
      "content": "test file content"
    }
  ],
  "reviewNotes": ["observation1", "observation2"]
}`;

    const response = await this.llmReason(prompt, JSON.stringify(input.context, null, 2));

    if (!response.success || !response.output) {
      throw new Error(response.error || "LLM returned empty response");
    }

    let result: any;
    try {
      let content = response.output.trim();
      if (content.startsWith("```")) {
        content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      }
      result = JSON.parse(content);
    } catch {
      // LLM didn't return valid JSON, wrap raw output as a test file
      result = {
        testPlan: {
          summary: "Generated from LLM response",
          testCount: 1,
          coverage: ["general"],
        },
        files: [
          {
            name: "test.ts",
            path: "tests/test.ts",
            content: response.output,
          },
        ],
        reviewNotes: ["LLM returned non-JSON response, used raw output"],
      };
    }

    // Validate structure
    if (!result.files || !Array.isArray(result.files)) result.files = [];
    if (!result.testPlan) result.testPlan = { summary: "Tests generated", testCount: 0, coverage: [] };
    if (!result.reviewNotes) result.reviewNotes = [];

    // Write test files to disk
    const writtenFiles: string[] = [];
    for (const file of result.files) {
      const writeResult = this.writeFile(file.path, file.content);
      if (writeResult.success) {
        writtenFiles.push(file.path);
        this.log(`✅ Written: ${file.path}`);
      }
    }

    const artifacts: Artifact[] = result.files.map((f: any) => ({
      name: f.name,
      type: "test",
      content: f.content,
      path: f.path,
    }));

    for (const artifact of artifacts) {
      this.memory.store(MemoryType.ARTIFACT, "qa", artifact);
    }

    this.emit("qa:complete", {
      taskId: input.taskId,
      testPlan: result.testPlan,
      files: writtenFiles,
    });

    return {
      agent: "qa",
      taskId: input.taskId,
      status: "completed",
      summary: `✅ LLM generated ${writtenFiles.length} test files — ${result.testPlan.summary}. Coverage: ${result.testPlan.coverage?.join(", ") ?? "general"}`,
      artifacts,
      duration: Date.now() - start,
    };
  }

  private generateWithRules(input: TaskInput, start: number): Promise<TaskResult> {
    this.log("✅ Using rule-based test generation");

    const goal = input.goal.toLowerCase();
    const files: { name: string; path: string; content: string }[] = [];

    // Generate appropriate tests based on the goal
    if (goal.includes("api") || goal.includes("rest") || goal.includes("backend")) {
      files.push({
        name: "api.test.ts",
        path: "tests/api.test.ts",
        content: `import { describe, it, expect } from "vitest";

describe("API Endpoints", () => {
  it("should return health check", async () => {
    const res = await fetch("http://localhost:3000/health");
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.timestamp).toBeDefined();
  });

  it("should return 404 for unknown routes", async () => {
    const res = await fetch("http://localhost:3000/api/nonexistent");
    expect(res.status).toBe(404);
  });

  it("should create a resource via POST", async () => {
    const res = await fetch("http://localhost:3000/api/v1/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test resource" }),
    });
    expect(res.status).toBe(201);
  });

  it("should handle invalid JSON body", async () => {
    const res = await fetch("http://localhost:3000/api/v1/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json",
    });
    expect(res.status).toBe(400);
  });

  it("should list resources", async () => {
    const res = await fetch("http://localhost:3000/api/v1/resources");
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});`,
      });
    }

    if (goal.includes("todo") || goal.includes("task") || goal.includes("frontend")) {
      files.push({
        name: "todo.test.ts",
        path: "tests/todo.test.ts",
        content: `import { describe, it, expect } from "vitest";

describe("Todo API", () => {
  it("should create a todo", async () => {
    const res = await fetch("http://localhost:3000/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test todo" }),
    });
    expect(res.status).toBe(201);
  });

  it("should list todos", async () => {
    const res = await fetch("http://localhost:3000/api/todos");
    const data = await res.json();
    expect(data.data).toBeDefined();
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("should toggle todo completion", async () => {
    const createRes = await fetch("http://localhost:3000/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Toggle test" }),
    });
    const { id } = await createRes.json();

    const toggleRes = await fetch(\`http://localhost:3000/api/todos/\${id}\`, {
      method: "PUT",
    });
    expect(toggleRes.status).toBe(200);
  });

  it("should reject empty todo title", async () => {
    const res = await fetch("http://localhost:3000/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    expect(res.status).toBe(400);
  });
});`,
      });
    }

    // Default: if no specific tests were matched, generate a generic health check test
    if (files.length === 0) {
      files.push({
        name: "test.ts",
        path: "tests/test.ts",
        content: `import { describe, it, expect } from "vitest";

describe("Application", () => {
  it("should return health check", async () => {
    const res = await fetch("http://localhost:3000/health");
    const data = await res.json();
    expect(data.status).toBe("ok");
  });

  it("should handle 404 routes", async () => {
    const res = await fetch("http://localhost:3000/nonexistent");
    expect(res.status).toBe(404);
  });
});`,
      });
    }

    for (const file of files) {
      this.writeFile(file.path, file.content);
    }

    const artifacts: Artifact[] = files.map((f) => ({
      name: f.name, type: "test", content: f.content, path: f.path,
    }));

    for (const artifact of artifacts) {
      this.memory.store(MemoryType.ARTIFACT, "qa", artifact);
    }

    return Promise.resolve({
      agent: "qa", taskId: input.taskId, status: "completed",
      summary: `✅ Rule-based generated ${files.length} test files (coverage: generic)`, artifacts,
      duration: Date.now() - start,
    });
  }
}

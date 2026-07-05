/**
 * BOWO Backend Agent — LLM-Powered Backend Development
 *
 * Generates server code, APIs, database schemas,
 * and business logic using LLM.
 */

import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult, type Artifact } from "./base.js";
import { MemoryType } from "../memory.js";

export class BackendAgent extends BaseAgent {
  constructor(memory: any, communication: any, llm?: any, workDir?: string) {
    const config: AgentConfig = {
      name: "backend",
      displayName: "Backend Developer",
      icon: "⚙️",
      description: "Generates server code, APIs, database schemas, and business logic",
      systemPrompt: `You are an expert backend developer specializing in:
- REST APIs and GraphQL
- Database design (SQL, NoSQL)
- Authentication & authorization
- Business logic implementation
- Error handling and validation

Generate clean, production-quality code with proper types and error handling.`,
      capabilities: ["api-development", "database-design", "authentication", "business-logic"],
    };

    super(config, memory, communication, llm, workDir);
  }

  async execute(input: TaskInput): Promise<TaskResult> {
    const start = Date.now();
    this.log("⚙️ Backend development started", { goal: input.goal });

    try {
      if (this.llm?.isAvailable()) {
        return await this.generateWithLLM(input, start);
      }
      return this.generateWithRules(input, start);
    } catch (err: any) {
      this.log("⚙️ LLM generation failed, using rules");
      return this.generateWithRules(input, start);
    }
  }

  private async generateWithLLM(input: TaskInput, start: number): Promise<TaskResult> {
    const prevArtifacts = this.getPreviousArtifacts(input.taskId);
    const context = prevArtifacts.length > 0
      ? `\nPrevious work:\n${prevArtifacts.map((a) => `[${a.name}]: ${a.content.slice(0, 500)}`).join("\n")}`
      : "";

    const response = await this.llm!.prompt(
      `${this.config.systemPrompt}\n\nGenerate backend code for: ${input.goal}${context}\n\nRespond with JSON:\n{
  "files": [
    { "name": "filename.ts", "path": "src/path/filename.ts", "content": "file content" }
  ],
  "summary": "Brief summary of what was generated",
  "dependencies": ["package names needed"]
}`,
      `Generate backend code for: ${input.goal}`
    );

    let result: any;
    try {
      let content = response.content.trim();
      if (content.startsWith("```")) {
        content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      }
      result = JSON.parse(content);
    } catch {
      result = { files: [{ name: "output.ts", path: "src/output.ts", content: response.content }], summary: "Generated output", dependencies: [] };
    }

    const writtenFiles: string[] = [];
    if (result.files) {
      for (const file of result.files) {
        const writeResult = this.writeFile(file.path, file.content);
        if (writeResult.success) {
          writtenFiles.push(file.path);
          this.log(`⚙️ Written: ${file.path}`);
        }
      }
    }

    const artifacts: Artifact[] = result.files?.map((f: any) => ({
      name: f.name,
      type: "code",
      content: f.content,
      path: f.path,
    })) ?? [];

    for (const artifact of artifacts) {
      this.memory.store("artifact", "backend", artifact);
    }

    this.emit("backend:complete", { taskId: input.taskId, files: writtenFiles });

    return {
      agent: "backend",
      taskId: input.taskId,
      status: "completed",
      summary: `⚙️ Generated ${writtenFiles.length} files: ${writtenFiles.join(", ")}`,
      artifacts,
      tokens: response.tokens.total,
      duration: Date.now() - start,
    };
  }

  private generateWithRules(input: TaskInput, start: number): Promise<TaskResult> {
    const goal = input.goal.toLowerCase();
    const files: { name: string; path: string; content: string }[] = [];

    if (goal.includes("api") || goal.includes("rest")) {
      files.push({
        name: "server.ts",
        path: "src/server.ts",
        content: `import express from "express";

const app = express();
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes for: ${input.goal}
// TODO: Implement routes

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});

export default app;`,
      });

      files.push({
        name: "package.json",
        path: "package.json",
        content: JSON.stringify({
          name: "bowo-generated-api",
          version: "1.0.0",
          scripts: {
            dev: "tsx watch src/server.ts",
            build: "tsc",
            start: "node dist/server.js",
          },
          dependencies: { express: "^4.18.0" },
          devDependencies: {
            "@types/express": "^4.17.0",
            tsx: "^4.0.0",
            typescript: "^5.0.0",
          },
        }, null, 2),
      });
    }

    for (const file of files) {
      this.writeFile(file.path, file.content);
    }

    const artifacts: Artifact[] = files.map((f) => ({
      name: f.name,
      type: "code",
      content: f.content,
      path: f.path,
    }));

    for (const artifact of artifacts) {
      this.memory.store("artifact", "backend", artifact);
    }

    return Promise.resolve({
      agent: "backend",
      taskId: input.taskId,
      status: "completed",
      summary: `⚙️ Generated ${files.length} backend files (rule-based)`,
      artifacts,
      duration: Date.now() - start,
    });
  }
}

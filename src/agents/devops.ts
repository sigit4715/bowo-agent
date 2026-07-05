/**
 * BOWO DevOps Agent — Deployment & Infrastructure
 */

import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult, type Artifact } from "./base.js";
import { MemoryType } from "../memory.js";

const CONFIG: AgentConfig = {
  name: "devops",
  displayName: "DevOps Engineer",
  icon: "🚀",
  description: "Generates Docker configs, CI/CD pipelines, and deployment scripts",
  systemPrompt: `You are a DevOps expert. Generate Docker configs, CI/CD pipelines, and deployment scripts.`,
  capabilities: ["docker", "ci-cd", "deployment", "monitoring"],
};

export class DevOpsAgent extends BaseAgent {
  constructor(memory: any, communication: any, llm?: any, workDir?: string) {
    super(CONFIG, memory, communication, llm, workDir);
  }

  async execute(input: TaskInput): Promise<TaskResult> {
    const start = Date.now();
    this.log("🚀 DevOps setup started", { goal: input.goal });

    // Try LLM-enhanced generation first, fall back to templates
    if (this.llm?.isAvailable()) {
      try {
        return await this.deployWithLLM(input, start);
      } catch (err: any) {
        this.log("⚠️ LLM DevOps generation failed, falling back to templates", { error: err.message });
      }
    }

    return await this.deployWithRules(input, start);
  }

  /**
   * LLM-enhanced deployment planning — asks the model to generate
   * Dockerfiles, CI/CD pipelines, and deployment strategy.
   */
  private async deployWithLLM(input: TaskInput, start: number): Promise<TaskResult> {
    const context = JSON.stringify(input.context ?? {}, null, 2);

    const prompt = `Generate a complete deployment setup for the following goal:
"${input.goal}"

Produce the following configuration files, each wrapped in a JSON string field:

1. Dockerfile — multi-stage build with security best practices (non-root user, minimal image, health checks)
2. docker-compose.yml — service orchestration with environment variables, volumes, health checks
3. .github/workflows/ci.yml — CI/CD pipeline with lint, test, build, and deploy stages
4. .dockerignore — appropriate exclusions

Respond with JSON in this exact structure:
{
  "files": [
    { "name": "Dockerfile", "path": "Dockerfile", "content": "..." },
    { "name": "docker-compose.yml", "path": "docker-compose.yml", "content": "..." },
    { "name": "ci.yml", "path": ".github/workflows/ci.yml", "content": "..." },
    { "name": ".dockerignore", "path": ".dockerignore", "content": "..." }
  ],
  "strategy": "Brief description of the deployment strategy",
  "notes": ["Important considerations or follow-up steps"]
}`;

    const response = await this.askLLM(prompt, context);
    if (!response) {
      throw new Error("askLLM returned null");
    }

    let parsed: any;
    try {
      const cleaned = response.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: try to extract file blocks from markdown fences
      parsed = { files: [], strategy: response.slice(0, 300), notes: [] };
    }

    const files: { name: string; path: string; content: string }[] = Array.isArray(parsed.files) ? parsed.files : [];

    // Write each generated file to disk
    for (const file of files) {
      if (file.path && file.content) {
        this.writeFile(file.path, file.content);
      }
    }

    const artifacts: Artifact[] = files.map((f) => ({
      name: f.name, type: "config", content: f.content, path: f.path,
    }));

    // Store the strategy as an extra artifact
    if (parsed.strategy) {
      artifacts.push({
        name: "deployment-strategy",
        type: "report",
        content: JSON.stringify({ strategy: parsed.strategy, notes: parsed.notes ?? [] }, null, 2),
      });
    }

    for (const artifact of artifacts) {
      this.memory.store(MemoryType.ARTIFACT, "devops", artifact);
    }

    return {
      agent: "devops", taskId: input.taskId, status: "completed",
      summary: `🚀 Generated ${files.length} DevOps configs (LLM)`,
      artifacts,
      duration: Date.now() - start,
    };
  }

  /**
   * Template-based deployment generation — the original fallback logic.
   */
  private async deployWithRules(input: TaskInput, start: number): Promise<TaskResult> {
    try {
      const files: { name: string; path: string; content: string }[] = [];

      files.push({
        name: "Dockerfile",
        path: "Dockerfile",
        content: `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "dist/server.js"]`,
      });

      files.push({
        name: "docker-compose.yml",
        path: "docker-compose.yml",
        content: `version: "3.8"
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    depends_on:
      - db
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: todos
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: secret`,
      });

      files.push({
        name: ".github/workflows/ci.yml",
        path: ".github/workflows/ci.yml",
        content: `name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - run: npm run build`,
      });

      for (const file of files) {
        this.writeFile(file.path, file.content);
      }

      const artifacts: Artifact[] = files.map((f) => ({
        name: f.name, type: "config", content: f.content, path: f.path,
      }));

      for (const artifact of artifacts) {
        this.memory.store(MemoryType.ARTIFACT, "devops", artifact);
      }

      return {
        agent: "devops", taskId: input.taskId, status: "completed",
        summary: `🚀 Generated ${files.length} DevOps configs (rules)`,
        artifacts,
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent: "devops", taskId: input.taskId, status: "failed",
        summary: `❌ DevOps failed: ${err.message}`, artifacts: [],
        duration: Date.now() - start,
      };
    }
  }
}

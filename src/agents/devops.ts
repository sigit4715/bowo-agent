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
        summary: `🚀 Generated ${files.length} DevOps configs`,
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

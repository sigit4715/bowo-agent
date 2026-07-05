/**
 * BOWO Architect Agent — System Design & Architecture
 *
 * Designs system architecture, data models, API contracts,
 * and technology decisions.
 */

import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult, type Artifact } from "./base.js";

export interface ArchitectureDesign {
  components: Component[];
  dataModels: DataModel[];
  apiContracts: APIContract[];
  techStack: string[];
  diagrams: string[];
  decisions: Decision[];
}

interface Component {
  name: string;
  type: "service" | "database" | "cache" | "queue" | "external";
  description: string;
  responsibilities: string[];
}

interface DataModel {
  name: string;
  fields: { name: string; type: string; required: boolean }[];
}

interface APIContract {
  method: string;
  path: string;
  description: string;
  requestSchema?: string;
  responseSchema?: string;
}

interface Decision {
  area: string;
  choice: string;
  rationale: string;
}

export class ArchitectAgent extends BaseAgent {
  constructor(memory: any, communication: any, llm?: any, workDir?: string) {
    const config: AgentConfig = {
      name: "architect",
      displayName: "Arsitek Sistem",
      icon: "🏗",
      description: "Merancang arsitektur, data model, dan API contracts",
      systemPrompt: `You are the BOWO Architect Agent. Your job is to:
1. Design system architecture (components, services, data flow)
2. Define data models and schemas
3. Create API contracts (endpoints, request/response)
4. Make technology decisions with rationale
5. Generate architecture diagrams (Mermaid/ASCII)

Focus on clean, scalable, maintainable designs.
Document every decision with rationale.`,
      capabilities: ["system_design", "data_modeling", "api_design", "tech_selection", "diagram_generation"],
    };
    super(config, memory, communication, llm, workDir);
  }

  async execute(input: TaskInput): Promise<TaskResult> {
    const start = Date.now();

    try {
      const design = this.design(input);
      this.log("🏗 Architecture design completed", { decisions: design.decisions.length });

      const artifacts: Artifact[] = [
        {
          name: "architecture.md",
          type: "document",
          content: this.toMarkdown(design),
        },
        {
          name: "architecture.json",
          type: "config",
          content: JSON.stringify(design, null, 2),
        },
      ];

      return {
        agent: "architect",
        taskId: input.taskId,
        status: "completed",
        summary: `🏗 Architecture: ${design.components.length} components, ${design.decisions.length} decisions — ${design.decisions.map(d => `${d.area}: ${d.choice}`).join("; ")}`,
        artifacts,
        duration: Date.now() - start,
      };
    } catch (err) {
      return {
        agent: "architect",
        taskId: input.taskId,
        status: "failed",
        summary: `🏗 Architecture failed: ${String(err)}`,
        artifacts: [],
        duration: Date.now() - start,
      };
    }
  }

  private design(task: TaskInput): ArchitectureDesign {
    const desc = task.goal.toLowerCase();

    const components: Component[] = [
      {
        name: "api-gateway",
        type: "service",
        description: "API Gateway / Load Balancer",
        responsibilities: ["routing", "rate limiting", "auth middleware"],
      },
      {
        name: "app-server",
        type: "service",
        description: "Main application server",
        responsibilities: ["business logic", "request handling", "validation"],
      },
      {
        name: "database",
        type: "database",
        description: "Primary data store",
        responsibilities: ["data persistence", "transactions", "queries"],
      },
    ];

    if (desc.includes("cache") || desc.includes("fast")) {
      components.push({
        name: "cache",
        type: "cache",
        description: "Redis cache layer",
        responsibilities: ["session storage", "query caching", "rate limiting"],
      });
    }

    if (desc.includes("queue") || desc.includes("async") || desc.includes("background")) {
      components.push({
        name: "queue",
        type: "queue",
        description: "Message queue for async processing",
        responsibilities: ["job scheduling", "async tasks", "event streaming"],
      });
    }

    const dataModels: DataModel[] = [
      {
        name: "User",
        fields: [
          { name: "id", type: "string", required: true },
          { name: "email", type: "string", required: true },
          { name: "createdAt", type: "datetime", required: true },
        ],
      },
    ];

    const apiContracts: APIContract[] = [
      { method: "GET", path: "/api/health", description: "Health check" },
      { method: "GET", path: "/api/v1/resources", description: "List resources" },
      { method: "POST", path: "/api/v1/resources", description: "Create resource" },
      { method: "PUT", path: "/api/v1/resources/:id", description: "Update resource" },
      { method: "DELETE", path: "/api/v1/resources/:id", description: "Delete resource" },
    ];

    const techStack = [
      "TypeScript",
      "Node.js",
      desc.includes("react") ? "React" : "Next.js",
      "PostgreSQL",
      "Redis",
      "Docker",
    ];

    const decisions: Decision[] = [
      {
        area: "Architecture Pattern",
        choice: "Modular Monolith → Microservices (when needed)",
        rationale: "Start simple, extract services when scale demands it",
      },
      {
        area: "Database",
        choice: "PostgreSQL",
        rationale: "ACID compliance, JSON support, mature ecosystem",
      },
      {
        area: "API Style",
        choice: "RESTful with OpenAPI spec",
        rationale: "Wide tooling support, easy documentation",
      },
    ];

    return {
      components,
      dataModels,
      apiContracts,
      techStack,
      diagrams: [this.generateMermaidDiagram(components)],
      decisions,
    };
  }

  private generateMermaidDiagram(components: Component[]): string {
    let diagram = "```mermaid\ngraph TD\n";
    components.forEach((c, i) => {
      const icon = { service: "⚙️", database: "🗄️", cache: "⚡", queue: "📨", external: "🌐" }[c.type];
      diagram += `  ${i}[${icon} ${c.name}] --> ${c.description}\n`;
    });
    diagram += "```";
    return diagram;
  }

  private toMarkdown(design: ArchitectureDesign): string {
    let md = "# 🏗 Architecture Design\n\n";
    md += "## Components\n\n";
    for (const c of design.components) {
      md += `### ${c.name} (${c.type})\n${c.description}\n`;
      md += `Responsibilities: ${c.responsibilities.join(", ")}\n\n`;
    }
    md += "## Tech Stack\n\n";
    for (const t of design.techStack) md += `- ${t}\n`;
    md += "\n## Decisions\n\n";
    for (const d of design.decisions) {
      md += `### ${d.area}\n**Choice:** ${d.choice}\n**Rationale:** ${d.rationale}\n\n`;
    }
    md += "## API Contracts\n\n";
    for (const a of design.apiContracts) {
      md += `- \`${a.method} ${a.path}\` — ${a.description}\n`;
    }
    return md;
  }
}

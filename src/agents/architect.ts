/**
 * BOWO Architect Agent — System Design & Architecture
 *
 * Uses LLM for intelligent architecture design.
 * Falls back to rule-based design when LLM is offline.
 */
import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult, type Artifact } from "./base.js";
import { MemoryType } from "../memory.js";

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
      // Try LLM-powered design
      if (this.llm?.isAvailable()) {
        return await this.designWithLLM(input, start);
      }
      // Fallback: rule-based design
      return this.designWithRules(input, start);
    } catch (err: any) {
      this.log("🏗 LLM design failed, falling back to rules", { error: err.message });
      return this.designWithRules(input, start);
    }
  }

  private async designWithLLM(input: TaskInput, start: number): Promise<TaskResult> {
    this.log("🏗 Using LLM for architecture design", { goal: input.goal });

    const prevArtifacts = this.getPreviousArtifacts(input.taskId);
    const context = prevArtifacts.length > 0
      ? `\nPrevious work:\n${prevArtifacts.map((a) => `[${a.name}]: ${a.content.slice(0, 500)}`).join("\n")}`
      : "";

    const prompt = `Design a complete system architecture for: ${input.goal}

${context}

Respond with JSON matching this structure:
{
  "components": [
    {
      "name": "component-name",
      "type": "service|database|cache|queue|external",
      "description": "What this component does",
      "responsibilities": ["responsibility1", "responsibility2"]
    }
  ],
  "dataModels": [
    {
      "name": "ModelName",
      "fields": [
        { "name": "field_name", "type": "string|number|boolean|datetime", "required": true }
      ]
    }
  ],
  "apiContracts": [
    {
      "method": "GET|POST|PUT|DELETE",
      "path": "/api/v1/resource",
      "description": "What this endpoint does",
      "requestSchema": "optional request body description",
      "responseSchema": "optional response description"
    }
  ],
  "techStack": ["Technology1", "Technology2"],
  "diagrams": ["mermaid diagram string"],
  "decisions": [
    {
      "area": "Architecture Pattern|Database|API Style|etc",
      "choice": "What was chosen",
      "rationale": "Why this choice"
    }
  ]
}

Choose the right technologies and components for the specific goal. Be specific, not generic.`;

    const response = await this.llmReason(prompt, JSON.stringify(input.context, null, 2));

    if (!response.success || !response.output) {
      throw new Error(response.error || "LLM returned empty response");
    }

    let design: ArchitectureDesign;
    try {
      let content = response.output.trim();
      if (content.startsWith("```")) {
        content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      }
      design = JSON.parse(content) as ArchitectureDesign;
    } catch {
      // LLM didn't return valid JSON, parse from text
      design = this.parseDesignFromText(response.output);
    }

    // Validate minimum structure
    if (!design.components || !Array.isArray(design.components)) {
      design.components = [];
    }
    if (!design.dataModels) design.dataModels = [];
    if (!design.apiContracts) design.apiContracts = [];
    if (!design.techStack) design.techStack = [];
    if (!design.decisions) design.decisions = [];
    if (!design.diagrams || design.diagrams.length === 0) {
      design.diagrams = [this.generateMermaidDiagram(design.components)];
    }

    this.log("🏗 Architecture design completed via LLM", {
      components: design.components.length,
      decisions: design.decisions.length,
    });

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

    for (const artifact of artifacts) {
      this.memory.store(MemoryType.ARTIFACT, "architect", artifact);
    }

    this.emit("architect:complete", { taskId: input.taskId, components: design.components.length });

    return {
      agent: "architect",
      taskId: input.taskId,
      status: "completed",
      summary: `🏗 LLM Architecture: ${design.components.length} components, ${design.decisions.length} decisions — ${design.decisions.map(d => `${d.area}: ${d.choice}`).join("; ")}`,
      artifacts,
      duration: Date.now() - start,
    };
  }

  private designWithRules(input: TaskInput, start: number): Promise<TaskResult> {
    this.log("🏗 Using rule-based architecture design");
    const design = this.design(input);

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

    for (const artifact of artifacts) {
      this.memory.store(MemoryType.ARTIFACT, "architect", artifact);
    }

    this.emit("architect:complete", { taskId: input.taskId, components: design.components.length });

    return Promise.resolve({
      agent: "architect",
      taskId: input.taskId,
      status: "completed",
      summary: `🏗 Rule-based Architecture: ${design.components.length} components, ${design.decisions.length} decisions — ${design.decisions.map(d => `${d.area}: ${d.choice}`).join("; ")}`,
      artifacts,
      duration: Date.now() - start,
    });
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

  private parseDesignFromText(text: string): ArchitectureDesign {
    // Fallback: create a basic design from unstructured LLM text
    return {
      components: [
        {
          name: "app-server",
          type: "service",
          description: `Application designed for: ${text.slice(0, 200)}`,
          responsibilities: ["business logic"],
        },
        {
          name: "database",
          type: "database",
          description: "Primary data store",
          responsibilities: ["data persistence"],
        },
      ],
      dataModels: [],
      apiContracts: [],
      techStack: ["TypeScript", "Node.js"],
      diagrams: [],
      decisions: [
        {
          area: "Architecture",
          choice: "See architecture.md for details",
          rationale: "LLM provided text-based design",
        },
      ],
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

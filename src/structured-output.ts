/**
 * 🤖 BOWO — Structured Output
 *
 * JSON schema validation for agent outputs.
 * Inspired by MetaGPT structured output + PydanticAI type safety.
 */

// ─── Schema Definitions ───

export interface OutputSchema {
  name: string;
  description: string;
  fields: Record<string, FieldSchema>;
}

export interface FieldSchema {
  type: "string" | "number" | "boolean" | "array" | "object";
  required: boolean;
  description?: string;
  default?: any;
  items?: FieldSchema;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data?: any;
}

// ─── Predefined Agent Schemas ───

export const AGENT_SCHEMAS: Record<string, OutputSchema> = {
  planner: {
    name: "PlanOutput",
    description: "Output from the Planner agent",
    fields: {
      subtasks: { type: "array", required: true, description: "List of subtasks", items: { type: "object", required: true } },
      estimatedTime: { type: "string", required: false, description: "Estimated completion time" },
      priority: { type: "string", required: false, description: "Overall priority: low/medium/high" },
    },
  },
  architect: {
    name: "ArchitectureOutput",
    description: "Output from the Architect agent",
    fields: {
      components: { type: "array", required: true, description: "System components", items: { type: "object", required: true } },
      techStack: { type: "array", required: false, description: "Recommended technologies", items: { type: "string", required: true } },
      patterns: { type: "array", required: false, description: "Design patterns used", items: { type: "string", required: true } },
    },
  },
  backend: {
    name: "BackendOutput",
    description: "Output from the Backend agent",
    fields: {
      files: { type: "array", required: true, description: "Generated files", items: { type: "object", required: true } },
      endpoints: { type: "array", required: false, description: "API endpoints", items: { type: "object", required: true } },
      dependencies: { type: "array", required: false, description: "Package dependencies", items: { type: "string", required: true } },
    },
  },
  frontend: {
    name: "FrontendOutput",
    description: "Output from the Frontend agent",
    fields: {
      files: { type: "array", required: true, description: "Generated files", items: { type: "object", required: true } },
      components: { type: "array", required: false, description: "UI components", items: { type: "object", required: true } },
    },
  },
  qa: {
    name: "QAOutput",
    description: "Output from the QA agent",
    fields: {
      testPlan: { type: "string", required: true, description: "Test plan description" },
      testCases: { type: "array", required: false, description: "Test cases", items: { type: "object", required: true } },
      coverage: { type: "number", required: false, description: "Expected test coverage %" },
    },
  },
  security: {
    name: "SecurityOutput",
    description: "Output from the Security agent",
    fields: {
      vulnerabilities: { type: "array", required: true, description: "Found vulnerabilities", items: { type: "object", required: true } },
      recommendations: { type: "array", required: false, description: "Security recommendations", items: { type: "string", required: true } },
      riskLevel: { type: "string", required: false, description: "Overall risk: low/medium/high/critical" },
    },
  },
  reporter: {
    name: "ReportOutput",
    description: "Output from the Reporter agent",
    fields: {
      summary: { type: "string", required: true, description: "Executive summary" },
      sections: { type: "array", required: false, description: "Report sections", items: { type: "object", required: true } },
      recommendations: { type: "array", required: false, description: "Next steps", items: { type: "string", required: true } },
    },
  },
};

// ─── Structured Output Manager ───

export class StructuredOutput {
  private schemas: Map<string, OutputSchema> = new Map();

  constructor() {
    // Register built-in schemas
    for (const [name, schema] of Object.entries(AGENT_SCHEMAS)) {
      this.schemas.set(name, schema);
    }
  }

  /**
   * Register a custom output schema
   */
  register(agentName: string, schema: OutputSchema): void {
    this.schemas.set(agentName, schema);
  }

  /**
   * Get schema for an agent
   */
  getSchema(agentName: string): OutputSchema | undefined {
    return this.schemas.get(agentName);
  }

  /**
   * Validate agent output against its schema
   */
  validate(agentName: string, output: any): ValidationResult {
    const schema = this.schemas.get(agentName);
    if (!schema) {
      return { valid: true, data: output, errors: [] }; // No schema = pass
    }

    const errors: string[] = [];
    this.validateFields(output, schema.fields, "", errors);

    return {
      valid: errors.length === 0,
      errors,
      data: output,
    };
  }

  /**
   * Normalize output to match schema (fill defaults, cast types)
   */
  normalize(agentName: string, output: any): any {
    const schema = this.schemas.get(agentName);
    if (!schema) return output;

    const normalized = { ...output };
    for (const [field, fieldSchema] of Object.entries(schema.fields)) {
      if (normalized[field] === undefined || normalized[field] === null) {
        if (fieldSchema.required) {
          // Set default based on type
          switch (fieldSchema.type) {
            case "array": normalized[field] = []; break;
            case "object": normalized[field] = {}; break;
            case "string": normalized[field] = ""; break;
            case "number": normalized[field] = 0; break;
            case "boolean": normalized[field] = false; break;
          }
        } else if (fieldSchema.default !== undefined) {
          normalized[field] = fieldSchema.default;
        }
      }
    }
    return normalized;
  }

  /**
   * List all registered schemas
   */
  listSchemas(): { agent: string; name: string; description: string; fieldCount: number }[] {
    return Array.from(this.schemas.entries()).map(([agent, schema]) => ({
      agent,
      name: schema.name,
      description: schema.description,
      fieldCount: Object.keys(schema.fields).length,
    }));
  }

  private validateFields(data: any, fields: Record<string, FieldSchema>, prefix: string, errors: string[]): void {
    for (const [name, fieldSchema] of Object.entries(fields)) {
      const path = prefix ? `${prefix}.${name}` : name;
      const value = data?.[name];

      if (fieldSchema.required && (value === undefined || value === null)) {
        errors.push(`Missing required field: ${path}`);
        continue;
      }

      if (value !== undefined && value !== null) {
        // Type check
        switch (fieldSchema.type) {
          case "array":
            if (!Array.isArray(value)) {
              errors.push(`Field ${path} should be array, got ${typeof value}`);
            } else if (fieldSchema.items) {
              value.forEach((item: any, i: number) => {
                if (fieldSchema.items!.type === "object" && typeof item !== "object") {
                  errors.push(`Field ${path}[${i}] should be object, got ${typeof item}`);
                }
              });
            }
            break;
          case "object":
            if (typeof value !== "object" || Array.isArray(value)) {
              errors.push(`Field ${path} should be object, got ${typeof value}`);
            }
            break;
          case "string":
            if (typeof value !== "string") {
              errors.push(`Field ${path} should be string, got ${typeof value}`);
            }
            break;
          case "number":
            if (typeof value !== "number") {
              errors.push(`Field ${path} should be number, got ${typeof value}`);
            }
            break;
          case "boolean":
            if (typeof value !== "boolean") {
              errors.push(`Field ${path} should be boolean, got ${typeof value}`);
            }
            break;
        }
      }
    }
  }
}

export default StructuredOutput;

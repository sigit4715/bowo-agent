/**
 * 🧠 BOWO Shared Context Manager
 *
 * Shared agent context inspired by CrewAI shared memory.
 * All agents read from and write to a single context object
 * so state flows seamlessly through the pipeline.
 */

// ─── Types ──

export interface AgentContext {
  goal: string;
  plan?: any;
  architecture?: any;
  code?: { backend?: any; frontend?: any };
  tests?: any;
  security?: any;
  report?: any;
  artifacts: any[];
  metadata: Record<string, any>;
  agentOutputs: Map<string, any>;
  sharedState: Record<string, any>;
}

// ─── ContextManager ──

export class ContextManager {
  private ctx: AgentContext;

  constructor(goal: string) {
    this.ctx = {
      goal,
      artifacts: [],
      metadata: {},
      agentOutputs: new Map(),
      sharedState: {},
    };
  }

  /** Get the full context object (reference, not copy). */
  getContext(): AgentContext {
    return this.ctx;
  }

  /** Store an output produced by a named agent. */
  setAgentOutput(agentName: string, output: any): void {
    this.ctx.agentOutputs.set(agentName, output);
    // Also mirror into the appropriate top-level field for convenience
    switch (agentName) {
      case "planner":
        this.ctx.plan = output;
        break;
      case "architect":
        this.ctx.architecture = output;
        break;
      case "backend":
        this.ctx.code = { ...this.ctx.code, backend: output };
        break;
      case "frontend":
        this.ctx.code = { ...this.ctx.code, frontend: output };
        break;
      case "qa":
        this.ctx.tests = output;
        break;
      case "security":
        this.ctx.security = output;
        break;
      case "reporter":
        this.ctx.report = output;
        break;
    }
  }

  /** Retrieve the output of a specific agent, or undefined. */
  getAgentOutput(agentName: string): any {
    return this.ctx.agentOutputs.get(agentName);
  }

  /** Return all agent outputs as a plain Record. */
  getAllOutputs(): Record<string, any> {
    const out: Record<string, any> = {};
    this.ctx.agentOutputs.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }

  /**
   * Update a top-level context field by key.
   * Use for plan, architecture, code, tests, security, report, etc.
   */
  update(key: string, value: any): void {
    (this.ctx as any)[key] = value;
  }

  /** Get a top-level context field by key. */
  get<T = any>(key: string): T {
    return (this.ctx as any)[key] as T;
  }

  /** Append an artifact (file path, generated asset, etc.) to the context. */
  addArtifact(artifact: any): void {
    this.ctx.artifacts.push(artifact);
  }

  /** Return all artifacts. */
  getArtifacts(): any[] {
    return this.ctx.artifacts;
  }

  /** Merge another partial context into this one (shallow per field). */
  merge(other: Partial<AgentContext>): void {
    if (other.plan !== undefined) this.ctx.plan = other.plan;
    if (other.architecture !== undefined) this.ctx.architecture = other.architecture;
    if (other.code !== undefined) this.ctx.code = other.code;
    if (other.tests !== undefined) this.ctx.tests = other.tests;
    if (other.security !== undefined) this.ctx.security = other.security;
    if (other.report !== undefined) this.ctx.report = other.report;
    if (other.artifacts) {
      this.ctx.artifacts.push(...other.artifacts);
    }
    if (other.metadata) {
      Object.assign(this.ctx.metadata, other.metadata);
    }
    if (other.agentOutputs) {
      other.agentOutputs.forEach((v, k) => {
        this.ctx.agentOutputs.set(k, v);
      });
    }
    if (other.sharedState) {
      Object.assign(this.ctx.sharedState, other.sharedState);
    }
  }

  /** Serialize the context to a JSON string. */
  toJSON(): string {
    const plain: Record<string, any> = {
      goal: this.ctx.goal,
      plan: this.ctx.plan,
      architecture: this.ctx.architecture,
      code: this.ctx.code,
      tests: this.ctx.tests,
      security: this.ctx.security,
      report: this.ctx.report,
      artifacts: this.ctx.artifacts,
      metadata: this.ctx.metadata,
      agentOutputs: Object.fromEntries(this.ctx.agentOutputs),
      sharedState: this.ctx.sharedState,
    };
    return JSON.stringify(plain, null, 2);
  }

  /** Deserialize a JSON string back into a ContextManager. */
  static fromJSON(json: string): ContextManager {
    const plain = JSON.parse(json);
    const cm = new ContextManager(plain.goal);
    cm.ctx.plan = plain.plan;
    cm.ctx.architecture = plain.architecture;
    cm.ctx.code = plain.code;
    cm.ctx.tests = plain.tests;
    cm.ctx.security = plain.security;
    cm.ctx.report = plain.report;
    cm.ctx.artifacts = plain.artifacts ?? [];
    cm.ctx.metadata = plain.metadata ?? {};
    cm.ctx.sharedState = plain.sharedState ?? {};
    if (plain.agentOutputs) {
      for (const [k, v] of Object.entries(plain.agentOutputs)) {
        cm.ctx.agentOutputs.set(k, v);
      }
    }
    return cm;
  }
}

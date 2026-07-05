/**
 * BOWO Agent Composition — Dynamic Agent Chains & Groups
 *
 * Inspired by LangGraph agent composition and AutoGen agent groups.
 * Provides:
 *   1. Agent chains (A → B → C)
 *   2. Conditional routing (branching)
 *   3. Agent loops (repeat until condition)
 *   4. Fan-out / fan-in (parallel split + merge)
 *   5. Agent groups with multiple execution strategies
 */

import type { BaseAgent, TaskInput, TaskResult } from "./agents/base.js";
import type { BowoMemory } from "./memory.js";
import type { Communication } from "./communication.js";

// ─── Interfaces ──────────────────────────────────────────

export interface ChainStep {
  /** Name of the agent to execute at this step */
  agentName: string;
  /** Optional mapping from accumulated context to this step's input */
  inputMapping?: (context: any) => any;
  /** Optional condition evaluated on the previous result; true = continue */
  condition?: (result: any) => boolean;
}

export interface AgentChain {
  id: string;
  name: string;
  steps: ChainStep[];
}

export type GroupStrategy = "sequential" | "parallel" | "voting" | "round-robin";

export interface AgentGroup {
  id: string;
  name: string;
  agents: string[];
  strategy: GroupStrategy;
}

export interface ChainResult {
  chainId: string;
  status: "completed" | "failed" | "partial";
  steps: { agent: string; result: any; duration: number }[];
  finalOutput: any;
  totalDuration: number;
}

/** A conditional branch stored inside a chain for dynamic routing */
interface ConditionalRoute {
  fromAgent: string;
  condition: (result: any) => boolean;
  trueAgent: string;
  falseAgent: string;
}

// ─── Helper ──────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── AgentComposer ───────────────────────────────────────

export class AgentComposer {
  private workflow: any;
  private memory: BowoMemory;
  private comm: Communication;

  private chains = new Map<string, AgentChain>();
  private groups = new Map<string, AgentGroup>();
  private routes = new Map<string, ConditionalRoute[]>();

  constructor(workflow: any, memory: any, comm: any) {
    this.workflow = workflow;
    this.memory = memory;
    this.comm = comm;
  }

  // ── Chain management ────────────────────────────────────

  /**
   * Create a new agent chain (pipeline).
   * Steps execute in order; each step's output feeds the next.
   */
  createChain(
    name: string,
    steps: { agentName: string; inputMapping?: (context: any) => any }[],
  ): AgentChain {
    const chain: AgentChain = {
      id: generateId("chain"),
      name,
      steps: steps.map((s) => ({
        agentName: s.agentName,
        inputMapping: s.inputMapping,
        condition: undefined,
      })),
    };
    this.chains.set(chain.id, chain);
    this.routes.set(chain.id, []);

    // Store creation event
    this.memory.store("chain_created" as any, "composer", {
      chainId: chain.id,
      name: chain.name,
      stepCount: chain.steps.length,
    });

    return chain;
  }

  /**
   * Retrieve a chain by its id.
   */
  getChain(id: string): AgentChain | undefined {
    return this.chains.get(id);
  }

  /**
   * List all registered chains.
   */
  listChains(): AgentChain[] {
    return Array.from(this.chains.values());
  }

  // ── Group management ────────────────────────────────────

  /**
   * Create an agent group with the given execution strategy.
   * Strategies: sequential | parallel | voting | round-robin
   */
  createGroup(
    name: string,
    agents: string[],
    strategy: string,
  ): AgentGroup {
    const group: AgentGroup = {
      id: generateId("group"),
      name,
      agents: [...agents],
      strategy: strategy as GroupStrategy,
    };
    this.groups.set(group.id, group);

    this.memory.store("group_created" as any, "composer", {
      groupId: group.id,
      name: group.name,
      strategy: group.strategy,
      agentCount: agents.length,
    });

    return group;
  }

  /**
   * Retrieve a group by its id.
   */
  getGroup(id: string): AgentGroup | undefined {
    return this.groups.get(id);
  }

  /**
   * List all registered groups.
   */
  listGroups(): AgentGroup[] {
    return Array.from(this.groups.values());
  }

  // ── Conditional routing ─────────────────────────────────

  /**
   * Add conditional routing to a chain.
   * After `fromAgent` finishes, if `condition(result)` is true,
   * execution jumps to `trueAgent`; otherwise to `falseAgent`.
   *
   * The agents must already exist as steps in the chain.
   * Dynamic routing is resolved at executeChain time.
   */
  addConditionalRouting(
    chainId: string,
    fromAgent: string,
    condition: (result: any) => boolean,
    trueAgent: string,
    falseAgent: string,
  ): void {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain ${chainId} not found`);
    }

    // Validate that referenced agents exist as steps in the chain
    const stepNames = chain.steps.map((s) => s.agentName);
    if (!stepNames.includes(fromAgent)) {
      throw new Error(
        `Agent "${fromAgent}" is not a step in chain "${chain.name}"`,
      );
    }
    if (!stepNames.includes(trueAgent)) {
      throw new Error(
        `Agent "${trueAgent}" is not a step in chain "${chain.name}"`,
      );
    }
    if (!stepNames.includes(falseAgent)) {
      throw new Error(
        `Agent "${falseAgent}" is not a step in chain "${chain.name}"`,
      );
    }

    const routeList = this.routes.get(chainId) ?? [];
    routeList.push({ fromAgent, condition, trueAgent, falseAgent });
    this.routes.set(chainId, routeList);
  }

  // ── Execute chain ───────────────────────────────────────

  /**
   * Execute a chain sequentially. Each step's output is passed to the
   * next step (optionally through inputMapping). Conditional routes
   * are resolved at runtime to determine which step runs next.
   */
  async executeChain(
    chain: AgentChain,
    initialInput: any,
  ): Promise<ChainResult> {
    const startTime = Date.now();
    const stepResults: ChainResult["steps"] = [];
    let currentInput: any = initialInput;
    let lastResult: any = null;

    // Build a quick lookup: agentName → step index
    const stepIndex = new Map<string, number>();
    chain.steps.forEach((s, i) => stepIndex.set(s.agentName, i));

    // Build conditional routing lookup: fromAgent → route
    const routeList = this.routes.get(chain.id) ?? [];
    const routeMap = new Map<string, ConditionalRoute>();
    for (const r of routeList) {
      routeMap.set(r.fromAgent, r);
    }

    let idx = 0;

    while (idx < chain.steps.length) {
      const step = chain.steps[idx];

      // Check if a condition on this step itself blocks execution
      if (step.condition && lastResult !== null && !step.condition(lastResult)) {
        break; // step condition not met — end chain early
      }

      const stepStart = Date.now();

      try {
        // Resolve input via mapping or fall back to previous output / initial input
        const stepInput = step.inputMapping
          ? step.inputMapping({ previous: lastResult, initial: currentInput, context: currentInput })
          : lastResult !== null
            ? lastResult
            : currentInput;

        const result = await this.runAgent(step.agentName, stepInput);
        const duration = Date.now() - stepStart;

        stepResults.push({ agent: step.agentName, result, duration });

        lastResult = result;

        // Emit progress event
        this.comm.send("result" as any, step.agentName, "composer", {
          chainId: chain.id,
          stepIndex: idx,
          result,
        });

        // Resolve conditional routing for this step
        const route = routeMap.get(step.agentName);
        if (route) {
          const target = route.condition(result) ? route.trueAgent : route.falseAgent;
          const targetIdx = stepIndex.get(target);
          if (targetIdx !== undefined) {
            idx = targetIdx;
            continue;
          }
        }

        idx++;
      } catch (err) {
        const duration = Date.now() - stepStart;
        stepResults.push({
          agent: step.agentName,
          result: { error: (err as Error).message },
          duration,
        });

        return {
          chainId: chain.id,
          status: "failed",
          steps: stepResults,
          finalOutput: null,
          totalDuration: Date.now() - startTime,
        };
      }
    }

    return {
      chainId: chain.id,
      status: "completed",
      steps: stepResults,
      finalOutput: lastResult,
      totalDuration: Date.now() - startTime,
    };
  }

  // ── Execute group ───────────────────────────────────────

  /**
   * Execute all agents in a group according to the chosen strategy.
   */
  async executeGroup(group: AgentGroup, input: any): Promise<any> {
    switch (group.strategy) {
      case "sequential":
        return this.executeGroupSequential(group, input);
      case "parallel":
        return this.executeGroupParallel(group, input);
      case "voting":
        return this.executeGroupVoting(group, input);
      case "round-robin":
        return this.executeGroupRoundRobin(group, input);
      default:
        throw new Error(`Unknown group strategy: ${group.strategy}`);
    }
  }

  // ── Private helpers ─────────────────────────────────────

  /**
   * Resolve an agent name to a BaseAgent instance via the workflow,
   * then execute a task.
   */
  private async runAgent(agentName: string, input: any): Promise<TaskResult> {
    // Try to get the agent from the workflow
    const agent = this.resolveAgent(agentName);

    if (!agent) {
      throw new Error(
        `Agent "${agentName}" not found in workflow. ` +
          `Available agents must be registered.`,
      );
    }

    const taskInput: TaskInput = {
      taskId: generateId("task"),
      goal: typeof input === "string" ? input : JSON.stringify(input),
      context: typeof input === "object" && input !== null ? input : {},
    };

    return agent.execute(taskInput);
  }

  /**
   * Resolve an agent name from the workflow registry.
   */
  private resolveAgent(name: string): BaseAgent | null {
    if (!this.workflow) return null;

    // Common patterns: workflow.agents[name], workflow.getAgent(name), etc.
    if (typeof this.workflow.getAgent === "function") {
      return this.workflow.getAgent(name);
    }
    if (this.workflow.agents && typeof this.workflow.agents === "object") {
      const agent = this.workflow.agents[name];
      if (agent) return agent;
    }
    if (this.workflow.registry && typeof this.workflow.registry === "object") {
      const agent = this.workflow.registry[name];
      if (agent) return agent;
    }

    return null;
  }

  // ── Strategy implementations ────────────────────────────

  /**
   * Sequential: run agents one after another, feeding each output
   * to the next.
   */
  private async executeGroupSequential(
    group: AgentGroup,
    input: any,
  ): Promise<any[]> {
    const results: any[] = [];
    let current: any = input;

    for (const agentName of group.agents) {
      try {
        const result = await this.runAgent(agentName, current);
        results.push({ agent: agentName, result });
        current = result; // feed forward
      } catch (err) {
        results.push({ agent: agentName, error: (err as Error).message });
      }
    }

    return results;
  }

  /**
   * Parallel: run all agents concurrently with Promise.allSettled.
   */
  private async executeGroupParallel(
    group: AgentGroup,
    input: any,
  ): Promise<any[]> {
    const promises = group.agents.map(async (agentName) => {
      try {
        const result = await this.runAgent(agentName, input);
        return { status: "fulfilled" as const, agent: agentName, result };
      } catch (err) {
        return {
          status: "rejected" as const,
          agent: agentName,
          error: (err as Error).message,
        };
      }
    });

    const settled = await Promise.allSettled(promises);
    return settled.map((s) => (s.status === "fulfilled" ? s.value : s.reason));
  }

  /**
   * Voting: run all agents in parallel and return the majority result.
   * Results are stringified and compared; the most common one wins.
   */
  private async executeGroupVoting(
    group: AgentGroup,
    input: any,
  ): Promise<{ winner: any; votes: Record<string, number>; allResults: any[] }> {
    const allResults = await this.executeGroupParallel(group, input);

    // Count votes by serializing results
    const votes = new Map<string, { count: number; payload: any }>();
    for (const r of allResults) {
      const key = typeof r.result === "string"
        ? r.result
        : JSON.stringify(r.result ?? r.error ?? "unknown");
      const existing = votes.get(key);
      if (existing) {
        existing.count++;
      } else {
        votes.set(key, { count: 1, payload: r });
      }
    }

    // Find winner
    let winner: any = null;
    let maxVotes = 0;
    const voteRecord: Record<string, number> = {};

    for (const [key, { count, payload }] of Array.from(votes.entries())) {
      voteRecord[key] = count;
      if (count > maxVotes) {
        maxVotes = count;
        winner = payload;
      }
    }

    return { winner: winner?.result ?? null, votes: voteRecord, allResults };
  }

  /**
   * Round-robin: run all agents and pick the best result
   * (shortest duration = fastest, as a heuristic for "best").
   * If durations are unavailable, returns the first successful result.
   */
  private async executeGroupRoundRobin(
    group: AgentGroup,
    input: any,
  ): Promise<{ best: any; rankings: any[] }> {
    const start = Date.now();
    const rankings: { agent: string; result: any; duration: number }[] = [];

    for (const agentName of group.agents) {
      const agentStart = Date.now();
      try {
        const result = await this.runAgent(agentName, input);
        rankings.push({
          agent: agentName,
          result,
          duration: Date.now() - agentStart,
        });
      } catch (err) {
        rankings.push({
          agent: agentName,
          result: { error: (err as Error).message },
          duration: Date.now() - agentStart,
        });
      }
    }

    // Sort by duration (fastest first), then by error-free status
    rankings.sort((a, b) => {
      const aHasError = a.result && a.result.error;
      const bHasError = b.result && b.result.error;
      if (aHasError && !bHasError) return 1;
      if (!aHasError && bHasError) return -1;
      return a.duration - b.duration;
    });

    return {
      best: rankings[0]?.result ?? null,
      rankings,
    };
  }
}

/**
 * 🎯 BOWO Supervisor Agent
 *
 * Supervisor agent pattern inspired by AutoGen.
 * Decides which agent should execute next based on the current
 * pipeline state and history of agent outputs.
 */

// ─── Types ──

export interface SupervisorDecision {
  nextAgent: string;
  reason: string;
  context: any;
  done: boolean;
}

export interface SupervisorConfig {
  /** Maximum number of decision rounds before forced stop. Default: 20 */
  maxRounds?: number;
  /** Restrict which agents may be selected. Omit for all agents. */
  allowedAgents?: string[];
}

// ─── SupervisorAgent ──

export class SupervisorAgent {
  private config: SupervisorConfig;
  private decisions: SupervisorDecision[] = [];
  private roundCount: number = 0;

  constructor(config?: SupervisorConfig) {
    this.config = {
      maxRounds: config?.maxRounds ?? 20,
      allowedAgents: config?.allowedAgents,
    };
  }

  /**
   * Analyze the current context and execution history to decide which
   * agent should run next (or whether the pipeline is done).
   *
   * Heuristic decision tree:
   *   1. No plan           → planner
   *   2. Plan, no design   → architect
   *   3. Design, no code   → backend / frontend
   *   4. Code, no tests    → qa
   *   5. Tests pass        → reporter
   */
  async decide(
    context: any,
    history: { agent: string; result: any }[],
  ): Promise<SupervisorDecision> {
    this.roundCount++;

    // Guard against infinite loops
    if (this.roundCount >= (this.config.maxRounds ?? 20)) {
      const decision: SupervisorDecision = {
        nextAgent: "reporter",
        reason: `Max rounds (${this.config.maxRounds}) reached — generating final report`,
        context,
        done: false,
      };
      this.decisions.push(decision);
      return decision;
    }

    const hasPlan = Boolean(context.plan);
    const hasDesign = Boolean(context.architecture);
    const hasBackend = Boolean(context.code?.backend);
    const hasFrontend = Boolean(context.code?.frontend);
    const hasCode = hasBackend || hasFrontend;
    const hasTests = Boolean(context.tests);
    const testsPassed = hasTests && context.tests?.passed === true;
    const hasReport = Boolean(context.report);

    // Check history to see which agents already ran
    const agentSet = new Set(history.map((h) => h.agent));

    let decision: SupervisorDecision;

    if (!hasPlan) {
      decision = this.buildDecision("planner", "No plan yet — starting with planning", context);
    } else if (!hasDesign) {
      decision = this.buildDecision("architect", "Plan exists but no architecture design yet", context);
    } else if (!hasBackend) {
      decision = this.buildDecision("backend", "Architecture ready — implementing backend", context);
    } else if (!hasFrontend) {
      decision = this.buildDecision("frontend", "Backend implemented — now building frontend", context);
    } else if (!hasTests) {
      decision = this.buildDecision("qa", "Code complete — running QA and tests", context);
    } else if (testsPassed && hasReport) {
      decision = this.buildDecision("reporter", "All done — pipeline complete", context);
      decision.done = true;
    } else if (testsPassed && !hasReport) {
      decision = this.buildDecision("reporter", "Tests passed — generating final report", context);
    } else {
      // Tests didn't pass or unexpected state — ask for security review or fix
      if (!agentSet.has("security") && !hasReport) {
        decision = this.buildDecision("security", "Running security audit before final report", context);
      } else {
        decision = this.buildDecision("reporter", "All agents exhausted — producing report with current state", context);
        decision.done = true;
      }
    }

    // Enforce allowed agents restriction
    if (
      this.config.allowedAgents &&
      this.config.allowedAgents.length > 0 &&
      !this.config.allowedAgents.includes(decision.nextAgent)
    ) {
      // Fall back to reporter
      decision = this.buildDecision(
        "reporter",
        `Agent "${decision.nextAgent}" not in allowed list — defaulting to reporter`,
        context,
      );
      decision.done = true;
    }

    this.decisions.push(decision);
    return decision;
  }

  /** Check whether the pipeline should continue running. */
  async shouldContinue(history: { agent: string; result: any }[]): Promise<boolean> {
    // If we've exceeded max rounds, stop
    if (this.roundCount >= (this.config.maxRounds ?? 20)) {
      return false;
    }

    // If the last decision was done, stop
    const lastDecision = this.decisions[this.decisions.length - 1];
    if (lastDecision?.done) {
      return false;
    }

    // If a reporter already ran and produced output, stop
    const lastAgent = history[history.length - 1]?.agent;
    if (lastAgent === "reporter") {
      return false;
    }

    return true;
  }

  /** Return the full history of decisions made by this supervisor. */
  getHistory(): SupervisorDecision[] {
    return [...this.decisions];
  }

  // ─── Internal ──

  private buildDecision(
    nextAgent: string,
    reason: string,
    context: any,
  ): SupervisorDecision {
    return {
      nextAgent,
      reason,
      context,
      done: false,
    };
  }
}

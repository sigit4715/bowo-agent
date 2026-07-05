/**
 * BOWO Cost Tracker — Token & Cost Accounting
 *
 * Tracks token usage and estimated costs per agent, per pipeline, and
 * globally. Supports budget limits with hard and soft thresholds.
 */

import { EventEmitter } from "node:events";
import type { TaskResult } from "./agents/base.js";

// ─── Types ──────────────────────────────────────────────

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface CostPerToken {
  /** Cost per 1000 prompt tokens (USD) */
  promptCostPer1k: number;
  /** Cost per 1000 completion tokens (USD) */
  completionCostPer1k: number;
}

export interface BudgetLimit {
  /** Maximum tokens allowed (0 = no limit) */
  maxTokens?: number;
  /** Maximum cost in USD allowed (0 = no limit) */
  maxCostUsd?: number;
  /** Action when budget exceeded: "stop" throws, "warn" logs and continues, "throttle" reduces concurrency */
  onExceed?: "stop" | "warn" | "throttle";
}

export interface AgentUsageRecord {
  agentName: string;
  tokens: TokenUsage;
  costUsd: number;
  taskCount: number;
  lastUsedAt: string;
}

export interface PipelineUsageRecord {
  pipelineId: string;
  pipelineName: string;
  tokens: TokenUsage;
  costUsd: number;
  agentBreakdown: Record<string, AgentUsageRecord>;
  startedAt: string;
  completedAt?: string;
}

export interface BudgetStatus {
  /** Current token consumption */
  currentTokens: number;
  /** Current cost in USD */
  currentCostUsd: number;
  /** Token limit (0 = unlimited) */
  tokenLimit: number;
  /** Cost limit (0 = unlimited) */
  costLimitUsd: number;
  /** Token budget used as percentage */
  tokenUsagePercent: number;
  /** Cost budget used as percentage */
  costUsagePercent: number;
  /** Has any budget been exceeded? */
  exceeded: boolean;
  /** Which budgets are exceeded */
  exceededBudgets: string[];
}

export interface UsageReport {
  /** Overall totals */
  total: AgentUsageRecord;
  /** Per-agent breakdown */
  byAgent: Record<string, AgentUsageRecord>;
  /** Per-pipeline breakdown */
  byPipeline: Record<string, PipelineUsageRecord>;
  /** Current budget status */
  budget: BudgetStatus;
  /** Report generated at */
  generatedAt: string;
}

export interface CostTrackerConfig {
  /** Model pricing for cost estimation */
  pricing?: CostPerToken;
  /** Optional budget limits */
  budget?: BudgetLimit;
}

// ─── Default Pricing (approximate GPT-4 class) ──────────

const DEFAULT_PRICING: CostPerToken = {
  promptCostPer1k: 0.03,       // $30/1M tokens
  completionCostPer1k: 0.06,   // $60/1M tokens
};

// ─── CostTracker ────────────────────────────────────────

export class CostTracker extends EventEmitter {
  private pricing: CostPerToken;
  private budget: BudgetLimit;

  /** Agent-level tracking */
  private agentRecords: Map<string, AgentUsageRecord> = new Map();

  /** Pipeline-level tracking */
  private pipelineRecords: Map<string, PipelineUsageRecord> = new Map();

  /** Global counters */
  private globalTokens: TokenUsage = { prompt: 0, completion: 0, total: 0 };
  private globalCostUsd = 0;

  constructor(config: CostTrackerConfig = {}) {
    super();
    this.pricing = { ...DEFAULT_PRICING, ...config.pricing };
    this.budget = {
      maxTokens: config.budget?.maxTokens ?? 0,
      maxCostUsd: config.budget?.maxCostUsd ?? 0,
      onExceed: config.budget?.onExceed ?? "warn",
    };
  }

  // ── Recording ──────────────────────────────────────

  /**
   * Record token usage for a completed task.
   * Returns estimated cost in USD.
   */
  recordTaskUsage(agentName: string, result: TaskResult): number {
    const tokenCount = result.tokens ?? 0;

    // If we only have the total, estimate the split (70/30 prompt/completion)
    const usage: TokenUsage =
      tokenCount > 0
        ? {
            prompt: Math.round(tokenCount * 0.7),
            completion: Math.round(tokenCount * 0.3),
            total: tokenCount,
          }
        : { prompt: 0, completion: 0, total: 0 };

    const costUsd = this.calculateCost(usage);

    // Update agent record
    const existing = this.agentRecords.get(agentName);
    if (existing) {
      existing.tokens.prompt += usage.prompt;
      existing.tokens.completion += usage.completion;
      existing.tokens.total += usage.total;
      existing.costUsd += costUsd;
      existing.taskCount++;
      existing.lastUsedAt = new Date().toISOString();
    } else {
      this.agentRecords.set(agentName, {
        agentName,
        tokens: { ...usage },
        costUsd,
        taskCount: 1,
        lastUsedAt: new Date().toISOString(),
      });
    }

    // Update global counters
    this.globalTokens.prompt += usage.prompt;
    this.globalTokens.completion += usage.completion;
    this.globalTokens.total += usage.total;
    this.globalCostUsd += costUsd;

    this.emit("usage:recorded", { agentName, usage, costUsd });

    // Check budget
    this.checkBudget();

    return costUsd;
  }

  /**
   * Record detailed token usage (when prompt/completion breakdown is available).
   */
  recordDetailedUsage(
    agentName: string,
    usage: TokenUsage,
    pipelineId?: string
  ): number {
    const costUsd = this.calculateCost(usage);

    // Agent tracking
    const existing = this.agentRecords.get(agentName);
    if (existing) {
      existing.tokens.prompt += usage.prompt;
      existing.tokens.completion += usage.completion;
      existing.tokens.total += usage.total;
      existing.costUsd += costUsd;
      existing.taskCount++;
      existing.lastUsedAt = new Date().toISOString();
    } else {
      this.agentRecords.set(agentName, {
        agentName,
        tokens: { ...usage },
        costUsd,
        taskCount: 1,
        lastUsedAt: new Date().toISOString(),
      });
    }

    // Pipeline tracking
    if (pipelineId) {
      this.recordPipelineUsage(pipelineId, agentName, usage, costUsd);
    }

    // Global
    this.globalTokens.prompt += usage.prompt;
    this.globalTokens.completion += usage.completion;
    this.globalTokens.total += usage.total;
    this.globalCostUsd += costUsd;

    this.emit("usage:recorded", { agentName, usage, costUsd, pipelineId });
    this.checkBudget();

    return costUsd;
  }

  /**
   * Start tracking a new pipeline.
   */
  startPipeline(pipelineId: string, pipelineName: string): void {
    this.pipelineRecords.set(pipelineId, {
      pipelineId,
      pipelineName,
      tokens: { prompt: 0, completion: 0, total: 0 },
      costUsd: 0,
      agentBreakdown: {},
      startedAt: new Date().toISOString(),
    });
  }

  /**
   * Mark a pipeline as completed.
   */
  completePipeline(pipelineId: string): void {
    const record = this.pipelineRecords.get(pipelineId);
    if (record) {
      record.completedAt = new Date().toISOString();
    }
  }

  /**
   * Get a pipeline record.
   */
  getPipeline(pipelineId: string): PipelineUsageRecord | undefined {
    return this.pipelineRecords.get(pipelineId);
  }

  // ── Budget ─────────────────────────────────────────

  /**
   * Set or update budget limits at runtime.
   */
  setBudget(budget: BudgetLimit): void {
    this.budget = { ...this.budget, ...budget };
    this.emit("budget:updated", this.budget);
  }

  /**
   * Get the current budget status.
   */
  getBudgetStatus(): BudgetStatus {
    const maxTokens = this.budget.maxTokens ?? 0;
    const maxCost = this.budget.maxCostUsd ?? 0;

    const tokenPercent = maxTokens > 0 ? (this.globalTokens.total / maxTokens) * 100 : 0;
    const costPercent = maxCost > 0 ? (this.globalCostUsd / maxCost) * 100 : 0;

    const exceededBudgets: string[] = [];
    if (maxTokens > 0 && this.globalTokens.total >= maxTokens) exceededBudgets.push("tokens");
    if (maxCost > 0 && this.globalCostUsd >= maxCost) exceededBudgets.push("cost");

    return {
      currentTokens: this.globalTokens.total,
      currentCostUsd: this.globalCostUsd,
      tokenLimit: maxTokens,
      costLimitUsd: maxCost,
      tokenUsagePercent: Math.round(tokenPercent * 100) / 100,
      costUsagePercent: Math.round(costPercent * 100) / 100,
      exceeded: exceededBudgets.length > 0,
      exceededBudgets,
    };
  }

  /**
   * Check budget and emit warnings or throw based on config.
   * Returns true if execution should continue, false if stopped.
   */
  private checkBudget(): boolean {
    const status = this.getBudgetStatus();
    if (!status.exceeded) return true;

    const action = this.budget.onExceed ?? "warn";

    this.emit("budget:exceeded", status);

    if (action === "stop") {
      throw new Error(
        `Budget exceeded: ${status.exceededBudgets.join(", ")} ` +
        `(${status.currentTokens} tokens, $${status.currentCostUsd.toFixed(4)})`
      );
    }

    if (action === "warn") {
      console.warn(
        `⚠️  Budget warning: ${status.exceededBudgets.join(", ")} exceeded ` +
        `(${status.currentTokens} tokens, $${status.currentCostUsd.toFixed(4)})`
      );
    }

    return true; // "throttle" or "warn" — continue execution
  }

  // ── Cost Calculation ───────────────────────────────

  /**
   * Calculate cost in USD for a given token usage.
   */
  calculateCost(usage: TokenUsage): number {
    return (
      (usage.prompt / 1000) * this.pricing.promptCostPer1k +
      (usage.completion / 1000) * this.pricing.completionCostPer1k
    );
  }

  /**
   * Update pricing at runtime (e.g., model switch).
   */
  setPricing(pricing: Partial<CostPerToken>): void {
    this.pricing = { ...this.pricing, ...pricing };
    this.emit("pricing:updated", this.pricing);
  }

  // ── Reporting ──────────────────────────────────────

  /**
   * Generate a full usage report.
   */
  generateReport(): UsageReport {
    const byAgent: Record<string, AgentUsageRecord> = {};
    for (const [name, record] of this.agentRecords) {
      byAgent[name] = { ...record, tokens: { ...record.tokens } };
    }

    const byPipeline: Record<string, PipelineUsageRecord> = {};
    for (const [id, record] of this.pipelineRecords) {
      byPipeline[id] = {
        ...record,
        tokens: { ...record.tokens },
        agentBreakdown: Object.fromEntries(
          Object.entries(record.agentBreakdown).map(([k, v]) => [k, { ...v, tokens: { ...v.tokens } }])
        ),
      };
    }

    return {
      total: {
        agentName: "(all)",
        tokens: { ...this.globalTokens },
        costUsd: this.globalCostUsd,
        taskCount: Array.from(this.agentRecords.values()).reduce((s, r) => s + r.taskCount, 0),
        lastUsedAt: new Date().toISOString(),
      },
      byAgent,
      byPipeline,
      budget: this.getBudgetStatus(),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get a human-readable summary string.
   */
  getSummary(): string {
    const report = this.generateReport();
    const budget = report.budget;

    const lines = [
      `💰 Cost Tracker Summary`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `Total Tokens: ${report.total.tokens.total.toLocaleString()} ($${report.total.costUsd.toFixed(4)})`,
      `  Prompt:     ${report.total.tokens.prompt.toLocaleString()}`,
      `  Completion: ${report.total.tokens.completion.toLocaleString()}`,
      `  Tasks:      ${report.total.taskCount}`,
    ];

    if (budget.tokenLimit > 0 || budget.costLimitUsd > 0) {
      lines.push(``);
      lines.push(`Budget:`);
      if (budget.tokenLimit > 0) {
        lines.push(`  Tokens: ${budget.tokenUsagePercent}% of ${budget.tokenLimit.toLocaleString()}`);
      }
      if (budget.costLimitUsd > 0) {
        lines.push(`  Cost:   ${budget.costUsagePercent}% of $${budget.costLimitUsd.toFixed(2)}`);
      }
      if (budget.exceeded) {
        lines.push(`  ⚠️  EXCEEDED: ${budget.exceededBudgets.join(", ")}`);
      }
    }

    if (Object.keys(report.byAgent).length > 0) {
      lines.push(``);
      lines.push(`Per Agent:`);
      const sorted = Object.values(report.byAgent).sort((a, b) => b.costUsd - a.costUsd);
      for (const agent of sorted) {
        lines.push(
          `  ${agent.agentName}: ${agent.tokens.total.toLocaleString()} tokens ` +
          `($${agent.costUsd.toFixed(4)}) — ${agent.taskCount} tasks`
        );
      }
    }

    return lines.join("\n");
  }

  /**
   * Get agent-level usage record.
   */
  getAgentUsage(agentName: string): AgentUsageRecord | undefined {
    const record = this.agentRecords.get(agentName);
    if (record) {
      return { ...record, tokens: { ...record.tokens } };
    }
    return undefined;
  }

  /**
   * Get all agent usage records.
   */
  getAllAgentUsage(): AgentUsageRecord[] {
    return Array.from(this.agentRecords.values()).map((r) => ({
      ...r,
      tokens: { ...r.tokens },
    }));
  }

  /**
   * Get global token usage.
   */
  getGlobalUsage(): TokenUsage & { costUsd: number } {
    return {
      ...this.globalTokens,
      costUsd: this.globalCostUsd,
    };
  }

  /**
   * Reset all tracking data.
   */
  reset(): void {
    this.agentRecords.clear();
    this.pipelineRecords.clear();
    this.globalTokens = { prompt: 0, completion: 0, total: 0 };
    this.globalCostUsd = 0;
    this.emit("tracker:reset");
  }

  // ── Private Helpers ────────────────────────────────

  private recordPipelineUsage(
    pipelineId: string,
    agentName: string,
    usage: TokenUsage,
    costUsd: number
  ): void {
    const record = this.pipelineRecords.get(pipelineId);
    if (!record) return;

    record.tokens.prompt += usage.prompt;
    record.tokens.completion += usage.completion;
    record.tokens.total += usage.total;
    record.costUsd += costUsd;

    const existing = record.agentBreakdown[agentName];
    if (existing) {
      existing.tokens.prompt += usage.prompt;
      existing.tokens.completion += usage.completion;
      existing.tokens.total += usage.total;
      existing.costUsd += costUsd;
      existing.taskCount++;
      existing.lastUsedAt = new Date().toISOString();
    } else {
      record.agentBreakdown[agentName] = {
        agentName,
        tokens: { ...usage },
        costUsd,
        taskCount: 1,
        lastUsedAt: new Date().toISOString(),
      };
    }
  }
}

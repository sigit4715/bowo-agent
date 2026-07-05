/**
 * BOWO Monitoring — Dashboard Data Collector
 *
 * Aggregates pipeline metrics (success rate, average duration, token usage,
 * agent performance) and outputs structured JSON for dashboard consumption.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { PipelineStatus, type Pipeline, type PipelineStep } from "./workflow.js";

// ─── Types ──────────────────────────────────────────────

export interface PipelineRunRecord {
  pipelineId: string;
  pipelineName: string;
  goal: string;
  status: PipelineStatus;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  durationMs: number;
  totalTokens: number;
  totalArtifacts: number;
  agentBreakdown: AgentRunRecord[];
  startedAt: string;
  completedAt: string;
}

export interface AgentRunRecord {
  agentName: string;
  status: string;
  durationMs: number;
  tokens: number;
  artifacts: number;
  error?: string;
}

export interface AgentPerformance {
  agentName: string;
  totalRuns: number;
  successCount: number;
  failCount: number;
  successRate: number;
  avgDurationMs: number;
  totalTokens: number;
  totalArtifacts: number;
}

export interface AggregatedMetrics {
  totalPipelines: number;
  successCount: number;
  failCount: number;
  partialCount: number;
  successRate: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  totalTokens: number;
  avgTokensPerPipeline: number;
  totalArtifacts: number;
  agentPerformance: AgentPerformance[];
  lastRunAt: string | null;
}

export interface MonitoringSnapshot {
  metrics: AggregatedMetrics;
  recentRuns: PipelineRunRecord[];
  generatedAt: string;
}

// ─── Constants ──────────────────────────────────────────

const DEFAULT_OUTPUT_DIR = "output/monitoring";
const MAX_RECENT_RUNS = 50;

// ─── Monitoring Collector ───────────────────────────────

export class MonitoringCollector {
  private outputDir: string;
  private records: PipelineRunRecord[];
  private counter: number;

  constructor(outputDir: string = DEFAULT_OUTPUT_DIR) {
    this.outputDir = outputDir;
    this.counter = 0;
    fs.mkdirSync(this.outputDir, { recursive: true });
    this.records = this.loadRecords();
  }

  // ── Recording ──

  /**
   * Record a completed pipeline run. Extracts metrics from the pipeline.
   */
  recordPipelineRun(
    pipeline: Pipeline,
    goal: string,
    durationMs: number
  ): PipelineRunRecord {
    const completedSteps = pipeline.steps.filter(
      (s) => s.status === "completed"
    ).length;
    const failedSteps = pipeline.steps.filter(
      (s) => s.status === "failed"
    ).length;
    const skippedSteps = pipeline.steps.filter(
      (s) => s.status === "skipped"
    ).length;

    const totalTokens = pipeline.steps.reduce(
      (sum, s) => sum + (s.result?.tokenUsage?.total ?? 0),
      0
    );

    const totalArtifacts = pipeline.steps.reduce(
      (sum, s) => sum + (s.result?.artifacts.length ?? 0),
      0
    );

    const agentBreakdown: AgentRunRecord[] = pipeline.steps
      .filter((s) => s.result)
      .map((s) => ({
        agentName: s.agentName,
        status: s.result!.status,
        durationMs: s.result!.duration,
        tokens: s.result!.tokenUsage?.total ?? 0,
        artifacts: s.result!.artifacts.length,
        error: s.result!.error,
      }));

    const record: PipelineRunRecord = {
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      goal,
      status: pipeline.status,
      totalSteps: pipeline.steps.length,
      completedSteps,
      failedSteps,
      skippedSteps,
      durationMs,
      totalTokens,
      totalArtifacts,
      agentBreakdown,
      startedAt: pipeline.createdAt,
      completedAt: pipeline.completedAt ?? new Date().toISOString(),
    };

    this.records.push(record);
    this.saveRecords();
    return record;
  }

  // ── Metrics Aggregation ──

  /**
   * Compute aggregated metrics across all recorded pipeline runs.
   */
  getAggregatedMetrics(): AggregatedMetrics {
    const runs = this.records;
    const totalPipelines = runs.length;

    if (totalPipelines === 0) {
      return this.emptyMetrics();
    }

    const successCount = runs.filter(
      (r) => r.status === PipelineStatus.COMPLETED
    ).length;
    const failCount = runs.filter(
      (r) => r.status === PipelineStatus.FAILED
    ).length;
    const partialCount = totalPipelines - successCount - failCount;

    const successRate =
      totalPipelines > 0 ? (successCount / totalPipelines) * 100 : 0;

    const durations = runs.map((r) => r.durationMs).filter((d) => d > 0);
    const avgDurationMs =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;
    const minDurationMs = durations.length > 0 ? Math.min(...durations) : 0;
    const maxDurationMs = durations.length > 0 ? Math.max(...durations) : 0;

    const totalTokens = runs.reduce((sum, r) => sum + r.totalTokens, 0);
    const avgTokensPerPipeline =
      totalPipelines > 0 ? totalTokens / totalPipelines : 0;

    const totalArtifacts = runs.reduce(
      (sum, r) => sum + r.totalArtifacts,
      0
    );

    const agentPerformance = this.computeAgentPerformance();

    const sortedRuns = [...runs].sort(
      (a, b) =>
        new Date(b.completedAt).getTime() -
        new Date(a.completedAt).getTime()
    );
    const lastRunAt = sortedRuns.length > 0 ? sortedRuns[0].completedAt : null;

    return {
      totalPipelines,
      successCount,
      failCount,
      partialCount,
      successRate: Math.round(successRate * 100) / 100,
      avgDurationMs: Math.round(avgDurationMs),
      minDurationMs,
      maxDurationMs,
      totalTokens,
      avgTokensPerPipeline: Math.round(avgTokensPerPipeline),
      totalArtifacts,
      agentPerformance,
      lastRunAt,
    };
  }

  /**
   * Get a full monitoring snapshot (metrics + recent runs).
   */
  getSnapshot(maxRecentRuns: number = 10): MonitoringSnapshot {
    const metrics = this.getAggregatedMetrics();
    const recentRuns = [...this.records]
      .sort(
        (a, b) =>
          new Date(b.completedAt).getTime() -
          new Date(a.completedAt).getTime()
      )
      .slice(0, maxRecentRuns);

    return {
      metrics,
      recentRuns,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get performance metrics for a specific agent.
   */
  getAgentMetrics(agentName: string): AgentPerformance | null {
    const performance = this.computeAgentPerformance();
    return performance.find((p) => p.agentName === agentName) ?? null;
  }

  // ── Persistence / Output ──

  /**
   * Export the full monitoring snapshot to a JSON file.
   */
  exportToJson(filename: string = "monitoring-snapshot.json"): string {
    const snapshot = this.getSnapshot(MAX_RECENT_RUNS);
    const filePath = path.join(this.outputDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
    return filePath;
  }

  /**
   * Export just the aggregated metrics to JSON.
   */
  exportMetricsJson(filename: string = "metrics.json"): string {
    const metrics = this.getAggregatedMetrics();
    const filePath = path.join(this.outputDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(metrics, null, 2), "utf-8");
    return filePath;
  }

  /**
   * Load historical records from disk (called automatically on construction).
   */
  loadFromDisk(): void {
    this.records = this.loadRecords();
  }

  /**
   * Get all recorded pipeline runs.
   */
  getAllRuns(): PipelineRunRecord[] {
    return [...this.records];
  }

  /**
   * Get the N most recent runs.
   */
  getRecentRuns(n: number = 10): PipelineRunRecord[] {
    return [...this.records]
      .sort(
        (a, b) =>
          new Date(b.completedAt).getTime() -
          new Date(a.completedAt).getTime()
      )
      .slice(0, n);
  }

  /**
   * Get runs within a time range.
   */
  getRunsInRange(start: Date, end: Date): PipelineRunRecord[] {
    return this.records.filter((r) => {
      const completed = new Date(r.completedAt);
      return completed >= start && completed <= end;
    });
  }

  /**
   * Clear all recorded data.
   */
  clear(): void {
    this.records = [];
    this.counter = 0;
    const recordsPath = path.join(this.outputDir, "records.json");
    if (fs.existsSync(recordsPath)) {
      fs.unlinkSync(recordsPath);
    }
  }

  // ── Internal Helpers ──

  private computeAgentPerformance(): AgentPerformance[] {
    const agentMap: Record<string, AgentRunRecord[]> = {};

    for (const run of this.records) {
      for (const agent of run.agentBreakdown) {
        if (!agentMap[agent.agentName]) {
          agentMap[agent.agentName] = [];
        }
        agentMap[agent.agentName].push(agent);
      }
    }

    const performances: AgentPerformance[] = [];

    for (const [agentName, runs] of Object.entries(agentMap)) {
      const totalRuns = runs.length;
      const successCount = runs.filter((r) => r.status === "completed").length;
      const failCount = runs.filter((r) => r.status === "failed").length;
      const successRate =
        totalRuns > 0 ? (successCount / totalRuns) * 100 : 0;

      const durations = runs.map((r) => r.durationMs).filter((d) => d > 0);
      const avgDurationMs =
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0;

      const totalTokens = runs.reduce((sum, r) => sum + r.tokens, 0);
      const totalArtifacts = runs.reduce((sum, r) => sum + r.artifacts, 0);

      performances.push({
        agentName,
        totalRuns,
        successCount,
        failCount,
        successRate: Math.round(successRate * 100) / 100,
        avgDurationMs: Math.round(avgDurationMs),
        totalTokens,
        totalArtifacts,
      });
    }

    // Sort by total runs descending
    return performances.sort((a, b) => b.totalRuns - a.totalRuns);
  }

  private emptyMetrics(): AggregatedMetrics {
    return {
      totalPipelines: 0,
      successCount: 0,
      failCount: 0,
      partialCount: 0,
      successRate: 0,
      avgDurationMs: 0,
      minDurationMs: 0,
      maxDurationMs: 0,
      totalTokens: 0,
      avgTokensPerPipeline: 0,
      totalArtifacts: 0,
      agentPerformance: [],
      lastRunAt: null,
    };
  }

  private recordsPath(): string {
    return path.join(this.outputDir, "records.json");
  }

  private loadRecords(): PipelineRunRecord[] {
    const filePath = this.recordsPath();
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const data = JSON.parse(raw) as PipelineRunRecord[];
        this.counter = data.length;
        return data;
      } catch {
        return [];
      }
    }
    return [];
  }

  private saveRecords(): void {
    const filePath = this.recordsPath();
    fs.writeFileSync(filePath, JSON.stringify(this.records, null, 2), "utf-8");
  }
}

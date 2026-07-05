/**
 * BOWO Memory — Shared Project Memory System
 *
 * All agents share this memory to maintain context across the pipeline.
 * Memory stores: decisions, artifacts, errors, learnings, and state.
 */

import fs from "node:fs";
import path from "node:path";

// ─── Types ──────────────────────────────────────────────

export enum MemoryType {
  DECISION = "decision",
  ARTIFACT = "artifact",
  ERROR = "error",
  LEARNING = "learning",
  STATE = "state",
  TASK = "task",
  RESULT = "result",
}

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  agent: string;
  content: unknown;
  timestamp: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

export interface MemorySummary {
  totalEntries: number;
  byType: Record<string, number>;
  byAgent: Record<string, number>;
  lastUpdated: string | null;
}

// ─── Memory Class ───────────────────────────────────────

export class BowoMemory {
  private entries: MemoryEntry[] = [];
  private counter = 0;
  private storagePath: string;

  constructor(storageDir: string = "output/memory") {
    fs.mkdirSync(storageDir, { recursive: true });
    this.storagePath = path.join(storageDir, "memory.json");
    this.load();
  }

  // ── Persistence ──

  private load(): void {
    if (fs.existsSync(this.storagePath)) {
      const data = JSON.parse(fs.readFileSync(this.storagePath, "utf-8"));
      this.entries = data.map((e: Record<string, unknown>) => ({
        ...e,
        type: e.type as MemoryType,
      }));
      this.counter = this.entries.length;
    }
  }

  private save(): void {
    const data = this.entries.map((e) => ({
      ...e,
      type: e.type,
    }));
    fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2), "utf-8");
  }

  // ── Core Operations ──

  store(
    type: MemoryType,
    agent: string,
    content: unknown,
    options: { tags?: string[]; metadata?: Record<string, unknown> } = {}
  ): string {
    this.counter++;
    const id = `mem-${String(this.counter).padStart(5, "0")}`;
    const entry: MemoryEntry = {
      id,
      type,
      agent,
      content,
      timestamp: new Date().toISOString(),
      metadata: options.metadata ?? {},
      tags: options.tags ?? [],
    };
    this.entries.push(entry);
    this.save();
    return id;
  }

  query(filters: {
    type?: MemoryType;
    agent?: string;
    tags?: string[];
    limit?: number;
  }): MemoryEntry[] {
    let results = [...this.entries];

    if (filters.type) {
      results = results.filter((e) => e.type === filters.type);
    }
    if (filters.agent) {
      results = results.filter((e) => e.agent === filters.agent);
    }
    if (filters.tags) {
      results = results.filter((e) =>
        filters.tags!.some((t) => e.tags.includes(t))
      );
    }

    const limit = filters.limit ?? 50;
    return results.slice(-limit);
  }

  getRecent(n: number = 10): MemoryEntry[] {
    return this.entries.slice(-n);
  }

  getByAgent(agent: string): MemoryEntry[] {
    return this.entries.filter((e) => e.agent === agent);
  }

  // ── State Management ──

  getState(key: string): unknown {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (e.type === MemoryType.STATE && e.metadata.key === key) {
        return e.content;
      }
    }
    return undefined;
  }

  setState(
    key: string,
    value: unknown,
    agent: string = "system"
  ): string {
    return this.store(MemoryType.STATE, agent, value, {
      metadata: { key },
    });
  }

  // ── Summary ──

  getSummary(): MemorySummary {
    const summary: MemorySummary = {
      totalEntries: this.entries.length,
      byType: {},
      byAgent: {},
      lastUpdated: null,
    };

    for (const entry of this.entries) {
      const t = entry.type;
      summary.byType[t] = (summary.byType[t] ?? 0) + 1;
      summary.byAgent[entry.agent] =
        (summary.byAgent[entry.agent] ?? 0) + 1;
    }

    if (this.entries.length > 0) {
      summary.lastUpdated = this.entries[this.entries.length - 1].timestamp;
    }

    return summary;
  }

  clear(): void {
    this.entries = [];
    this.counter = 0;
    this.save();
  }
}

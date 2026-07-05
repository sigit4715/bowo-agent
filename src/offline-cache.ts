/**
 * OfflineCache — LLM response cache with multiple eviction strategies.
 *
 * Caches prompt→response pairs keyed by SHA-256 hash so repeated queries
 * can be served locally without hitting the API.
 *
 * Zero external dependencies. Uses node:crypto for hashing and fs for
 * JSON-file persistence.
 */

import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CacheEntry {
  id: string;
  prompt: string;
  response: string;
  model: string;
  tokens: number;
  cost: number;
  createdAt: string;
  expiresAt: string;
  hits: number;
  lastHitAt?: string;
  tags: string[];
}

export interface CacheConfig {
  /** Maximum number of entries the cache will hold. */
  maxSize: number;
  /** Default time-to-live in milliseconds for new entries. */
  defaultTtlMs: number;
  /** Maximum total tokens across all cached entries (0 = unlimited). */
  maxTokens: number;
  /** Eviction strategy when the cache is full. */
  strategy: "lru" | "lfu" | "fifo" | "ttl";
}

export interface CacheStats {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  totalTokensSaved: number;
  totalCostSaved: number;
  sizeBytes: number;
}

export interface GetEntriesOptions {
  model?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Internal: hash key for lookups
// ---------------------------------------------------------------------------

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function nowIso(): string {
  return new Date().toISOString();
}

function futureIso(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

// ---------------------------------------------------------------------------
// OfflineCache
// ---------------------------------------------------------------------------

export class OfflineCache {
  private entries: Map<string, CacheEntry> = new Map();
  private config: CacheConfig;
  private storagePath: string;

  /** Running counters (not persisted — reset on process restart). */
  private totalHits = 0;
  private totalMisses = 0;

  constructor(config?: Partial<CacheConfig>, storagePath?: string) {
    this.config = {
      maxSize: 1000,
      defaultTtlMs: 60 * 60 * 1000, // 1 hour
      maxTokens: 0,
      strategy: "lru",
      ...config,
    };
    this.storagePath =
      storagePath ?? ".bowo/offline-cache.json";
    this.load();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Retrieve a cached response by prompt (optionally filtered by model).
   * Returns `null` on miss or expiry.
   */
  get(prompt: string, model?: string): CacheEntry | null {
    const hash = sha256(prompt);

    // Find all entries that match this prompt hash (there can be multiple
    // when different models were used).
    const candidates = this.findEntries(hash, model);
    if (candidates.length === 0) {
      this.totalMisses++;
      return null;
    }

    // Pick the best candidate (most-recently-hit, then most-recently-created).
    candidates.sort((a, b) => {
      const aHit = a.lastHitAt ?? a.createdAt;
      const bHit = b.lastHitAt ?? b.createdAt;
      return bHit.localeCompare(aHit);
    });

    const entry = candidates[0];

    // Expired?
    if (this.isExpired(entry)) {
      this.entries.delete(entry.id);
      this.totalMisses++;
      return null;
    }

    // Record hit
    entry.hits++;
    entry.lastHitAt = nowIso();
    this.totalHits++;

    this.persist();
    return entry;
  }

  /**
   * Store a new prompt→response pair.
   * Returns the created entry.
   */
  set(
    prompt: string,
    response: string,
    model: string,
    tokens: number,
    cost: number,
    tags: string[] = [],
  ): CacheEntry {
    const hash = sha256(prompt);

    const entry: CacheEntry = {
      id: randomUUID(),
      prompt,
      response,
      model,
      tokens,
      cost,
      createdAt: nowIso(),
      expiresAt: futureIso(this.config.defaultTtlMs),
      hits: 0,
      lastHitAt: undefined,
      tags,
    };

    // Enforce maxSize before inserting
    this.evictIfNeeded();

    this.entries.set(entry.id, entry);
    this.persist();
    return entry;
  }

  /**
   * Check whether a matching (non-expired) entry exists.
   */
  has(prompt: string, model?: string): boolean {
    return this.get(prompt, model) !== null;
  }

  /**
   * Delete entries matching a prompt (optionally narrowed by model).
   * Returns true if at least one entry was deleted.
   */
  delete(prompt: string, model?: string): boolean {
    const hash = sha256(prompt);
    const targets = this.findEntries(hash, model);
    if (targets.length === 0) return false;

    for (const t of targets) {
      this.entries.delete(t.id);
    }
    this.persist();
    return true;
  }

  /**
   * Remove all entries.
   */
  clear(): void {
    this.entries.clear();
    this.totalHits = 0;
    this.totalMisses = 0;
    this.persist();
  }

  /**
   * Aggregate statistics for the current cache state.
   */
  getStats(): CacheStats {
    const totalRequests = this.totalHits + this.totalMisses;
    const sizeBytes = Buffer.byteLength(
      JSON.stringify([...this.entries.values()]),
      "utf-8",
    );
    return {
      totalEntries: this.entries.size,
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      hitRate: totalRequests === 0 ? 0 : this.totalHits / totalRequests,
      totalTokensSaved: this.sumField("tokens"),
      totalCostSaved: this.sumField("cost"),
      sizeBytes,
    };
  }

  /**
   * Query entries with optional filters.
   */
  getEntries(options?: GetEntriesOptions): CacheEntry[] {
    let results = [...this.entries.values()];

    if (options?.model) {
      results = results.filter((e) => e.model === options.model);
    }
    if (options?.tags && options.tags.length > 0) {
      const tags = options.tags;
      results = results.filter((e) => tags.some((t) => e.tags.includes(t)));
    }

    // Sort by creation time descending (newest first)
    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  /**
   * Remove all expired entries. Returns the number removed.
   */
  cleanup(): number {
    let removed = 0;
    for (const [id, entry] of this.entries) {
      if (this.isExpired(entry)) {
        this.entries.delete(id);
        removed++;
      }
    }
    if (removed > 0) this.persist();
    return removed;
  }

  /**
   * Return all entries as a plain array (for serialisation / migration).
   */
  export(): CacheEntry[] {
    return [...this.entries.values()];
  }

  /**
   * Import entries from an array. Skips duplicates (same id).
   * Returns how many were actually added.
   */
  import(entries: CacheEntry[]): number {
    let added = 0;
    for (const entry of entries) {
      if (!this.entries.has(entry.id)) {
        this.entries.set(entry.id, entry);
        added++;
      }
    }
    if (added > 0) {
      this.evictIfNeeded();
      this.persist();
    }
    return added;
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /**
   * Write the current cache to disk as JSON.
   */
  persist(): void {
    try {
      const dir = dirname(this.storagePath);
      mkdirSync(dir, { recursive: true });
      const payload = {
        config: this.config,
        entries: [...this.entries.values()],
        meta: {
          totalHits: this.totalHits,
          totalMisses: this.totalMisses,
          savedAt: nowIso(),
        },
      };
      writeFileSync(this.storagePath, JSON.stringify(payload, null, 2), "utf-8");
    } catch {
      // Silently ignore write errors (read-only FS, etc.)
    }
  }

  /**
   * Load the cache from disk, merging with any in-memory state.
   * Called automatically in the constructor.
   */
  load(): void {
    try {
      const raw = readFileSync(this.storagePath, "utf-8");
      const data = JSON.parse(raw) as {
        config?: Partial<CacheConfig>;
        entries?: CacheEntry[];
        meta?: { totalHits?: number; totalMisses?: number };
      };

      if (data.entries) {
        for (const entry of data.entries) {
          // Skip expired entries on load
          if (!this.isExpired(entry)) {
            this.entries.set(entry.id, entry);
          }
        }
      }
      if (data.meta) {
        this.totalHits = data.meta.totalHits ?? 0;
        this.totalMisses = data.meta.totalMisses ?? 0;
      }
    } catch {
      // File doesn't exist yet or is corrupt — start fresh.
    }
  }

  // -------------------------------------------------------------------------
  // Eviction
  // -------------------------------------------------------------------------

  private evictIfNeeded(): void {
    while (this.entries.size >= this.config.maxSize) {
      const victim = this.selectVictim();
      if (!victim) break; // safety valve
      this.entries.delete(victim.id);
    }

    // Token budget enforcement (if configured)
    if (this.config.maxTokens > 0) {
      while (this.tokenTotal() > this.config.maxTokens && this.entries.size > 0) {
        const victim = this.selectVictim();
        if (!victim) break;
        this.entries.delete(victim.id);
      }
    }
  }

  /**
   * Pick the entry to evict according to the configured strategy.
   */
  private selectVictim(): CacheEntry | null {
    const all = Array.from(this.entries.values());
    if (all.length === 0) return null;

    switch (this.config.strategy) {
      case "lru":
        return this.victimLru(all);
      case "lfu":
        return this.victimLfu(all);
      case "fifo":
        return this.victimFifo(all);
      case "ttl":
        return this.victimTtl(all);
      default:
        return this.victimLru(all);
    }
  }

  /** Least Recently Used — evict the entry with the oldest lastHitAt. */
  private victimLru(entries: CacheEntry[]): CacheEntry {
    return entries.reduce((oldest, cur) => {
      const oldestTs = oldest.lastHitAt ?? oldest.createdAt;
      const curTs = cur.lastHitAt ?? cur.createdAt;
      return curTs < oldestTs ? cur : oldest;
    });
  }

  /** Least Frequently Used — evict the entry with the fewest hits. */
  private victimLfu(entries: CacheEntry[]): CacheEntry {
    return entries.reduce((least, cur) =>
      cur.hits < least.hits ? cur : least,
    );
  }

  /** FIFO — evict the oldest entry by createdAt. */
  private victimFifo(entries: CacheEntry[]): CacheEntry {
    return entries.reduce((oldest, cur) =>
      cur.createdAt < oldest.createdAt ? cur : oldest,
    );
  }

  /** TTL — evict the entry closest to expiry. */
  private victimTtl(entries: CacheEntry[]): CacheEntry {
    return entries.reduce((earliest, cur) =>
      cur.expiresAt < earliest.expiresAt ? cur : earliest,
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private findEntries(hash: string, model?: string): CacheEntry[] {
    let results = [...this.entries.values()].filter(
      (e) => sha256(e.prompt) === hash,
    );
    if (model) {
      results = results.filter((e) => e.model === model);
    }
    return results;
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > new Date(entry.expiresAt).getTime();
  }

  private tokenTotal(): number {
    let sum = 0;
    for (const e of this.entries.values()) sum += e.tokens;
    return sum;
  }

  private sumField(field: "tokens" | "cost"): number {
    let sum = 0;
    for (const e of this.entries.values()) sum += e[field];
    return sum;
  }
}

export default OfflineCache;

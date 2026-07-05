export interface CacheEntry {
  key: string;
  value: any;
  expiresAt: string;
  createdAt: string;
  hits: number;
}

export class CacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private defaultTTL: number; // seconds
  private totalHits: number = 0;
  private totalMisses: number = 0;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(defaultTTL: number = 300) {
    this.defaultTTL = defaultTTL;

    // Periodic cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);

    // Allow the process to exit even if interval is running
    if (this.cleanupInterval && typeof this.cleanupInterval === 'object' && 'unref' in this.cleanupInterval) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Get a cached value by key. Returns null if missing or expired.
   */
  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.totalMisses++;
      return null;
    }

    if (new Date(entry.expiresAt).getTime() < Date.now()) {
      this.cache.delete(key);
      this.totalMisses++;
      return null;
    }

    entry.hits++;
    this.totalHits++;
    return entry.value;
  }

  /**
   * Store a value in the cache.
   */
  set(key: string, value: any, ttl?: number): void {
    const ttlSeconds = ttl ?? this.defaultTTL;
    const now = new Date();

    const entry: CacheEntry = {
      key,
      value,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
      createdAt: now.toISOString(),
      hits: 0,
    };

    this.cache.set(key, entry);
  }

  /**
   * Delete a cached entry. Returns true if it existed.
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (new Date(entry.expiresAt).getTime() < Date.now()) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Number of active (non-expired) entries.
   */
  size(): number {
    let count = 0;
    const now = Date.now();
    for (const entry of Array.from(this.cache.values())) {
      if (new Date(entry.expiresAt).getTime() >= now) {
        count++;
      }
    }
    return count;
  }

  /**
   * Return cache statistics.
   */
  getStats(): {
    totalEntries: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    memoryEstimate: string;
  } {
    const totalRequests = this.totalHits + this.totalMisses;
    const hitRate = totalRequests === 0 ? 0 : this.totalHits / totalRequests;

    // Rough memory estimate: serialize to JSON and measure length
    let serializedSize = 0;
    for (const entry of Array.from(this.cache.values())) {
      serializedSize += JSON.stringify(entry).length * 2; // rough bytes (UTF-16)
    }

    return {
      totalEntries: this.cache.size,
      hitRate: Math.round(hitRate * 10000) / 100, // percentage with 2 decimals
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      memoryEstimate: this.formatBytes(serializedSize),
    };
  }

  /**
   * Remove all expired entries. Returns the count of entries removed.
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const key of Array.from(this.cache.keys())) {
      const entry = this.cache.get(key)!;
      if (new Date(entry.expiresAt).getTime() < now) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * List all non-expired keys.
   */
  keys(): string[] {
    const now = Date.now();
    const result: string[] = [];

    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (new Date(entry.expiresAt).getTime() >= now) {
        result.push(key);
      }
    }

    return result;
  }

  /**
   * Get a cached value or compute it via factory, cache, and return.
   */
  getOrSet(key: string, factory: () => any, ttl?: number): any {
    const existing = this.get(key);
    if (existing !== null) return existing;

    const value = factory();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Stop the periodic cleanup timer.
   */
  destroy(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${Math.round(value * 100) / 100} ${units[i]}`;
  }
}

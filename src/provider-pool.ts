/**
 * 🔄 Provider Pool — Multi-key rotation with load balancing
 *
 * Manages multiple API keys across providers with automatic
 * rotation, failover, and usage tracking.
 *
 * Features:
 * - Round-robin, least-used, random, weighted, failover strategies
 * - Per-key usage tracking (tokens, requests, errors)
 * - Auto-disable keys on rate limit or quota exhaustion
 * - Health checks for each key
 * - Support for multiple providers (MiMo, OpenAI, Anthropic, etc.)
 * - Cost optimization by distributing load
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Types ──────────────────────────────────────────────

export type RotationStrategy =
  | "round-robin"
  | "least-used"
  | "random"
  | "weighted"
  | "failover";

export interface ProviderKey {
  id: string;
  provider: string; // "mimo", "openai", "anthropic", "hermes", etc.
  name: string; // human-readable label
  apiKey: string;
  baseUrl?: string;
  model?: string;
  weight: number; // for weighted strategy (higher = more traffic)
  isActive: boolean;
  isDisabled: boolean;
  disabledReason?: string;
  disabledAt?: string;
  maxTokensPerDay: number;
  maxRequestsPerDay: number;
  maxCostPerDay: number; // in USD
  createdAt: string;
  lastUsedAt?: string;
  usage: KeyUsage;
}

export interface KeyUsage {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  todayRequests: number;
  todayTokens: number;
  todayCost: number;
  todayDate: string;
  errors: number;
  rateLimitHits: number;
  avgLatencyMs: number;
  lastError?: string;
  lastErrorAt?: string;
}

export interface PoolConfig {
  strategy: RotationStrategy;
  maxRetries: number; // retries with different key before giving up
  cooldownMs: number; // how long to disable a key after error
  healthCheckIntervalMs: number;
  dailyResetHour: number; // hour (0-23) to reset daily counters
  autoReenable: boolean; // auto re-enable disabled keys after cooldown
  storagePath: string; // path to persist pool state
}

export interface PoolStatus {
  totalKeys: number;
  activeKeys: number;
  disabledKeys: number;
  strategy: RotationStrategy;
  currentIndex: number;
  keys: KeyStatus[];
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
}

export interface KeyStatus {
  id: string;
  provider: string;
  name: string;
  isActive: boolean;
  isDisabled: boolean;
  disabledReason?: string;
  weight: number;
  usage: KeyUsage;
  healthScore: number; // 0-100
}

export interface SelectionResult {
  key: ProviderKey;
  attempt: number;
  strategy: RotationStrategy;
  reason: string;
}

// ─── Provider Pool ──────────────────────────────────────

export class ProviderPool {
  private keys: Map<string, ProviderKey> = new Map();
  private config: PoolConfig;
  private currentIndex = 0;
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private storagePath: string;

  constructor(config?: Partial<PoolConfig>) {
    this.config = {
      strategy: "round-robin",
      maxRetries: 3,
      cooldownMs: 5 * 60 * 1000, // 5 minutes
      healthCheckIntervalMs: 60 * 1000, // 1 minute
      dailyResetHour: 0,
      autoReenable: true,
      storagePath: "output/provider-pool.json",
      ...config,
    };
    this.storagePath = this.config.storagePath;

    // Load persisted state
    this.loadState();

    // Start health check timer
    this.startHealthCheck();
  }

  // ─── Key Management ────────────────────────────────

  /**
   * Add a new API key to the pool
   */
  addKey(key: Omit<ProviderKey, "id" | "createdAt" | "usage" | "isActive" | "isDisabled">): ProviderKey {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const providerKey: ProviderKey = {
      ...key,
      id,
      createdAt: now,
      isActive: true,
      isDisabled: false,
      weight: key.weight ?? 1,
      maxTokensPerDay: key.maxTokensPerDay ?? 1_000_000,
      maxRequestsPerDay: key.maxRequestsPerDay ?? 10_000,
      maxCostPerDay: key.maxCostPerDay ?? 10.0,
      usage: this.createEmptyUsage(),
    };

    this.keys.set(id, providerKey);
    this.saveState();
    return providerKey;
  }

  /**
   * Remove a key from the pool
   */
  removeKey(id: string): boolean {
    const removed = this.keys.delete(id);
    if (removed) this.saveState();
    return removed;
  }

  /**
   * Update a key's configuration
   */
  updateKey(id: string, updates: Partial<ProviderKey>): ProviderKey | null {
    const key = this.keys.get(id);
    if (!key) return null;

    Object.assign(key, updates);
    this.saveState();
    return key;
  }

  /**
   * Enable/disable a specific key
   */
  setKeyActive(id: string, active: boolean): boolean {
    const key = this.keys.get(id);
    if (!key) return false;

    key.isActive = active;
    if (!active) {
      key.isDisabled = true;
      key.disabledReason = "Manually disabled";
      key.disabledAt = new Date().toISOString();
    } else {
      key.isDisabled = false;
      key.disabledReason = undefined;
      key.disabledAt = undefined;
    }
    this.saveState();
    return true;
  }

  /**
   * Get all keys
   */
  getKeys(): ProviderKey[] {
    return Array.from(this.keys.values());
  }

  /**
   * Get key by ID
   */
  getKey(id: string): ProviderKey | undefined {
    return this.keys.get(id);
  }

  /**
   * Get keys by provider
   */
  getKeysByProvider(provider: string): ProviderKey[] {
    return this.getKeys().filter(k => k.provider === provider);
  }

  // ─── Key Selection ─────────────────────────────────

  /**
   * Select the next key using the configured strategy
   */
  selectKey(preferredProvider?: string): SelectionResult | null {
    const available = this.getAvailableKeys(preferredProvider);
    if (available.length === 0) return null;

    let selected: ProviderKey;
    let reason: string;

    switch (this.config.strategy) {
      case "round-robin":
        selected = this.selectRoundRobin(available);
        reason = `Round-robin (index ${this.currentIndex})`;
        break;

      case "least-used":
        selected = this.selectLeastUsed(available);
        reason = `Least-used (${selected.usage.todayRequests} requests today)`;
        break;

      case "random":
        selected = this.selectRandom(available);
        reason = "Random selection";
        break;

      case "weighted":
        selected = this.selectWeighted(available);
        reason = `Weighted (weight: ${selected.weight})`;
        break;

      case "failover":
        selected = this.selectFailover(available);
        reason = "Failover (first available)";
        break;

      default:
        selected = available[0];
        reason = "Default (first available)";
    }

    return {
      key: selected,
      attempt: 0,
      strategy: this.config.strategy,
      reason,
    };
  }

  /**
   * Select a key with retry/failover logic
   * Tries up to maxRetries different keys
   */
  selectKeyWithRetry(preferredProvider?: string): SelectionResult | null {
    const tried = new Set<string>();
    let attempt = 0;

    while (attempt < this.config.maxRetries) {
      const available = this.getAvailableKeys(preferredProvider).filter(
        k => !tried.has(k.id)
      );
      if (available.length === 0) break;

      const result = this.selectKey(preferredProvider);
      if (!result) break;

      tried.add(result.key.id);
      result.attempt = attempt;

      // Check if key is actually usable (within limits)
      if (this.isKeyUsable(result.key)) {
        return result;
      }

      attempt++;
    }

    return null;
  }

  /**
   * Report success after using a key
   */
  reportSuccess(keyId: string, tokens: number, latencyMs: number, cost: number): void {
    const key = this.keys.get(keyId);
    if (!key) return;

    this.ensureDailyReset(key);

    key.usage.totalRequests++;
    key.usage.todayRequests++;
    key.usage.totalTokens += tokens;
    key.usage.todayTokens += tokens;
    key.usage.totalCost += cost;
    key.usage.todayCost += cost;
    key.lastUsedAt = new Date().toISOString();

    // Update average latency (exponential moving average)
    key.usage.avgLatencyMs = key.usage.avgLatencyMs === 0
      ? latencyMs
      : key.usage.avgLatencyMs * 0.9 + latencyMs * 0.1;

    this.saveState();
  }

  /**
   * Report failure after using a key
   */
  reportFailure(keyId: string, error: string, isRateLimit = false): void {
    const key = this.keys.get(keyId);
    if (!key) return;

    this.ensureDailyReset(key);

    key.usage.errors++;
    key.usage.lastError = error;
    key.usage.lastErrorAt = new Date().toISOString();

    if (isRateLimit) {
      key.usage.rateLimitHits++;
      // Auto-disable on rate limit
      this.disableKey(keyId, `Rate limited: ${error}`);
    }

    // Check if daily limits exceeded
    if (key.usage.todayRequests >= key.maxRequestsPerDay) {
      this.disableKey(keyId, "Daily request limit exceeded");
    }
    if (key.usage.todayTokens >= key.maxTokensPerDay) {
      this.disableKey(keyId, "Daily token limit exceeded");
    }
    if (key.usage.todayCost >= key.maxCostPerDay) {
      this.disableKey(keyId, "Daily cost limit exceeded");
    }

    this.saveState();
  }

  /**
   * Disable a key with a reason
   */
  disableKey(keyId: string, reason: string): void {
    const key = this.keys.get(keyId);
    if (!key) return;

    key.isDisabled = true;
    key.disabledReason = reason;
    key.disabledAt = new Date().toISOString();
    this.saveState();
  }

  // ─── Strategy Implementations ──────────────────────

  private selectRoundRobin(available: ProviderKey[]): ProviderKey {
    const key = available[this.currentIndex % available.length];
    this.currentIndex = (this.currentIndex + 1) % available.length;
    return key;
  }

  private selectLeastUsed(available: ProviderKey[]): ProviderKey {
    return available.reduce((min, k) =>
      k.usage.todayRequests < min.usage.todayRequests ? k : min
    );
  }

  private selectRandom(available: ProviderKey[]): ProviderKey {
    return available[Math.floor(Math.random() * available.length)];
  }

  private selectWeighted(available: ProviderKey[]): ProviderKey {
    const totalWeight = available.reduce((sum, k) => sum + k.weight, 0);
    let random = Math.random() * totalWeight;

    for (const key of available) {
      random -= key.weight;
      if (random <= 0) return key;
    }

    return available[available.length - 1];
  }

  private selectFailover(available: ProviderKey[]): ProviderKey {
    // Return the first key sorted by: active first, then by fewest errors, then by weight
    return available.sort((a, b) => {
      // Prefer fewer errors
      if (a.usage.errors !== b.usage.errors) return a.usage.errors - b.usage.errors;
      // Then prefer higher weight
      return b.weight - a.weight;
    })[0];
  }

  // ─── Helpers ───────────────────────────────────────

  private getAvailableKeys(preferredProvider?: string): ProviderKey[] {
    let keys = this.getKeys().filter(k => k.isActive && !k.isDisabled);

    if (preferredProvider) {
      const providerKeys = keys.filter(k => k.provider === preferredProvider);
      if (providerKeys.length > 0) keys = providerKeys;
    }

    return keys;
  }

  private isKeyUsable(key: ProviderKey): boolean {
    this.ensureDailyReset(key);
    return (
      key.usage.todayRequests < key.maxRequestsPerDay &&
      key.usage.todayTokens < key.maxTokensPerDay &&
      key.usage.todayCost < key.maxCostPerDay
    );
  }

  private ensureDailyReset(key: ProviderKey): void {
    const today = new Date().toISOString().split("T")[0];
    if (key.usage.todayDate !== today) {
      key.usage.todayRequests = 0;
      key.usage.todayTokens = 0;
      key.usage.todayCost = 0;
      key.usage.todayDate = today;

      // Auto re-enable if cooldown expired
      if (this.config.autoReenable && key.isDisabled && key.disabledAt) {
        const disabledTime = new Date(key.disabledAt).getTime();
        const now = Date.now();
        if (now - disabledTime > this.config.cooldownMs) {
          key.isDisabled = false;
          key.disabledReason = undefined;
          key.disabledAt = undefined;
        }
      }
    }
  }

  private createEmptyUsage(): KeyUsage {
    return {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      todayRequests: 0,
      todayTokens: 0,
      todayCost: 0,
      todayDate: new Date().toISOString().split("T")[0],
      errors: 0,
      rateLimitHits: 0,
      avgLatencyMs: 0,
    };
  }

  // ─── Health Check ──────────────────────────────────

  private startHealthCheck(): void {
    if (this.config.healthCheckIntervalMs <= 0) return;

    this.healthCheckTimer = setInterval(() => {
      this.runHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  private runHealthCheck(): void {
    const now = Date.now();

    for (const key of Array.from(this.keys.values())) {
      // Auto re-enable disabled keys after cooldown
      if (this.config.autoReenable && key.isDisabled && key.disabledAt) {
        const disabledTime = new Date(key.disabledAt).getTime();
        if (now - disabledTime > this.config.cooldownMs) {
          key.isDisabled = false;
          key.disabledReason = undefined;
          key.disabledAt = undefined;
        }
      }

      // Reset daily counters if needed
      this.ensureDailyReset(key);
    }
  }

  // ─── Status ────────────────────────────────────────

  /**
   * Get pool status
   */
  getStatus(): PoolStatus {
    const keys = this.getKeys();
    const activeKeys = keys.filter(k => k.isActive && !k.isDisabled);
    const disabledKeys = keys.filter(k => k.isDisabled);

    return {
      totalKeys: keys.length,
      activeKeys: activeKeys.length,
      disabledKeys: disabledKeys.length,
      strategy: this.config.strategy,
      currentIndex: this.currentIndex,
      keys: keys.map(k => ({
        id: k.id,
        provider: k.provider,
        name: k.name,
        isActive: k.isActive,
        isDisabled: k.isDisabled,
        disabledReason: k.disabledReason,
        weight: k.weight,
        usage: k.usage,
        healthScore: this.calculateHealthScore(k),
      })),
      totalRequests: keys.reduce((sum, k) => sum + k.usage.totalRequests, 0),
      totalTokens: keys.reduce((sum, k) => sum + k.usage.totalTokens, 0),
      totalCost: keys.reduce((sum, k) => sum + k.usage.totalCost, 0),
    };
  }

  /**
   * Calculate health score for a key (0-100)
   */
  private calculateHealthScore(key: ProviderKey): number {
    let score = 100;

    // Deduct for errors
    if (key.usage.totalRequests > 0) {
      const errorRate = key.usage.errors / key.usage.totalRequests;
      score -= errorRate * 50;
    }

    // Deduct for rate limit hits
    score -= key.usage.rateLimitHits * 5;

    // Deduct if disabled
    if (key.isDisabled) score -= 30;

    // Deduct for high latency (>2s is bad)
    if (key.usage.avgLatencyMs > 2000) score -= 20;
    else if (key.usage.avgLatencyMs > 1000) score -= 10;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // ─── Persistence ───────────────────────────────────

  private saveState(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const state = {
        config: this.config,
        currentIndex: this.currentIndex,
        keys: Array.from(this.keys.values()),
        savedAt: new Date().toISOString(),
      };

      fs.writeFileSync(this.storagePath, JSON.stringify(state, null, 2));
    } catch {
      // Silently fail on write errors
    }
  }

  private loadState(): void {
    try {
      if (!fs.existsSync(this.storagePath)) return;

      const data = JSON.parse(fs.readFileSync(this.storagePath, "utf-8"));
      if (data.keys) {
        for (const key of data.keys) {
          this.keys.set(key.id, key);
        }
      }
      if (data.currentIndex !== undefined) {
        this.currentIndex = data.currentIndex;
      }
      if (data.config) {
        Object.assign(this.config, data.config);
      }
    } catch {
      // Start fresh on read errors
    }
  }

  /**
   * Destroy the pool (stop health checks, save state)
   */
  destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    this.saveState();
  }
}

// ─── Quick Setup Helpers ────────────────────────────────

/**
 * Create a pool pre-configured for MiMo accounts
 */
export function createMiMoPool(apiKeys: Array<{ name: string; apiKey: string }>): ProviderPool {
  const pool = new ProviderPool({ strategy: "round-robin" });

  for (const { name, apiKey } of apiKeys) {
    pool.addKey({
      provider: "mimo",
      name,
      apiKey,
      baseUrl: "https://api.mimo.ai/v1",
      model: "mimo-7b",
      weight: 1,
      maxTokensPerDay: 500_000,
      maxRequestsPerDay: 5_000,
      maxCostPerDay: 5.0,
    });
  }

  return pool;
}

/**
 * Create a multi-provider pool
 */
export function createMultiProviderPool(
  keys: Array<{
    provider: string;
    name: string;
    apiKey: string;
    baseUrl?: string;
    model?: string;
    weight?: number;
  }>
): ProviderPool {
  const pool = new ProviderPool({ strategy: "weighted" });

  for (const key of keys) {
    pool.addKey({
      ...key,
      weight: key.weight ?? 1,
      maxTokensPerDay: 1_000_000,
      maxRequestsPerDay: 10_000,
      maxCostPerDay: 10.0,
    });
  }

  return pool;
}

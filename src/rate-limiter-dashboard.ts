/**
 * 🛡️ Rate Limiter Dashboard — Visual rate limit status
 *
 * Track and visualize rate limits across providers and keys.
 */

import * as crypto from "node:crypto";

// ─── Types ──────────────────────────────────────────────

export type RateLimitStrategy = "fixed-window" | "sliding-window" | "token-bucket" | "leaky-bucket";

export interface RateLimitConfig {
  strategy: RateLimitStrategy;
  maxRequests: number;
  windowMs: number;
  maxTokens?: number;
  tokensPerRequest?: number;
}

export interface RateLimitEntry {
  id: string;
  name: string;
  config: RateLimitConfig;
  requests: number;
  tokens: number;
  windowStart: number;
  lastRequestAt?: string;
  blocked: boolean;
  blockedUntil?: string;
  totalRequests: number;
  totalTokens: number;
  errors: number;
}

export interface RateLimitStatus {
  name: string;
  strategy: string;
  requestsUsed: number;
  requestsMax: number;
  requestsPercentage: number;
  tokensUsed: number;
  tokensMax: number;
  tokensPercentage: number;
  blocked: boolean;
  resetsAt: string;
  windowRemainingMs: number;
  status: "ok" | "warning" | "critical" | "blocked";
}

export interface DashboardData {
  timestamp: string;
  totalProviders: number;
  totalRequests: number;
  totalTokens: number;
  providers: RateLimitStatus[];
  alerts: RateLimitAlert[];
}

export interface RateLimitAlert {
  id: string;
  provider: string;
  type: "approaching_limit" | "limit_reached" | "blocked" | "unblocked";
  message: string;
  timestamp: string;
  severity: "info" | "warning" | "error";
}

// ─── Rate Limiter ──────────────────────────────────────

export class RateLimiterDashboard {
  private entries: Map<string, RateLimitEntry> = new Map();
  private alerts: RateLimitAlert[] = [];
  private alertHandlers: Array<(alert: RateLimitAlert) => void> = [];

  constructor() {}

  /**
   * Register a provider with rate limits
   */
  register(name: string, config: RateLimitConfig): RateLimitEntry {
    const entry: RateLimitEntry = {
      id: crypto.randomUUID(),
      name,
      config,
      requests: 0,
      tokens: 0,
      windowStart: Date.now(),
      blocked: false,
      totalRequests: 0,
      totalTokens: 0,
      errors: 0,
    };

    this.entries.set(name, entry);
    return entry;
  }

  /**
   * Check if a request is allowed
   */
  checkLimit(name: string, tokens?: number): { allowed: boolean; retryAfterMs?: number; status: RateLimitStatus } {
    const entry = this.entries.get(name);
    if (!entry) {
      return { allowed: true, status: this.getDefaultStatus(name) };
    }

    // Check if blocked
    if (entry.blocked) {
      if (entry.blockedUntil && Date.now() < new Date(entry.blockedUntil).getTime()) {
        return {
          allowed: false,
          retryAfterMs: new Date(entry.blockedUntil).getTime() - Date.now(),
          status: this.getStatus(entry),
        };
      }
      // Unblock
      entry.blocked = false;
      entry.blockedUntil = undefined;
      this.addAlert(name, "unblocked", "Rate limit window reset", "info");
    }

    // Check window expiry
    if (Date.now() - entry.windowStart > entry.config.windowMs) {
      entry.windowStart = Date.now();
      entry.requests = 0;
      entry.tokens = 0;
    }

    // Check limits
    const requestsExceeded = entry.requests >= entry.config.maxRequests;
    const tokensExceeded = entry.config.maxTokens && tokens
      ? entry.tokens + (tokens ?? 0) > entry.config.maxTokens
      : false;

    if (requestsExceeded || tokensExceeded) {
      entry.blocked = true;
      entry.blockedUntil = new Date(entry.windowStart + entry.config.windowMs).toISOString();
      entry.errors++;

      const retryAfterMs = (entry.windowStart + entry.config.windowMs) - Date.now();
      this.addAlert(name, "limit_reached", `Rate limit reached for ${name}`, "error");

      return { allowed: false, retryAfterMs, status: this.getStatus(entry) };
    }

    // Warning check (80%)
    const requestPct = (entry.requests / entry.config.maxRequests) * 100;
    if (requestPct >= 80) {
      this.addAlert(name, "approaching_limit", `Approaching rate limit for ${name} (${requestPct.toFixed(0)}%)`, "warning");
    }

    return { allowed: true, status: this.getStatus(entry) };
  }

  /**
   * Record a request
   */
  recordRequest(name: string, tokens?: number): void {
    const entry = this.entries.get(name);
    if (!entry) return;

    entry.requests++;
    entry.totalRequests++;
    entry.lastRequestAt = new Date().toISOString();

    if (tokens) {
      entry.tokens += tokens;
      entry.totalTokens += tokens;
    }
  }

  /**
   * Get status for a provider
   */
  getStatus(entry: RateLimitEntry): RateLimitStatus {
    const requestPct = (entry.requests / entry.config.maxRequests) * 100;
    const tokensPct = entry.config.maxTokens
      ? (entry.tokens / entry.config.maxTokens) * 100
      : 0;

    let status: "ok" | "warning" | "critical" | "blocked" = "ok";
    if (entry.blocked) status = "blocked";
    else if (requestPct >= 80 || tokensPct >= 80) status = "critical";
    else if (requestPct >= 50 || tokensPct >= 50) status = "warning";

    const resetsAt = new Date(entry.windowStart + entry.config.windowMs);
    const windowRemainingMs = Math.max(0, resetsAt.getTime() - Date.now());

    return {
      name: entry.name,
      strategy: entry.config.strategy,
      requestsUsed: entry.requests,
      requestsMax: entry.config.maxRequests,
      requestsPercentage: Math.round(requestPct),
      tokensUsed: entry.tokens,
      tokensMax: entry.config.maxTokens ?? 0,
      tokensPercentage: Math.round(tokensPct),
      blocked: entry.blocked,
      resetsAt: resetsAt.toISOString(),
      windowRemainingMs,
      status,
    };
  }

  /**
   * Get default status (unregistered provider)
   */
  private getDefaultStatus(name: string): RateLimitStatus {
    return {
      name,
      strategy: "unknown",
      requestsUsed: 0,
      requestsMax: 0,
      requestsPercentage: 0,
      tokensUsed: 0,
      tokensMax: 0,
      tokensPercentage: 0,
      blocked: false,
      resetsAt: "",
      windowRemainingMs: 0,
      status: "ok",
    };
  }

  /**
   * Get all provider statuses
   */
  getAllStatuses(): RateLimitStatus[] {
    return Array.from(this.entries.values()).map((e) => this.getStatus(e));
  }

  /**
   * Get dashboard data
   */
  getDashboardData(): DashboardData {
    const providers = this.getAllStatuses();
    const totalRequests = providers.reduce((s, p) => s + p.requestsUsed, 0);
    const totalTokens = providers.reduce((s, p) => s + p.tokensUsed, 0);

    return {
      timestamp: new Date().toISOString(),
      totalProviders: providers.length,
      totalRequests,
      totalTokens,
      providers,
      alerts: this.alerts.slice(-20),
    };
  }

  /**
   * Get alerts
   */
  getAlerts(limit?: number): RateLimitAlert[] {
    return limit ? this.alerts.slice(-limit) : this.alerts;
  }

  /**
   * Register alert handler
   */
  onAlert(handler: (alert: RateLimitAlert) => void): () => void {
    this.alertHandlers.push(handler);
    return () => {
      const idx = this.alertHandlers.indexOf(handler);
      if (idx >= 0) this.alertHandlers.splice(idx, 1);
    };
  }

  /**
   * Add alert
   */
  private addAlert(provider: string, type: RateLimitAlert["type"], message: string, severity: RateLimitAlert["severity"]): void {
    const alert: RateLimitAlert = {
      id: crypto.randomUUID(),
      provider,
      type,
      message,
      timestamp: new Date().toISOString(),
      severity,
    };

    this.alerts.push(alert);
    if (this.alerts.length > 100) this.alerts = this.alerts.slice(-100);

    for (const handler of this.alertHandlers) {
      handler(alert);
    }
  }

  /**
   * Reset a provider
   */
  reset(name: string): boolean {
    const entry = this.entries.get(name);
    if (!entry) return false;
    entry.requests = 0;
    entry.tokens = 0;
    entry.windowStart = Date.now();
    entry.blocked = false;
    entry.blockedUntil = undefined;
    return true;
  }

  /**
   * Remove a provider
   */
  remove(name: string): boolean {
    return this.entries.delete(name);
  }

  /**
   * Generate HTML dashboard
   */
  generateHTML(): string {
    const data = this.getDashboardData();

    const rows = data.providers.map((p) => {
      const statusColor = { ok: "#00b894", warning: "#fdcb6e", critical: "#e17055", blocked: "#d63031" }[p.status];
      const barColor = statusColor;
      return `
        <tr>
          <td><strong>${p.name}</strong></td>
          <td><span style="color:${statusColor}">${p.status.toUpperCase()}</span></td>
          <td>${p.requestsUsed} / ${p.requestsMax} (${p.requestsPercentage}%)</td>
          <td><div style="background:#2d2d44;border-radius:4px;height:20px;width:200px"><div style="background:${barColor};height:100%;width:${Math.min(p.requestsPercentage, 100)}%;border-radius:4px"></div></div></td>
          <td>${p.strategy}</td>
          <td>${p.blocked ? "⛔ Blocked" : "✅ OK"}</td>
        </tr>`;
    }).join("\n");

    return `<!DOCTYPE html>
<html>
<head>
  <title>BOWO Rate Limiter Dashboard</title>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="5">
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f0f23; color: #e0e0e0; padding: 20px; }
    h1 { color: #a29bfe; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #1a1a3e; padding: 12px; text-align: left; border-bottom: 2px solid #6c5ce7; }
    td { padding: 12px; border-bottom: 1px solid #2d2d44; }
    .summary { display: flex; gap: 20px; margin: 20px 0; }
    .card { background: #1a1a2e; border: 1px solid #2d2d44; border-radius: 8px; padding: 16px; flex: 1; }
    .card .value { font-size: 24px; font-weight: bold; color: #a29bfe; }
    .card .label { color: #636e72; font-size: 14px; }
  </style>
</head>
<body>
  <h1>🛡️ Rate Limiter Dashboard</h1>
  <p>Last updated: ${data.timestamp}</p>
  <div class="summary">
    <div class="card"><div class="value">${data.totalProviders}</div><div class="label">Providers</div></div>
    <div class="card"><div class="value">${data.totalRequests}</div><div class="label">Requests</div></div>
    <div class="card"><div class="value">${data.totalTokens.toLocaleString()}</div><div class="label">Tokens</div></div>
  </div>
  <table>
    <thead><tr><th>Provider</th><th>Status</th><th>Requests</th><th>Usage</th><th>Strategy</th><th>Blocked</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6">No providers registered</td></tr>'}</tbody>
  </table>
</body>
</html>`;
  }
}

/**
 * Create a rate limiter with common presets
 */
export function createMimoRateLimiter(): RateLimiterDashboard {
  const dashboard = new RateLimiterDashboard();
  dashboard.register("mimo", {
    strategy: "sliding-window",
    maxRequests: 60,
    windowMs: 60000, // 1 minute
  });
  return dashboard;
}

export function createQwenCloudRateLimiter(): RateLimiterDashboard {
  const dashboard = new RateLimiterDashboard();
  dashboard.register("qwencloud", {
    strategy: "fixed-window",
    maxRequests: 100,
    windowMs: 60000,
    maxTokens: 1000000,
  });
  return dashboard;
}

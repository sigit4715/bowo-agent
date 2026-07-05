/**
 * 🛜 AIRouter — Connection Health Testing + Prefix-Based Routing
 *
 * 9Router-inspired intelligent routing layer for BOWO. Manages provider
 * nodes, connections, health checks, and prefix-based model resolution.
 *
 * Features:
 * - Provider nodes with typed endpoints (OpenAI, Anthropic, custom)
 * - Connection health testing via real HTTP probes to /v1/models
 * - Prefix-based routing: parse "provider/model" format
 * - Periodic health checks with configurable intervals
 * - Auto-disable unhealthy connections, auto-re-enable after cooldown
 * - Per-connection usage tracking (requests, tokens, errors)
 * - Best-connection selection for route resolution
 *
 * Zero external deps — uses only node:https and node:crypto.
 */

import * as crypto from "node:crypto";
import * as https from "node:https";
import * as http from "node:http";
import { URL } from "node:url";

// ─── Types ──────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export type ProviderType =
  | "openai-compatible"
  | "anthropic-compatible"
  | "custom";

export interface ConnectionUsage {
  requests: number;
  tokens: number;
  errors: number;
}

export interface Connection {
  id: string;
  name: string;
  apiKey: string;
  isActive: boolean;
  testStatus: HealthStatus;
  lastTestedAt?: string;
  lastError?: string;
  usage: ConnectionUsage;
}

export interface ProviderNode {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  prefix: string;
  isActive: boolean;
  connections: Connection[];
}

export interface RouteResult {
  provider: string;
  model: string;
  connection: Connection;
  fullModel: string;
}

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

export interface RouterConfig {
  /** Health check interval in ms (default: 60_000 — 1 min) */
  healthCheckIntervalMs: number;
  /** Cooldown before re-enabling an unhealthy connection (default: 300_000 — 5 min) */
  cooldownMs: number;
  /** Auto-disable connections after N consecutive failures (default: 3) */
  failureThreshold: number;
  /** Auto-re-enable connections that pass re-check after cooldown */
  autoReenable: boolean;
  /** HTTP timeout for health probes in ms (default: 10_000) */
  probeTimeoutMs: number;
}

// ─── Default config ─────────────────────────────────────

const DEFAULT_CONFIG: RouterConfig = {
  healthCheckIntervalMs: 60_000,
  cooldownMs: 5 * 60 * 1000,
  failureThreshold: 3,
  autoReenable: true,
  probeTimeoutMs: 10_000,
};

// ─── Internal tracking ──────────────────────────────────

interface ConnectionState {
  connId: string;
  consecutiveFailures: number;
  disabledAt?: string;
}

// ─── AIRouter ───────────────────────────────────────────

export class AIRouter {
  private nodes: Map<string, ProviderNode> = new Map();
  private connStates: Map<string, ConnectionState> = new Map();
  private config: RouterConfig;
  private healthTimer?: ReturnType<typeof setInterval>;
  private nodeCounter = 0;

  constructor(config?: Partial<RouterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Provider Node Management ─────────────────────────

  /**
   * Register a new provider node. Generates a unique ID and
   * initialises an empty connection list.
   */
  addProviderNode(
    node: Omit<ProviderNode, "id" | "connections">
  ): ProviderNode {
    this.nodeCounter++;
    const id = `node_${this.nodeCounter}_${crypto.randomUUID().slice(0, 8)}`;

    const fullNode: ProviderNode = {
      ...node,
      id,
      connections: [],
    };

    this.nodes.set(id, fullNode);
    return fullNode;
  }

  /**
   * Remove a provider node and all its connections.
   * Returns true if found and removed.
   */
  removeProviderNode(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;

    // Clean up connection states
    for (const conn of node.connections) {
      this.connStates.delete(conn.id);
    }

    return this.nodes.delete(id);
  }

  /**
   * Get all registered provider nodes.
   */
  getProviderNodes(): ProviderNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Find a provider node by its prefix.
   * Useful for direct prefix lookup without model parsing.
   */
  getNodeByPrefix(prefix: string): ProviderNode | undefined {
    return this.getProviderNodes().find(
      (n) => n.prefix === prefix && n.isActive
    );
  }

  // ─── Connection Management ────────────────────────────

  /**
   * Add a connection to a provider node.
   * Returns the created connection, or null if node not found.
   */
  addConnection(
    nodeId: string,
    conn: Omit<Connection, "id" | "testStatus" | "usage">
  ): Connection | null {
    const node = this.nodes.get(nodeId);
    if (!node) return null;

    const fullConn: Connection = {
      ...conn,
      id: `conn_${crypto.randomUUID().slice(0, 12)}`,
      testStatus: "unknown" as HealthStatus,
      usage: { requests: 0, tokens: 0, errors: 0 },
    };

    node.connections.push(fullConn);
    this.connStates.set(fullConn.id, {
      connId: fullConn.id,
      consecutiveFailures: 0,
    });

    return fullConn;
  }

  /**
   * Remove a connection from a provider node.
   * Returns true if found and removed.
   */
  removeConnection(nodeId: string, connId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    const idx = node.connections.findIndex((c) => c.id === connId);
    if (idx === -1) return false;

    node.connections.splice(idx, 1);
    this.connStates.delete(connId);
    return true;
  }

  // ─── Health Testing ───────────────────────────────────

  /**
   * Probe a single connection by hitting its provider's /v1/models endpoint.
   * Returns health status, latency, and any error.
   */
  async testConnection(connId: string): Promise<HealthCheckResult> {
    const { conn, node } = this.findConnectionWithNode(connId);
    if (!conn || !node) {
      return { healthy: false, latencyMs: 0, error: "Connection not found" };
    }

    const baseUrl = node.baseUrl.replace(/\/+$/, "");
    const targetUrl = `${baseUrl}/v1/models`;
    const start = Date.now();

    try {
      const result = await this.httpGet(targetUrl, conn.apiKey);
      const latencyMs = Date.now() - start;

      // Update connection state
      conn.lastTestedAt = new Date().toISOString();
      conn.lastError = undefined;
      conn.testStatus =
        result.statusCode >= 200 && result.statusCode < 300
          ? "healthy"
          : result.statusCode >= 400 && result.statusCode < 500
            ? "degraded"
            : "unhealthy";

      // Reset consecutive failures on success
      const state = this.connStates.get(connId);
      if (state && result.statusCode >= 200 && result.statusCode < 300) {
        state.consecutiveFailures = 0;
        state.disabledAt = undefined;
        conn.isActive = true;
      } else {
        this.recordFailure(
          connId,
          conn,
          result.error ?? `HTTP ${result.statusCode}`
        );
      }

      return {
        healthy: conn.testStatus === "healthy",
        latencyMs,
        error: result.error,
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);

      conn.lastTestedAt = new Date().toISOString();
      conn.lastError = errorMsg;
      conn.testStatus = "unhealthy";

      this.recordFailure(connId, conn, errorMsg);

      return { healthy: false, latencyMs, error: errorMsg };
    }
  }

  /**
   * Test all connections across all nodes concurrently.
   * Returns a Map of connId → health result.
   */
  async testAllConnections(): Promise<Map<string, HealthCheckResult>> {
    const results = new Map<string, HealthCheckResult>();
    const allConns = this.getAllConnections();

    const probes = allConns.map(async (conn) => {
      const result = await this.testConnection(conn.id);
      results.set(conn.id, result);
    });

    await Promise.allSettled(probes);
    return results;
  }

  // ─── Route Resolution ─────────────────────────────────

  /**
   * Resolve a model string in "prefix/model" format to a concrete route.
   *
   * Examples:
   *   "openai/gpt-4o"          → routes to the "openai" prefix node
   *   "anthropic/claude-3"     → routes to the "anthropic" prefix node
   *   "custom/my-model"        → routes to the "custom" prefix node
   *
   * Returns null if no matching node or healthy connection is found.
   */
  resolveRoute(model: string): RouteResult | null {
    const parsed = this.parseModelString(model);
    if (!parsed) return null;

    const { prefix, modelName } = parsed;

    // Find matching node by prefix
    const nodeId = this.findNodeIdByPrefix(prefix);
    const node = nodeId ? this.nodes.get(nodeId) : undefined;

    if (!node || !node.isActive) return null;

    // Pick the best connection from this node
    const bestConn = this.selectBestConnection(node);
    if (!bestConn) return null;

    return {
      provider: node.name,
      model: modelName,
      connection: bestConn,
      fullModel: model,
    };
  }

  /**
   * Parse a model string of the form "prefix/modelName".
   * Returns null if the string doesn't contain a slash.
   */
  private parseModelString(
    model: string
  ): { prefix: string; modelName: string } | null {
    const slashIdx = model.indexOf("/");
    if (slashIdx <= 0 || slashIdx >= model.length - 1) return null;

    return {
      prefix: model.slice(0, slashIdx),
      modelName: model.slice(slashIdx + 1),
    };
  }

  // ─── Health Filters ───────────────────────────────────

  /**
   * Get all healthy connections, optionally filtered to a specific node.
   */
  getHealthyConnections(nodeId?: string): Connection[] {
    const nodes: ProviderNode[] = nodeId
      ? (() => {
          const n = this.nodes.get(nodeId);
          return n ? [n] : [];
        })()
      : this.getProviderNodes();

    const healthy: Connection[] = [];
    for (const node of nodes) {
      if (!node.isActive) continue;
      for (const conn of node.connections) {
        if (
          conn.isActive &&
          (conn.testStatus === "healthy" || conn.testStatus === "unknown")
        ) {
          healthy.push(conn);
        }
      }
    }
    return healthy;
  }

  // ─── Statistics ───────────────────────────────────────

  /**
   * Get aggregate stats across all nodes and connections.
   */
  getStats(): {
    totalNodes: number;
    totalConnections: number;
    healthyConnections: number;
    unhealthyConnections: number;
  } {
    let totalConnections = 0;
    let healthyConnections = 0;
    let unhealthyConnections = 0;

    for (const node of Array.from(this.nodes.values())) {
      for (const conn of node.connections) {
        totalConnections++;
        if (conn.testStatus === "healthy") {
          healthyConnections++;
        } else if (
          conn.testStatus === "unhealthy" ||
          conn.testStatus === "degraded"
        ) {
          unhealthyConnections++;
        }
      }
    }

    return {
      totalNodes: this.nodes.size,
      totalConnections,
      healthyConnections,
      unhealthyConnections,
    };
  }

  // ─── Periodic Health Checks ───────────────────────────

  /**
   * Start periodic health checks on the configured interval.
   */
  startHealthChecks(): void {
    this.stopHealthChecks();
    if (this.config.healthCheckIntervalMs <= 0) return;

    this.healthTimer = setInterval(() => {
      this.runHealthCheckCycle().catch(() => {
        // Swallow — health checks are best-effort
      });
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Stop periodic health checks.
   */
  stopHealthChecks(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = undefined;
    }
  }

  /**
   * Run one full health check cycle across all connections,
   * then auto-disable / auto-re-enable as needed.
   */
  private async runHealthCheckCycle(): Promise<void> {
    await this.testAllConnections();
    this.applyAutoDisableAndReenable();
  }

  /**
   * Auto-disable connections that have exceeded the failure threshold.
   * Auto-re-enable connections that are past the cooldown period and
   * are currently healthy.
   */
  private applyAutoDisableAndReenable(): void {
    const now = Date.now();

    for (const conn of this.getAllConnections()) {
      const state = this.connStates.get(conn.id);
      if (!state) continue;

      // Auto-disable: too many consecutive failures
      if (
        state.consecutiveFailures >= this.config.failureThreshold &&
        conn.isActive
      ) {
        conn.isActive = false;
        conn.testStatus = "unhealthy";
        state.disabledAt = state.disabledAt ?? new Date().toISOString();
      }

      // Auto-re-enable: cooldown elapsed + current test is healthy
      if (
        this.config.autoReenable &&
        !conn.isActive &&
        state.disabledAt
      ) {
        const elapsed = now - new Date(state.disabledAt).getTime();
        if (
          elapsed >= this.config.cooldownMs &&
          (conn.testStatus === "healthy" || conn.testStatus === "unknown")
        ) {
          conn.isActive = true;
          state.consecutiveFailures = 0;
          state.disabledAt = undefined;
        }
      }
    }
  }

  // ─── Internal Helpers ─────────────────────────────────

  /**
   * Record a failure and possibly trigger auto-disable.
   */
  private recordFailure(
    connId: string,
    conn: Connection,
    error: string
  ): void {
    conn.usage.errors++;
    conn.lastError = error;

    const state = this.connStates.get(connId);
    if (state) {
      state.consecutiveFailures++;
    }
  }

  /**
   * Find a connection and its parent node by connection ID.
   */
  private findConnectionWithNode(connId: string): {
    conn: Connection | null;
    node: ProviderNode | null;
  } {
    for (const node of Array.from(this.nodes.values())) {
      const conn = node.connections.find((c) => c.id === connId);
      if (conn) return { conn, node };
    }
    return { conn: null, node: null };
  }

  /**
   * Find a node ID by its prefix string.
   */
  private findNodeIdByPrefix(prefix: string): string | undefined {
    for (const [id, node] of Array.from(this.nodes.entries())) {
      if (node.prefix === prefix && node.isActive) return id;
    }
    return undefined;
  }

  /**
   * Flatten all connections across all nodes.
   */
  private getAllConnections(): Connection[] {
    const conns: Connection[] = [];
    for (const node of Array.from(this.nodes.values())) {
      for (const conn of node.connections) {
        conns.push(conn);
      }
    }
    return conns;
  }

  /**
   * Select the best connection from a node:
   * 1. Must be active
   * 2. Prefer healthy > unknown > degraded > unhealthy
   * 3. Among equal health, prefer fewest errors
   * 4. Among equal errors, prefer fewest requests (least-loaded)
   */
  private selectBestConnection(node: ProviderNode): Connection | null {
    const healthRank: Record<HealthStatus, number> = {
      healthy: 0,
      unknown: 1,
      degraded: 2,
      unhealthy: 3,
    };

    const candidates = node.connections.filter((c) => c.isActive);
    if (candidates.length === 0) return null;

    // Sort by health rank → errors → requests
    candidates.sort((a, b) => {
      const rankDiff =
        (healthRank[a.testStatus] ?? 4) - (healthRank[b.testStatus] ?? 4);
      if (rankDiff !== 0) return rankDiff;

      const errDiff = a.usage.errors - b.usage.errors;
      if (errDiff !== 0) return errDiff;

      return a.usage.requests - b.usage.requests;
    });

    return candidates[0];
  }

  // ─── HTTP Probe ───────────────────────────────────────

  /**
   * Minimal HTTP GET using node:https (or http for localhost).
   * Returns status code and optional error string.
   */
  private httpGet(
    urlStr: string,
    apiKey: string
  ): Promise<{ statusCode: number; error?: string }> {
    return new Promise((resolve) => {
      try {
        const url = new URL(urlStr);
        const transport = url.protocol === "https:" ? https : http;

        const req = transport.get(
          url,
          {
            timeout: this.config.probeTimeoutMs,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "User-Agent": "BOWO-Router/1.0",
              Accept: "application/json",
            },
          },
          (res) => {
            // We only need the status code; drain the body to free the socket
            res.resume();
            resolve({
              statusCode: res.statusCode ?? 0,
              error:
                res.statusCode !== undefined && res.statusCode >= 400
                  ? `HTTP ${res.statusCode}`
                  : undefined,
            });
          }
        );

        req.on("timeout", () => {
          req.destroy();
          resolve({ statusCode: 0, error: "Timeout" });
        });

        req.on("error", (err) => {
          resolve({ statusCode: 0, error: err.message });
        });
      } catch (err) {
        resolve({
          statusCode: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }
}

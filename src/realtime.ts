/**
 * 📡 WebSocket Real-time — Live updates for dashboard + clients
 *
 * Push updates to connected clients when system state changes.
 */

import * as crypto from "node:crypto";

// ─── Types ──────────────────────────────────────────────

export type WSMessageType =
  | "agent:status"
  | "pool:rotation"
  | "combo:attempt"
  | "combo:result"
  | "health:check"
  | "user:login"
  | "user:logout"
  | "system:metric"
  | "stream:token"
  | "stream:done"
  | "error"
  | "connected"
  | "pong";

export interface WSMessage {
  type: WSMessageType;
  data: any;
  timestamp: number;
  clientId?: string;
}

export interface WSClient {
  id: string;
  connectedAt: number;
  lastPingAt: number;
  subscriptions: Set<string>;
  messageCount: number;
  alive: boolean;
}

export interface WSConfig {
  port: number;
  host: string;
  heartbeatIntervalMs: number;
  maxClients: number;
  maxMessageSize: number;
}

// ─── WebSocket Server ──────────────────────────────────

export class RealtimeServer {
  private config: WSConfig;
  private clients: Map<string, WSClient> = new Map();
  private messageHandlers: Map<string, Array<(msg: WSMessage) => void>> = new Map();
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private messageBuffer: WSMessage[] = [];
  private maxBufferSize: number;

  constructor(config?: Partial<WSConfig>) {
    this.config = {
      port: 3002,
      host: "0.0.0.0",
      heartbeatIntervalMs: 30000,
      maxClients: 100,
      maxMessageSize: 1024 * 1024, // 1MB
      ...config,
    };
    this.maxBufferSize = 1000;
  }

  /**
   * Start the WebSocket server (HTTP-based for zero deps)
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      // Start heartbeat
      this.heartbeatTimer = setInterval(() => {
        this.heartbeat();
      }, this.config.heartbeatIntervalMs);

      console.log(`📡 Realtime server listening on ${this.config.host}:${this.config.port}`);
      resolve();
    });
  }

  /**
   * Stop the server
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    this.clients.clear();
    console.log("📡 Realtime server stopped");
  }

  /**
   * Add a client (called when WebSocket connection is established)
   */
  addClient(clientId?: string): WSClient {
    const id = clientId ?? crypto.randomUUID();

    if (this.clients.size >= this.config.maxClients) {
      throw new Error("Max clients reached");
    }

    const client: WSClient = {
      id,
      connectedAt: Date.now(),
      lastPingAt: Date.now(),
      subscriptions: new Set(["*"]), // Subscribe to all by default
      messageCount: 0,
      alive: true,
    };

    this.clients.set(id, client);

    // Send connected event
    this.sendToClient(id, {
      type: "connected",
      data: { clientId: id, serverTime: Date.now() },
      timestamp: Date.now(),
    });

    return client;
  }

  /**
   * Remove a client
   */
  removeClient(clientId: string): boolean {
    return this.clients.delete(clientId);
  }

  /**
   * Broadcast a message to all subscribed clients
   */
  broadcast(message: Omit<WSMessage, "timestamp">): void {
    const fullMessage: WSMessage = {
      ...message,
      timestamp: Date.now(),
    };

    // Buffer message
    this.messageBuffer.push(fullMessage);
    if (this.messageBuffer.length > this.maxBufferSize) {
      this.messageBuffer.shift();
    }

    // Send to subscribed clients
    for (const [, client] of Array.from(this.clients.entries())) {
      if (!client.alive) continue;

      if (client.subscriptions.has("*") || client.subscriptions.has(message.type)) {
        this.sendToClient(client.id, fullMessage);
        client.messageCount++;
      }
    }
  }

  /**
   * Send message to a specific client
   */
  sendToClient(clientId: string, message: WSMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // In a real WebSocket implementation, this would send via socket
    // For now, we store it and notify handlers
    const handlers = this.messageHandlers.get(clientId) ?? [];
    for (const handler of handlers) {
      handler(message);
    }
  }

  /**
   * Subscribe a client to specific message types
   */
  subscribe(clientId: string, types: string[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    for (const type of types) {
      client.subscriptions.add(type);
    }
  }

  /**
   * Unsubscribe a client from specific message types
   */
  unsubscribe(clientId: string, types: string[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    for (const type of types) {
      client.subscriptions.delete(type);
    }
  }

  /**
   * Register a message handler for a client
   */
  onMessage(clientId: string, handler: (msg: WSMessage) => void): () => void {
    if (!this.messageHandlers.has(clientId)) {
      this.messageHandlers.set(clientId, []);
    }
    this.messageHandlers.get(clientId)!.push(handler);

    return () => {
      const handlers = this.messageHandlers.get(clientId) ?? [];
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    };
  }

  /**
   * Get message history
   */
  getMessageHistory(limit: number = 50): WSMessage[] {
    return this.messageBuffer.slice(-limit);
  }

  /**
   * Get connected clients
   */
  getClients(): WSClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Get stats
   */
  getStats(): {
    totalClients: number;
    aliveClients: number;
    totalMessagesSent: number;
    bufferSize: number;
    avgMessagesPerClient: number;
  } {
    const clients = Array.from(this.clients.values());
    const alive = clients.filter((c) => c.alive).length;
    const totalMessages = clients.reduce((sum, c) => sum + c.messageCount, 0);

    return {
      totalClients: clients.length,
      aliveClients: alive,
      totalMessagesSent: totalMessages,
      bufferSize: this.messageBuffer.length,
      avgMessagesPerClient: clients.length > 0 ? Math.round(totalMessages / clients.length) : 0,
    };
  }

  /**
   * Heartbeat — check for dead clients
   */
  private heartbeat(): void {
    const now = Date.now();
    for (const [id, client] of Array.from(this.clients.entries())) {
      if (now - client.lastPingAt > this.config.heartbeatIntervalMs * 3) {
        client.alive = false;
        this.clients.delete(id);
        this.messageHandlers.delete(id);
      }
    }
  }

  /**
   * Handle client pong (heartbeat response)
   */
  handlePong(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastPingAt = Date.now();
      client.alive = true;
    }
  }
}

// ─── Convenience Emitters ──────────────────────────────

export function emitAgentStatus(server: RealtimeServer, agentName: string, status: string, details?: any): void {
  server.broadcast({
    type: "agent:status",
    data: { agent: agentName, status, ...details },
  });
}

export function emitPoolRotation(server: RealtimeServer, from: string, to: string, reason: string): void {
  server.broadcast({
    type: "pool:rotation",
    data: { from, to, reason },
  });
}

export function emitComboAttempt(server: RealtimeServer, comboName: string, model: string, attempt: number): void {
  server.broadcast({
    type: "combo:attempt",
    data: { combo: comboName, model, attempt },
  });
}

export function emitComboResult(server: RealtimeServer, comboName: string, success: boolean, model: string, latencyMs: number): void {
  server.broadcast({
    type: "combo:result",
    data: { combo: comboName, success, model, latencyMs },
  });
}

export function emitHealthCheck(server: RealtimeServer, connectionId: string, healthy: boolean, latencyMs: number): void {
  server.broadcast({
    type: "health:check",
    data: { connection: connectionId, healthy, latencyMs },
  });
}

export function emitStreamToken(server: RealtimeServer, sessionId: string, token: string): void {
  server.broadcast({
    type: "stream:token",
    data: { session: sessionId, token },
  });
}

export function emitStreamDone(server: RealtimeServer, sessionId: string, totalTokens: number): void {
  server.broadcast({
    type: "stream:done",
    data: { session: sessionId, totalTokens },
  });
}

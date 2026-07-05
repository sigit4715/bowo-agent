/**
 * websocket.ts — EventEmitter-based WebSocket abstraction for real-time
 * dashboard updates. No external packages required; designed to be wrapped
 * with a real `ws` server later.
 */

import { EventEmitter } from 'node:events';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface WSMessage {
  type: string;
  channel: string;
  data: any;
  timestamp: string;
}

export interface WSClient {
  id: string;
  subscribedChannels: Set<string>;
  lastSeen: string;
}

// ── Built-in channels ──────────────────────────────────────────────────────

const DEFAULT_CHANNELS = [
  'pipeline:progress',
  'agent:status',
  'system:alerts',
  'metrics:update',
];

const MAX_HISTORY = 100;

// ── DashboardWebSocket ─────────────────────────────────────────────────────

export class DashboardWebSocket extends EventEmitter {
  private port: number;
  private clients: Map<string, WSClient> = new Map();
  private messageHistory: Map<string, WSMessage[]> = new Map();
  private channels: Set<string> = new Set(DEFAULT_CHANNELS);
  private messagesSent = 0;
  private startedAt: string | null = null;

  constructor(port: number = 8080) {
    super();
    this.port = port;

    // Pre-initialise history buffers for built-in channels
    for (const ch of this.channels) {
      this.messageHistory.set(ch, []);
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /** Start the WebSocket server (currently logs startup; ready for `ws` wrap). */
  start(): void {
    this.startedAt = new Date().toISOString();
    console.log(
      `[DashboardWebSocket] Started on port ${this.port} at ${this.startedAt}`,
    );
    console.log(
      `[DashboardWebSocket] Built-in channels: ${DEFAULT_CHANNELS.join(', ')}`,
    );
  }

  /** Stop the server and clean up state. */
  stop(): void {
    this.clients.clear();
    this.messageHistory.clear();
    for (const ch of this.channels) {
      this.messageHistory.set(ch, []);
    }
    this.messagesSent = 0;
    this.startedAt = null;
    console.log('[DashboardWebSocket] Stopped');
  }

  // ── Subscription management ─────────────────────────────────────────────

  /** Subscribe a client to a channel (auto-creates channel if needed). */
  subscribe(clientId: string, channel: string): void {
    let client = this.clients.get(clientId);
    if (!client) {
      client = {
        id: clientId,
        subscribedChannels: new Set(),
        lastSeen: new Date().toISOString(),
      };
      this.clients.set(clientId, client);
      this.emit('client:connect', client);
    }

    client.subscribedChannels.add(channel);
    client.lastSeen = new Date().toISOString();

    // Ensure channel exists
    if (!this.channels.has(channel)) {
      this.channels.add(channel);
      this.messageHistory.set(channel, []);
    }

    this.emit('channel:subscribe', { clientId, channel });
  }

  /** Unsubscribe a client from a channel. */
  unsubscribe(clientId: string, channel: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    client.subscribedChannels.delete(channel);
    client.lastSeen = new Date().toISOString();
  }

  // ── Messaging ───────────────────────────────────────────────────────────

  /** Broadcast a message to all clients subscribed to a channel. */
  broadcast(channel: string, message: any): void {
    const wsMessage: WSMessage = {
      type: 'broadcast',
      channel,
      data: message,
      timestamp: new Date().toISOString(),
    };

    // Store in history
    this.addToHistory(channel, wsMessage);

    // Deliver to subscribed clients
    for (const client of this.clients.values()) {
      if (client.subscribedChannels.has(channel)) {
        client.lastSeen = new Date().toISOString();
        this.messagesSent++;
        this.emit('message:sent', { clientId: client.id, channel, message: wsMessage });
      }
    }
  }

  /** Send a message to a specific client. */
  sendToClient(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const wsMessage: WSMessage = {
      type: 'direct',
      channel: 'system:direct',
      data: message,
      timestamp: new Date().toISOString(),
    };

    client.lastSeen = new Date().toISOString();
    this.messagesSent++;
    this.emit('message:sent', { clientId, channel: 'system:direct', message: wsMessage });
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  /** Get all connected clients. */
  getClients(): WSClient[] {
    return Array.from(this.clients.values());
  }

  /** Get all active channels. */
  getChannels(): string[] {
    return Array.from(this.channels);
  }

  /** Get message history for a channel (most recent first). */
  getMessageHistory(channel: string, limit: number = 50): WSMessage[] {
    const history = this.messageHistory.get(channel) ?? [];
    return history.slice(-limit).reverse();
  }

  /** Get server statistics. */
  getStats(): { clients: number; channels: number; messagesSent: number; uptime: string } {
    const now = new Date();
    let uptime = 'not started';
    if (this.startedAt) {
      const diff = now.getTime() - new Date(this.startedAt).getTime();
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      if (hours > 0) {
        uptime = `${hours}h ${minutes % 60}m ${seconds % 60}s`;
      } else if (minutes > 0) {
        uptime = `${minutes}m ${seconds % 60}s`;
      } else {
        uptime = `${seconds}s`;
      }
    }
    return {
      clients: this.clients.size,
      channels: this.channels.size,
      messagesSent: this.messagesSent,
      uptime,
    };
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private addToHistory(channel: string, message: WSMessage): void {
    if (!this.messageHistory.has(channel)) {
      this.messageHistory.set(channel, []);
    }
    const history = this.messageHistory.get(channel)!;
    history.push(message);
    // Keep only last MAX_HISTORY messages
    if (history.length > MAX_HISTORY) {
      history.splice(0, history.length - MAX_HISTORY);
    }
  }
}

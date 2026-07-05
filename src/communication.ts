/**
 * BOWO Communication — Inter-Agent Messaging System
 *
 * Event-based communication between agents.
 * Supports direct messages, broadcasts, and request/response patterns.
 */

import { EventEmitter } from "node:events";

// ─── Types ──────────────────────────────────────────────

export enum MessageType {
  TASK = "task",
  RESULT = "result",
  ERROR = "error",
  QUESTION = "question",
  ANSWER = "answer",
  STATUS = "status",
  BROADCAST = "broadcast",
}

export interface AgentMessage {
  id: string;
  type: MessageType;
  from: string;
  to: string | "*"; // * = broadcast
  content: unknown;
  timestamp: string;
  replyTo?: string;
  metadata: Record<string, unknown>;
}

// ─── Communication Bus ──────────────────────────────────

export class Communication extends EventEmitter {
  private messages: AgentMessage[] = [];
  private counter = 0;

  constructor() {
    super();
  }

  /**
   * Send a message from one agent to another.
   */
  send(
    type: MessageType,
    from: string,
    to: string,
    content: unknown,
    options: { replyTo?: string; metadata?: Record<string, unknown> } = {}
  ): AgentMessage {
    this.counter++;
    const msg: AgentMessage = {
      id: `msg-${String(this.counter).padStart(5, "0")}`,
      type,
      from,
      to,
      content,
      timestamp: new Date().toISOString(),
      replyTo: options.replyTo,
      metadata: options.metadata ?? {},
    };

    this.messages.push(msg);
    this.emit("message", msg);

    if (to === "*") {
      this.emit("broadcast", msg);
    } else {
      this.emit(`to:${to}`, msg);
    }

    return msg;
  }

  /**
   * Send a task from orchestrator to an agent.
   */
  sendTask(
    from: string,
    to: string,
    task: { description: string; context: unknown; priority: number }
  ): AgentMessage {
    return this.send(MessageType.TASK, from, to, task);
  }

  /**
   * Send result back from agent.
   */
  sendResult(
    from: string,
    to: string,
    result: unknown,
    replyTo?: string
  ): AgentMessage {
    return this.send(MessageType.RESULT, from, to, result, { replyTo });
  }

  /**
   * Broadcast a status update to all agents.
   */
  broadcast(from: string, content: unknown): AgentMessage {
    return this.send(MessageType.BROADCAST, from, "*", content);
  }

  /**
   * Get all messages for a specific agent.
   */
  getMessagesFor(agent: string): AgentMessage[] {
    return this.messages.filter(
      (m) => m.to === agent || m.to === "*" || m.from === agent
    );
  }

  /**
   * Get all messages in the system.
   */
  getAll(): AgentMessage[] {
    return [...this.messages];
  }

  /**
   * Get conversation between two agents.
   */
  getConversation(agent1: string, agent2: string): AgentMessage[] {
    return this.messages.filter(
      (m) =>
        (m.from === agent1 && m.to === agent2) ||
        (m.from === agent2 && m.to === agent1)
    );
  }
}

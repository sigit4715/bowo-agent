/**
 * 🏢 Agent Office — 3D Visualization Controller
 *
 * Connects the 3D Agent Office UI to real BOWO agent states.
 * Serves the HTML dashboard and provides WebSocket real-time updates.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as http from "node:http";

// ─── Types ──────────────────────────────────────────────

export type AgentOfficeStatus = "active" | "idle" | "error" | "offline";

export interface AgentOfficeState {
  id: string;
  name: string;
  icon: string;
  role: string;
  color: string;
  status: AgentOfficeStatus;
  currentTask: string | null;
  tasksCompleted: number;
  lastActive?: string;
  log: Array<{ time: string; message: string }>;
}

export interface OfficeSnapshot {
  timestamp: string;
  agents: AgentOfficeState[];
  stats: {
    active: number;
    idle: number;
    error: number;
    totalTasks: number;
  };
}

// ─── Agent Office Controller ───────────────────────────

export class AgentOffice {
  private agents: Map<string, AgentOfficeState> = new Map();
  private htmlPath: string;
  private subscribers: Array<(snapshot: OfficeSnapshot) => void> = [];

  constructor() {
    this.htmlPath = path.resolve(__dirname, "agent-office.html");

    // Initialize 9 agents
    const agentDefs = [
      { id: "planner", name: "Planner", icon: "📋", role: "Task Planning & Routing", color: "#6c5ce7" },
      { id: "architect", name: "Architect", icon: "🏗️", role: "System Design & Architecture", color: "#a29bfe" },
      { id: "backend", name: "Backend", icon: "⚙️", role: "API & Server Development", color: "#00b894" },
      { id: "frontend", name: "Frontend", icon: "🎨", role: "UI/UX Development", color: "#fd79a8" },
      { id: "qa", name: "QA Engineer", icon: "🧪", role: "Testing & Quality Assurance", color: "#fdcb6e" },
      { id: "security", name: "Security", icon: "🔒", role: "Security Auditing", color: "#e17055" },
      { id: "debug", name: "Debugger", icon: "🐛", role: "Bug Detection & Fixing", color: "#00cec9" },
      { id: "reporter", name: "Reporter", icon: "📊", role: "Reporting & Analytics", color: "#74b9ff" },
      { id: "devops", name: "DevOps", icon: "🚀", role: "Deployment & Infrastructure", color: "#55efc4" },
    ];

    for (const def of agentDefs) {
      this.agents.set(def.id, {
        ...def,
        status: "idle",
        currentTask: null,
        tasksCompleted: 0,
        log: [],
      });
    }
  }

  /**
   * Update agent status
   */
  updateAgent(id: string, updates: Partial<Pick<AgentOfficeState, "status" | "currentTask">>): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    if (updates.status) agent.status = updates.status;
    if (updates.currentTask !== undefined) agent.currentTask = updates.currentTask;
    if (updates.status === "active") agent.lastActive = new Date().toISOString();
    if (updates.status === "idle" && agent.currentTask) {
      agent.tasksCompleted++;
      agent.log.push({
        time: new Date().toLocaleTimeString(),
        message: `Completed: ${agent.currentTask}`,
      });
    }
    if (updates.status === "active" && updates.currentTask) {
      agent.log.push({
        time: new Date().toLocaleTimeString(),
        message: `Started: ${updates.currentTask}`,
      });
    }

    this.notifySubscribers();
  }

  /**
   * Get current snapshot
   */
  getSnapshot(): OfficeSnapshot {
    const agents = Array.from(this.agents.values());
    return {
      timestamp: new Date().toISOString(),
      agents,
      stats: {
        active: agents.filter((a) => a.status === "active").length,
        idle: agents.filter((a) => a.status === "idle").length,
        error: agents.filter((a) => a.status === "error").length,
        totalTasks: agents.reduce((s, a) => s + a.tasksCompleted, 0),
      },
    };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(callback: (snapshot: OfficeSnapshot) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      const idx = this.subscribers.indexOf(callback);
      if (idx >= 0) this.subscribers.splice(idx, 1);
    };
  }

  private notifySubscribers(): void {
    const snapshot = this.getSnapshot();
    for (const cb of this.subscribers) {
      cb(snapshot);
    }
  }

  /**
   * Get the HTML dashboard
   */
  getHTML(): string {
    if (fs.existsSync(this.htmlPath)) {
      return fs.readFileSync(this.htmlPath, "utf-8");
    }
    return "<h1>Agent Office HTML not found</h1>";
  }

  /**
   * Create HTTP server for the office dashboard
   */
  createServer(port: number = 3003): http.Server {
    const server = http.createServer((req, res) => {
      if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(this.getHTML());
      } else if (req.url === "/api/snapshot") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(this.getSnapshot()));
      } else if (req.url === "/api/agents") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(Array.from(this.agents.values())));
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    server.listen(port, () => {
      console.log(`🏢 Agent Office running at http://localhost:${port}`);
    });

    return server;
  }
}

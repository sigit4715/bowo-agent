/**
 * 📊 BOWO Web Dashboard — Visual monitoring & management
 *
 * Express-based dashboard for monitoring agents, pools, combos, and system health.
 */

import * as http from "node:http";

// ─── Types ──────────────────────────────────────────────

export interface DashboardConfig {
  port: number;
  host: string;
  title: string;
  refreshIntervalMs: number;
}

export interface DashboardData {
  system: {
    uptime: number;
    version: string;
    nodeVersion: string;
    platform: string;
    memory: { used: number; total: number; percentage: number };
  };
  agents: Array<{
    name: string;
    type: string;
    status: string;
    lastRun?: string;
    totalRuns: number;
    avgLatencyMs: number;
  }>;
  pools: {
    totalKeys: number;
    activeKeys: number;
    disabledKeys: number;
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
  };
  combos: Array<{
    name: string;
    strategy: string;
    models: number;
    totalAttempts: number;
    successRate: number;
  }>;
  router: {
    totalNodes: number;
    totalConnections: number;
    healthyConnections: number;
    unhealthyConnections: number;
  };
  recentActivity: Array<{
    timestamp: string;
    type: string;
    message: string;
    status: string;
  }>;
}

// ─── Dashboard ──────────────────────────────────────────

export class Dashboard {
  private config: DashboardConfig;
  private server?: http.Server;
  private startTime: number;
  private dataProviders: Map<string, () => any> = new Map();
  private activityLog: Array<{ timestamp: string; type: string; message: string; status: string }> = [];

  constructor(config?: Partial<DashboardConfig>) {
    this.config = {
      port: 3001,
      host: "0.0.0.0",
      title: "BOWO Dashboard",
      refreshIntervalMs: 5000,
      ...config,
    };
    this.startTime = Date.now();
  }

  /**
   * Register a data provider for a section
   */
  registerDataProvider(name: string, provider: () => any): void {
    this.dataProviders.set(name, provider);
  }

  /**
   * Log an activity event
   */
  logActivity(type: string, message: string, status: string): void {
    this.activityLog.unshift({
      timestamp: new Date().toISOString(),
      type,
      message,
      status,
    });
    if (this.activityLog.length > 100) {
      this.activityLog = this.activityLog.slice(0, 100);
    }
  }

  /**
   * Start the dashboard server
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        console.log(`📊 Dashboard running at http://${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the dashboard server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    switch (url.pathname) {
      case "/":
        this.serveHTML(res);
        break;
      case "/api/data":
        this.serveData(res);
        break;
      case "/api/agents":
        this.serveSection(res, "agents");
        break;
      case "/api/pools":
        this.serveSection(res, "pools");
        break;
      case "/api/combos":
        this.serveSection(res, "combos");
        break;
      case "/api/router":
        this.serveSection(res, "router");
        break;
      case "/api/activity":
        this.serveJSON(res, this.activityLog.slice(0, 50));
        break;
      case "/api/health":
        this.serveJSON(res, { status: "ok", uptime: Date.now() - this.startTime });
        break;
      default:
        res.writeHead(404);
        res.end("Not Found");
    }
  }

  private serveHTML(res: http.ServerResponse): void {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.config.title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f23; color: #e0e0e0; }
    .header { background: linear-gradient(135deg, #1a1a3e, #2d1b69); padding: 20px 30px; border-bottom: 2px solid #6c5ce7; }
    .header h1 { font-size: 24px; color: #a29bfe; }
    .header .subtitle { color: #636e72; font-size: 14px; margin-top: 4px; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 20px; }
    .card { background: #1a1a2e; border: 1px solid #2d2d44; border-radius: 12px; padding: 20px; }
    .card h2 { color: #a29bfe; font-size: 16px; margin-bottom: 15px; display: flex; align-items: center; gap: 8px; }
    .stat { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #2d2d44; }
    .stat:last-child { border-bottom: none; }
    .stat .label { color: #636e72; }
    .stat .value { color: #dfe6e9; font-weight: 600; }
    .stat .value.good { color: #00b894; }
    .stat .value.warn { color: #fdcb6e; }
    .stat .value.bad { color: #e17055; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .badge.green { background: #00b89420; color: #00b894; }
    .badge.yellow { background: #fdcb6e20; color: #fdcb6e; }
    .badge.red { background: #e1705520; color: #e17055; }
    .badge.blue { background: #74b9ff20; color: #74b9ff; }
    .activity { max-height: 300px; overflow-y: auto; }
    .activity-item { padding: 8px 0; border-bottom: 1px solid #2d2d44; font-size: 13px; }
    .activity-item .time { color: #636e72; font-size: 11px; }
    .refresh { color: #636e72; font-size: 12px; text-align: center; margin-top: 20px; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .live { animation: pulse 2s infinite; color: #00b894; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🤖 ${this.config.title}</h1>
    <div class="subtitle">Multi-Agent AI System Monitor</div>
  </div>
  <div class="container">
    <div class="grid" id="dashboard"></div>
    <div class="refresh"><span class="live">●</span> Auto-refresh every ${this.config.refreshIntervalMs / 1000}s</div>
  </div>
  <script>
    async function refresh() {
      try {
        const res = await fetch('/api/data');
        const data = await res.json();
        render(data);
      } catch (e) {
        console.error('Failed to fetch data:', e);
      }
    }

    function render(data) {
      const grid = document.getElementById('dashboard');
      grid.innerHTML = \`
        <div class="card">
          <h2>🖥️ System</h2>
          <div class="stat"><span class="label">Uptime</span><span class="value">\${formatUptime(data.system.uptime)}</span></div>
          <div class="stat"><span class="label">Version</span><span class="value">\${data.system.version}</span></div>
          <div class="stat"><span class="label">Memory</span><span class="value \${data.system.memory.percentage > 80 ? 'bad' : 'good'}">\${data.system.memory.used}MB / \${data.system.memory.total}MB</span></div>
          <div class="stat"><span class="label">Platform</span><span class="value">\${data.system.platform}</span></div>
        </div>
        <div class="card">
          <h2>🤖 Agents</h2>
          \${data.agents.map(a => \`
            <div class="stat">
              <span class="label">\${a.name}</span>
              <span class="value"><span class="badge \${a.status === 'ready' ? 'green' : 'yellow'}">\${a.status}</span> \${a.totalRuns} runs</span>
            </div>
          \`).join('')}
        </div>
        <div class="card">
          <h2>🔄 Provider Pool</h2>
          <div class="stat"><span class="label">Active Keys</span><span class="value good">\${data.pools.activeKeys}</span></div>
          <div class="stat"><span class="label">Disabled</span><span class="value \${data.pools.disabledKeys > 0 ? 'warn' : ''}">\${data.pools.disabledKeys}</span></div>
          <div class="stat"><span class="label">Total Requests</span><span class="value">\${data.pools.totalRequests.toLocaleString()}</span></div>
          <div class="stat"><span class="label">Total Tokens</span><span class="value">\${data.pools.totalTokens.toLocaleString()}</span></div>
          <div class="stat"><span class="label">Total Cost</span><span class="value">$\${data.pools.totalCost.toFixed(4)}</span></div>
        </div>
        <div class="card">
          <h2>🔗 Router</h2>
          <div class="stat"><span class="label">Provider Nodes</span><span class="value">\${data.router.totalNodes}</span></div>
          <div class="stat"><span class="label">Connections</span><span class="value">\${data.router.totalConnections}</span></div>
          <div class="stat"><span class="label">Healthy</span><span class="value good">\${data.router.healthyConnections}</span></div>
          <div class="stat"><span class="label">Unhealthy</span><span class="value \${data.router.unhealthyConnections > 0 ? 'bad' : ''}">\${data.router.unhealthyConnections}</span></div>
        </div>
        <div class="card" style="grid-column: span 2;">
          <h2>📋 Recent Activity</h2>
          <div class="activity">
            \${data.recentActivity.map(a => \`
              <div class="activity-item">
                <span class="time">\${new Date(a.timestamp).toLocaleTimeString()}</span>
                <span class="badge \${a.status === 'success' ? 'green' : a.status === 'error' ? 'red' : 'blue'}">\${a.type}</span>
                \${a.message}
              </div>
            \`).join('') || '<div class="activity-item">No recent activity</div>'}
          </div>
        </div>
      \`;
    }

    function formatUptime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      const d = Math.floor(h / 24);
      if (d > 0) return \`\${d}d \${h % 24}h\`;
      if (h > 0) return \`\${h}h \${m % 60}m\`;
      return \`\${m}m \${s % 60}s\`;
    }

    refresh();
    setInterval(refresh, ${this.config.refreshIntervalMs});
  </script>
</body>
</html>`;

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  }

  private serveData(res: http.ServerResponse): void {
    const data: DashboardData = {
      system: {
        uptime: Date.now() - this.startTime,
        version: "3.8.0",
        nodeVersion: process.version,
        platform: `${process.platform} ${process.arch}`,
        memory: (() => {
          const mem = process.memoryUsage();
          return {
            used: Math.round(mem.heapUsed / 1024 / 1024),
            total: Math.round(mem.heapTotal / 1024 / 1024),
            percentage: Math.round((mem.heapUsed / mem.heapTotal) * 100),
          };
        })(),
      },
      agents: this.dataProviders.get("agents")?.() ?? [],
      pools: this.dataProviders.get("pools")?.() ?? {
        totalKeys: 0, activeKeys: 0, disabledKeys: 0,
        totalRequests: 0, totalTokens: 0, totalCost: 0,
      },
      combos: this.dataProviders.get("combos")?.() ?? [],
      router: this.dataProviders.get("router")?.() ?? {
        totalNodes: 0, totalConnections: 0,
        healthyConnections: 0, unhealthyConnections: 0,
      },
      recentActivity: this.activityLog.slice(0, 20),
    };

    this.serveJSON(res, data);
  }

  private serveSection(res: http.ServerResponse, section: string): void {
    const provider = this.dataProviders.get(section);
    this.serveJSON(res, provider?.() ?? {});
  }

  private serveJSON(res: http.ServerResponse, data: any): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }
}

/**
 * 🤖 BOWO ↔ Hermes Integration
 *
 * Connect BOWO agents to Hermes Agent ecosystem.
 * - Use Hermes proxy as LLM backend
 * - Spawn Hermes instances as agent executors
 * - Share memory between BOWO and Hermes
 */

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// ─── Types ──────────────────────────────────────────────

export interface HermesConfig {
  proxyUrl?: string;        // Hermes proxy URL (e.g., http://localhost:3456/v1)
  cliPath?: string;         // Path to hermes CLI (default: "hermes")
  workDir?: string;         // Working directory for Hermes instances
  model?: string;           // Model to use via Hermes
  profile?: string;         // Hermes profile name
  autoDetect: boolean;      // Auto-detect Hermes proxy
}

export interface HermesStatus {
  installed: boolean;
  version: string | null;
  proxyRunning: boolean;
  proxyUrl: string | null;
  gatewayRunning: boolean;
}

// ─── Hermes Integration ─────────────────────────────────

export class HermesIntegration {
  private config: HermesConfig;
  private status: HermesStatus | null = null;

  constructor(config: Partial<HermesConfig> = {}) {
    this.config = {
      proxyUrl: config.proxyUrl,
      cliPath: config.cliPath ?? "hermes",
      workDir: config.workDir ?? process.cwd(),
      model: config.model,
      profile: config.profile,
      autoDetect: config.autoDetect ?? true,
    };
  }

  // ── Detection ──

  /**
   * Detect Hermes installation and status.
   */
  async detect(): Promise<HermesStatus> {
    const status: HermesStatus = {
      installed: false,
      version: null,
      proxyRunning: false,
      proxyUrl: null,
      gatewayRunning: false,
    };

    // Check if hermes CLI is installed
    try {
      const output = execSync(`${this.config.cliPath} --version 2>&1`, {
        encoding: "utf-8",
        timeout: 5000,
      });
      status.installed = true;
      status.version = output.trim().replace(/[^\d.]/g, "");
    } catch {
      status.installed = false;
    }

    // Check if proxy is running (common ports)
    const proxyPorts = [3456, 3000, 8080];
    for (const port of proxyPorts) {
      try {
        const res = await fetch(`http://localhost:${port}/v1/models`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          status.proxyRunning = true;
          status.proxyUrl = `http://localhost:${port}/v1`;
          break;
        }
      } catch {
        // not running on this port
      }
    }

    // Check gateway status
    if (status.installed) {
      try {
        const output = execSync(`${this.config.cliPath} gateway status 2>&1`, {
          encoding: "utf-8",
          timeout: 5000,
        });
        status.gatewayRunning = output.toLowerCase().includes("running");
      } catch {
        // gateway not running
      }
    }

    this.status = status;
    return status;
  }

  /**
   * Get or auto-detect proxy URL.
   */
  getProxyUrl(): string | null {
    if (this.config.proxyUrl) return this.config.proxyUrl;
    if (this.status?.proxyUrl) return this.status.proxyUrl;
    return null;
  }

  // ── LLM via Hermes Proxy ──

  /**
   * Get LLM config that routes through Hermes proxy.
   */
  getLLMConfig(): { provider: string; baseUrl: string; model: string; apiKey: string } {
    const proxyUrl = this.getProxyUrl();

    return {
      provider: "openai",  // Hermes proxy is OpenAI-compatible
      baseUrl: proxyUrl ?? "http://localhost:3456/v1",
      model: this.config.model ?? "hermes-auto",
      apiKey: "hermes-proxy",  // Proxy handles auth
    };
  }

  // ── Agent Execution via Hermes CLI ──

  /**
   * Execute a task using Hermes CLI (subprocess).
   * Returns the agent's response as text.
   */
  async executeWithHermes(
    task: string,
    options: {
      timeout?: number;
      skills?: string[];
      model?: string;
      workDir?: string;
    } = {}
  ): Promise<{ output: string; exitCode: number; duration: number }> {
    const start = Date.now();
    const timeout = options.timeout ?? 120_000;

    // Build command
    const args: string[] = ["chat", "-q", task, "-Q"]; // -Q = quiet (no banner)

    if (options.model) {
      args.push("-m", options.model);
    } else if (this.config.model) {
      args.push("-m", this.config.model);
    }

    if (this.config.profile) {
      args.push("-p", this.config.profile);
    }

    if (options.skills?.length) {
      args.push("-s", options.skills.join(","));
    }

    return new Promise((resolve) => {
      const proc = spawn(this.config.cliPath, args, {
        cwd: options.workDir ?? this.config.workDir,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => { stdout += data.toString(); });
      proc.stderr.on("data", (data) => { stderr += data.toString(); });

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        resolve({
          output: stdout || stderr || "Hermes execution timed out",
          exitCode: -1,
          duration: Date.now() - start,
        });
      }, timeout);

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          output: stdout || stderr || "(no output)",
          exitCode: code ?? -1,
          duration: Date.now() - start,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          output: `Failed to start Hermes: ${err.message}`,
          exitCode: -1,
          duration: Date.now() - start,
        });
      });
    });
  }

  /**
   * Execute with Hermes in background (returns handle).
   */
  executeWithHermesBackground(
    task: string,
    options: { skills?: string[]; model?: string; workDir?: string } = {}
  ): { pid: number | null; kill: () => void } {
    const args: string[] = ["chat", "-q", task];

    if (options.model) args.push("-m", options.model);
    if (this.config.profile) args.push("-p", this.config.profile);
    if (options.skills?.length) args.push("-s", options.skills.join(","));

    const proc = spawn(this.config.cliPath, args, {
      cwd: options.workDir ?? this.config.workDir,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });

    proc.unref();

    return {
      pid: proc.pid,
      kill: () => {
        try { process.kill(proc.pid!, "SIGTERM"); } catch {}
      },
    };
  }

  // ── Hermes Session Bridge ──

  /**
   * Search Hermes sessions for context.
   */
  searchSessions(query: string, limit: number = 5): string {
    try {
      const output = execSync(
        `${this.config.cliPath} sessions list --json 2>/dev/null | head -${limit * 10}`,
        { encoding: "utf-8", timeout: 10_000 }
      );
      return output;
    } catch {
      return "No sessions found or Hermes not accessible";
    }
  }

  /**
   * Resume a Hermes session.
   */
  resumeSession(sessionId: string): Promise<{ output: string; exitCode: number }> {
    return new Promise((resolve) => {
      const proc = spawn(this.config.cliPath, ["--resume", sessionId], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d) => { stdout += d.toString(); });
      proc.stderr.on("data", (d) => { stderr += d.toString(); });

      proc.on("close", (code) => {
        resolve({ output: stdout || stderr, exitCode: code ?? -1 });
      });
    });
  }

  // ── Skills Sharing ──

  /**
   * Export BOWO agent as a Hermes skill.
   */
  exportAsSkill(agentName: string, skillDir: string): void {
    const skillContent = `---
name: bowo-${agentName}
description: "BOWO ${agentName} agent — generated from BOWO Agent System"
version: 1.0.0
author: BOWO
---

# BOWO ${agentName} Agent

This skill was auto-generated from the BOWO Agent System.

## Usage

When this skill is loaded, you act as the BOWO ${agentName} agent.

\`\`\`bash
npx tsx src/index.ts --task "your task" --agents ${agentName}
\`\`\`

## Agent Capabilities

The ${agentName} agent specializes in:
- Task execution for ${agentName} domain
- Integration with BOWO pipeline
- Memory sharing across agents
`;

    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillContent);
    console.log(`✅ Exported bowo-${agentName} skill to ${skillDir}`);
  }

  // ── Status Report ──

  /**
   * Get full integration status.
   */
  async getStatus(): Promise<{
    hermes: HermesStatus;
    proxy: string | null;
    config: HermesConfig;
    recommendations: string[];
  }> {
    const status = await this.detect();
    const proxy = this.getProxyUrl();
    const recommendations: string[] = [];

    if (!status.installed) {
      recommendations.push("Install Hermes: curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash");
    }
    if (!status.proxyRunning) {
      recommendations.push("Start Hermes proxy: hermes proxy");
    }
    if (!status.gatewayRunning) {
      recommendations.push("Start Hermes gateway: hermes gateway install && hermes gateway start");
    }
    if (status.installed && status.proxyRunning && status.gatewayRunning) {
      recommendations.push("✅ Full integration ready! BOWO can use Hermes for LLM + execution.");
    }

    return {
      hermes: status,
      proxy,
      config: this.config,
      recommendations,
    };
  }
}

// ─── Quick Setup ────────────────────────────────────────

/**
 * Quick setup: configure BOWO to use Hermes as LLM backend.
 */
export async function setupHermesIntegration(): Promise<void> {
  const hermes = new HermesIntegration();
  const status = await hermes.detect();

  console.log("\n🤖 BOWO ↔ Hermes Integration Setup\n");
  console.log(`  Hermes installed: ${status.installed ? "✅" : "❌"}`);
  console.log(`  Version: ${status.version ?? "N/A"}`);
  console.log(`  Proxy running: ${status.proxyRunning ? `✅ ${status.proxyUrl}` : "❌"}`);
  console.log(`  Gateway running: ${status.gatewayRunning ? "✅" : "❌"}`);

  if (status.installed && status.proxyRunning) {
    const config = hermes.getLLMConfig();
    console.log("\n📋 Add to your .env:");
    console.log(`  BOWO_LLM_PROVIDER=${config.provider}`);
    console.log(`  BOWO_LLM_BASE_URL=${config.baseUrl}`);
    console.log(`  BOWO_LLM_MODEL=${config.model}`);
    console.log(`  BOWO_LLM_API_KEY=${config.apiKey}`);
    console.log("\nOr run:");
    console.log(`  BOWO_LLM_BASE_URL=${config.baseUrl} npx tsx src/cli.ts`);
  } else {
    console.log("\n⚠️ Hermes not fully available.");
    if (!status.installed) {
      console.log("  Install: curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash");
    }
    if (!status.proxyRunning) {
      console.log("  Start proxy: hermes proxy");
    }
  }
}

/**
 * 🤖 BOWO Interactive CLI — Chat REPL
 *
 * Talk to BOWO directly from the terminal.
 * Natural language commands → agent execution.
 */

import "dotenv/config";
import * as readline from "node:readline";
import { Orchestrator } from "./orchestrator.js";
import { getProviders, detectProvider } from "./llm.js";
import { HermesIntegration } from "./hermes.js";

// ─── Banner ──

const BANNER = `
  ╔══════════════════════════════════════════════╗
  ║       🤖 BOWO Interactive Chat v1.0          ║
  ║  Backend Orchestrator for Workflow           ║
  ║              Optimization                    ║
  ╠══════════════════════════════════════════════╣
  ║  Type a task and BOWO will execute it.       ║
  ║  Commands:                                   ║
  ║    /status    — Show system status           ║
  ║    /agents    — List all agents              ║
  ║    /providers — List LLM providers           ║
  ║    /hermes    — Hermes integration status    ║
  ║    /memory    — Show memory summary          ║
  ║    /history   — Show recent pipelines        ║
  ║    /help      — Show this help               ║
  ║    /quit      — Exit                         ║
  ╚══════════════════════════════════════════════╝
`;

// ─── Main ──

async function main() {
  console.log(BANNER);

  const bowo = new Orchestrator({ logLevel: "warn" });
  const status = bowo.getStatus();

  console.log(`🤖 ${status.agents.length} agents loaded`);
  console.log(`🧠 LLM: ${status.llm.available ? `🟢 ${status.llm.model}` : "🔴 Offline (rule-based)"}`);
  console.log(`💾 Memory: ${status.memory.totalEntries} entries\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "🤖 bowo> ",
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    // Handle commands
    if (input.startsWith("/")) {
      await handleCommand(input, bowo);
      rl.prompt();
      return;
    }

    // Execute as task
    console.log(`\n📋 Processing: "${input}"\n`);
    const startTime = Date.now();

    try {
      const result = await bowo.execute(input);
      const duration = Date.now() - startTime;

      console.log(`\n✅ Done in ${duration}ms`);
      console.log(`📦 ${result.totalArtifacts} artifacts generated`);

      if (result.agentResults.length > 0) {
        console.log("\nAgents:");
        for (const ar of result.agentResults) {
          const icon = ar.status === "completed" ? "✅" : "❌";
          console.log(`  ${icon} ${ar.agent}`);
        }
      }
    } catch (err) {
      console.error(`\n❌ Error: ${err}`);
    }

    console.log();
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\n🤖 BOWO signing off! 👋\n");
    process.exit(0);
  });
}

// ─── Commands ──

async function handleCommand(cmd: string, bowo: Orchestrator): Promise<void> {
  const command = cmd.split(" ")[0].toLowerCase();

  switch (command) {
    case "/status": {
      const s = bowo.getStatus();
      console.log("\n📊 System Status:");
      console.log(`  Agents: ${s.agents.length} (${s.agents.join(", ")})`);
      console.log(`  LLM: ${s.llm.available ? `🟢 ${s.llm.model}` : "🔴 Offline"}`);
      console.log(`  Memory: ${s.memory.totalEntries} entries`);
      console.log(`  Pipelines: ${s.pipelines}`);
      if (s.memory.lastUpdated) {
        console.log(`  Last activity: ${s.memory.lastUpdated}`);
      }
      break;
    }

    case "/agents": {
      const s = bowo.getStatus();
      console.log("\n🤖 Registered Agents:\n");
      const emojis: Record<string, string> = {
        planner: "📋", architect: "🏗", backend: "⚙️", frontend: "🎨",
        qa: "✅", debug: "🔍", security: "🔒", devops: "🚀", reporter: "📊",
      };
      for (const name of s.agents) {
        console.log(`  ${emojis[name] ?? "🤖"} ${name}`);
      }
      break;
    }

    case "/memory": {
      const mem = bowo.getMemory();
      const summary = mem.getSummary();
      console.log("\n💾 Memory Summary:");
      console.log(`  Total entries: ${summary.totalEntries}`);
      console.log("  By type:");
      for (const [type, count] of Object.entries(summary.byType)) {
        console.log(`    ${type}: ${count}`);
      }
      console.log("  By agent:");
      for (const [agent, count] of Object.entries(summary.byAgent)) {
        console.log(`    ${agent}: ${count}`);
      }
      break;
    }

    case "/history": {
      const mem = bowo.getMemory();
      const results = mem.query({ type: "result" as any, limit: 5 });
      console.log("\n📜 Recent Pipelines:\n");
      if (results.length === 0) {
        console.log("  No pipelines executed yet.");
      } else {
        for (const r of results) {
          const data = r.content as any;
          console.log(`  ${r.timestamp} — ${data.goal ?? "unknown"}`);
          console.log(`    Status: ${data.status} | Artifacts: ${data.totalArtifacts ?? 0}`);
        }
      }
      break;
    }

    case "/providers": {
      const providers = getProviders();
      const current = detectProvider();
      console.log("\n🔌 Available LLM Providers:\n");
      for (const p of providers) {
        const active = p.name === current ? " ← active" : "";
        const keyStatus = p.apiKeyEnv ? (process.env[p.apiKeyEnv] ? "🔑" : "  ") : "🔌";
        console.log(`  ${keyStatus} ${p.displayName.padEnd(20)} (${p.name})${active}`);
        console.log(`     Model: ${p.defaultModel}`);
        if (p.models.length > 0) {
          console.log(`     Models: ${p.models.slice(0, 5).join(", ")}${p.models.length > 5 ? "..." : ""}`);
        }
      }
      console.log("\n  Set BOWO_LLM_PROVIDER=<name> or just set the API key to auto-detect.\n");
      break;
    }

    case "/hermes": {
      const hermes = new HermesIntegration();
      const hStatus = await hermes.getStatus();

      console.log("\n🤖 BOWO ↔ Hermes Integration:\n");
      console.log(`  Installed: ${hStatus.hermes.installed ? "✅" : "❌"}`);
      console.log(`  Version: ${hStatus.hermes.version ?? "N/A"}`);
      console.log(`  Proxy: ${hStatus.hermes.proxyRunning ? `✅ ${hStatus.proxy}` : "❌ Not running"}`);
      console.log(`  Gateway: ${hStatus.hermes.gatewayRunning ? "✅ Running" : "❌ Not running"}`);

      if (hStatus.hermes.installed && hStatus.hermes.proxyRunning) {
        const llmConfig = hermes.getLLMConfig();
        console.log("\n📋 To use Hermes as LLM backend:");
        console.log(`  export BOWO_LLM_BASE_URL=${llmConfig.baseUrl}`);
        console.log(`  export BOWO_LLM_MODEL=${llmConfig.model}`);
        console.log(`  export BOWO_LLM_API_KEY=${llmConfig.apiKey}`);
      }

      console.log("\n💡 Recommendations:");
      for (const r of hStatus.recommendations) {
        console.log(`  ${r}`);
      }
      break;
    }

    case "/help": {
      console.log(BANNER);
      break;
    }

    case "/quit":
    case "/exit":
    case "/q":
      console.log("\n🤖 BOWO signing off! 👋\n");
      process.exit(0);

    default:
      console.log(`\n❓ Unknown command: ${command}`);
      console.log("  Type /help for available commands.\n");
  }
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});

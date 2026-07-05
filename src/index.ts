/**
 * 🤖 BOWO — Main Entry Point
 *
 * Backend Orchestrator for Workflow Optimization
 * Usage: npx tsx src/index.ts --task "Build a REST API"
 *
 * Environment Variables (or .env file):
 *   BOWO_LLM_PROVIDER  — LLM provider (openai, openrouter, etc.)
 *   BOWO_LLM_MODEL     — Model name (gpt-4o-mini, claude-3-haiku, etc.)
 *   BOWO_LLM_API_KEY   — API key for the provider
 *   BOWO_LLM_BASE_URL  — Custom endpoint URL (optional)
 */

import "dotenv/config";
import { Orchestrator } from "./orchestrator.js";

// ─── CLI Argument Parsing ──

function parseArgs(): { task: string; agents?: string[]; model?: string; provider?: string } {
  const args = process.argv.slice(2);
  let task = "Build a complete REST API for a todo application";
  let agents: string[] | undefined;
  let model: string | undefined;
  let provider: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--task" && args[i + 1]) {
      task = args[++i];
    }
    if (args[i] === "--agents" && args[i + 1]) {
      agents = args[++i].split(",");
    }
    if (args[i] === "--model" && args[i + 1]) {
      model = args[++i];
    }
    if (args[i] === "--provider" && args[i + 1]) {
      provider = args[++i];
    }
  }

  return { task, agents, model, provider };
}

// ─── Main ──

async function main() {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║       🤖 BOWO — Agent System v1.0       ║
  ║  Backend Orchestrator for Workflow       ║
  ║              Optimization                ║
  ╚══════════════════════════════════════════╝
  `);

  const { task, agents, model, provider } = parseArgs();

  console.log(`📋 Task: ${task}`);
  if (agents) console.log(`🎯 Agents: ${agents.join(", ")}`);
  if (model) console.log(`🧠 Model: ${model}`);
  console.log();

  const bowo = new Orchestrator({
    logLevel: "info",
  });

  // Show system status
  const status = bowo.getStatus();
  console.log(`🤖 Agents available: ${status.agents.length}`);
  console.log(`💾 Memory entries: ${status.memory.totalEntries}`);
  console.log(`🧠 LLM: ${status.llm.available ? `🟢 ${status.llm.model}` : "🔴 Offline"}`);
  console.log();

  // Execute the task
  const result = await bowo.execute(task, { agents });

  // Print summary
  console.log("\n");
  console.log("╔══════════════════════════════════════════╗");
  console.log("║            📊 EXECUTION SUMMARY          ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║ Pipeline ID: ${result.pipelineId.padEnd(27)}║`);
  console.log(`║ Status:      ${result.status.padEnd(27)}║`);
  console.log(`║ Artifacts:   ${String(result.totalArtifacts).padEnd(27)}║`);
  console.log(`║ Duration:    ${(result.totalDuration + "ms").padEnd(27)}║`);
  console.log("╠══════════════════════════════════════════╣");
  console.log("║ Agent Results:                           ║");
  for (const ar of result.agentResults) {
    const icon = ar.status === "completed" ? "✅" : "❌";
    const tokenStr = ar.tokens ? ` (${ar.tokens} tok)` : "";
    console.log(`║ ${icon} ${ar.agent.padEnd(12)} ${ar.status.padEnd(20)}║`);
  }
  console.log("╚══════════════════════════════════════════╝");

  if (result.totalArtifacts > 0) {
    console.log(`\n📊 ${result.totalArtifacts} artifacts saved to output/`);
  }

  console.log("\n🤖 BOWO signing off. See you next mission! 🚀\n");
}

main().catch((err) => {
  console.error("❌ BOWO Error:", err);
  process.exit(1);
});

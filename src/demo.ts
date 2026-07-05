/**
 * 🤖 BOWO Demo — Interactive Demo Script
 *
 * Shows the full BOWO pipeline in action
 * with different scenarios.
 */

import { Orchestrator } from "./orchestrator.js";

const scenarios = [
  {
    name: "🚀 Scenario 1: Build a REST API",
    task: "Build a complete REST API for a todo application with authentication, CRUD operations, and PostgreSQL database",
  },
  {
    name: "🐛 Scenario 2: Debug a Bug",
    task: "Fix the login authentication bug where users get logged out after 5 minutes",
  },
  {
    name: "🔒 Scenario 3: Security Audit",
    task: "Perform a security audit on the existing web application and fix all critical vulnerabilities",
  },
];

async function runDemo() {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║      🤖 BOWO — Interactive Demo          ║
  ║  Multi-Agent AI Framework Showcase       ║
  ╚══════════════════════════════════════════╝
  `);

  const bowo = new Orchestrator({ logLevel: "info" });

  // Run each scenario
  for (const scenario of scenarios) {
    console.log(`\n${"━".repeat(50)}`);
    console.log(`${scenario.name}`);
    console.log(`${"━".repeat(50)}`);
    console.log(`Task: ${scenario.task}\n`);

    const result = await bowo.execute(scenario.task);

    console.log(`\nResult: ${result.status} | Artifacts: ${result.totalArtifacts} | Duration: ${result.totalDuration}ms\n`);
  }

  // Final memory summary
  const memory = bowo.getMemory();
  const summary = memory.getSummary();
  console.log(`\n${"═".repeat(50)}`);
  console.log("📊 Final Memory Summary:");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`${"═".repeat(50)}`);

  console.log("\n🤖 Demo complete! All agents performed their tasks. 🎉\n");
}

runDemo().catch(console.error);

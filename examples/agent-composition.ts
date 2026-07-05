/**
 * 🤖 BOWO — Agent Composition Example
 *
 * Demonstrates dynamic agent chaining, groups, and conditional routing.
 */

import "dotenv/config";
import { Orchestrator } from "../src/orchestrator.js";
import { AgentComposer } from "../src/agent-composition.js";

async function main() {
  console.log("🤖 BOWO — Agent Composition Example\n");

  // Initialize orchestrator
  const bowo = new Orchestrator({ logLevel: "info" });
  await bowo.ensureModules();

  // Create agent composer
  const composer = new AgentComposer(bowo.workflow, bowo.memory, bowo.comm);

  // ─── Example 1: Agent Chain ───
  console.log("══════════════════════════════════════════");
  console.log("📋 Example 1: Agent Chain (Sequential)");
  console.log("══════════════════════════════════════════\n");

  const devChain = composer.createChain("dev-pipeline", [
    { agentName: "planner", inputMapping: (ctx: any) => ({ goal: ctx.goal }) },
    { agentName: "architect", inputMapping: (ctx: any) => ({ goal: ctx.goal, plan: ctx.plan }) },
    { agentName: "backend", inputMapping: (ctx: any) => ({ goal: ctx.goal, architecture: ctx.architecture }) },
    { agentName: "qa", inputMapping: (ctx: any) => ({ goal: ctx.goal, code: ctx.code }) },
  ]);

  console.log(`  Chain: ${devChain.name} (${devChain.steps.length} steps)`);
  devChain.steps.forEach((s, i) => console.log(`    ${i + 1}. ${s.agentName}`));

  // Execute chain
  const chainResult = await composer.executeChain(devChain, {
    goal: "Build REST API for todo app",
  });

  console.log(`\n  Result: ${chainResult.status}`);
  console.log(`  Steps: ${chainResult.steps.length}`);
  console.log(`  Duration: ${chainResult.totalDuration}ms`);

  // ─── Example 2: Agent Group (Parallel) ───
  console.log("\n══════════════════════════════════════════");
  console.log("📋 Example 2: Agent Group (Parallel)");
  console.log("══════════════════════════════════════════\n");

  const reviewGroup = composer.createGroup("review-team", [
    "qa",
    "security",
    "debug",
  ], "parallel");

  console.log(`  Group: ${reviewGroup.name} (${reviewGroup.agents.length} agents)`);
  console.log(`  Strategy: ${reviewGroup.strategy}`);

  const groupResult = await composer.executeGroup(reviewGroup, {
    goal: "Review todo app code",
    code: "const app = express();",
  });

  console.log(`\n  Result: ${groupResult ? "completed" : "no result"}`);

  // ─── Example 3: Conditional Routing ───
  console.log("\n══════════════════════════════════════════");
  console.log("📋 Example 3: Conditional Routing");
  console.log("══════════════════════════════════════════\n");

  const smartChain = composer.createChain("smart-pipeline", [
    { agentName: "planner" },
    { agentName: "architect" },
    { agentName: "backend" },
    { agentName: "frontend" },
  ]);

  // Route to security if code has "auth" in it
  composer.addConditionalRouting(
    smartChain.id,
    "backend",
    (result: any) => {
      const content = JSON.stringify(result?.artifacts || []);
      return content.includes("auth") || content.includes("login");
    },
    "security",  // true → security review
    "qa"         // false → skip to qa
  );

  console.log("  Conditional: if backend output has 'auth' → security, else → qa");
  console.log("  Smart pipeline configured!\n");

  // ─── Summary ───
  console.log("══════════════════════════════════════════");
  console.log("📊 Summary");
  console.log("══════════════════════════════════════════");
  console.log(`  Chains: ${composer.listChains().length}`);
  console.log(`  Groups: ${composer.listGroups().length}`);
  console.log("\n🤖 Agent Composition example complete! 🎉");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});

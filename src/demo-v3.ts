/**
 * 🤖 BOWO v3.2 — Enhanced Demo
 *
 * Showcases ALL BOWO features including v3 architecture.
 */

import { Orchestrator } from "./orchestrator.js";

// ─── Lazy imports for v3 modules ───
async function loadV3Modules() {
  const mods: Record<string, any> = {};
  try { const m = await import("./dag.js"); mods.dag = m; } catch {}
  try { const m = await import("./checkpoint.js"); mods.checkpoint = m; } catch {}
  try { const m = await import("./supervisor.js"); mods.supervisor = m; } catch {}
  try { const m = await import("./context.js"); mods.context = m; } catch {}
  try { const m = await import("./auth.js"); mods.auth = m; } catch {}
  try { const m = await import("./database.js"); mods.database = m; } catch {}
  try { const m = await import("./cache.js"); mods.cache = m; } catch {}
  try { const m = await import("./agent-composition.js"); mods.composition = m; } catch {}
  return mods;
}

async function main() {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║      🤖 BOWO v3.2 — Enhanced Demo               ║
  ║  Multi-Agent AI Framework Showcase               ║
  ╚══════════════════════════════════════════════════╝
  `);

  const bowo = new Orchestrator({ logLevel: "info" });
  const v3 = await loadV3Modules();

  // ─── Demo 1: Classic Pipeline ───
  console.log("═══════════════════════════════════════════════════");
  console.log("📋 Demo 1: Classic Pipeline");
  console.log("═══════════════════════════════════════════════════\n");

  const result1 = await bowo.execute(
    "Build a REST API for a todo app with authentication"
  );
  console.log(`  ✅ Status: ${result1.status}`);
  console.log(`  ⏱️  Duration: ${result1.totalDuration}ms`);
  console.log(`  📦 Artifacts: ${result1.totalArtifacts}`);

  // ─── Demo 2: Auth System ───
  if (v3.auth) {
    console.log("\n═══════════════════════════════════════════════════");
    console.log("🔐 Demo 2: Authentication System");
    console.log("═══════════════════════════════════════════════════\n");

    const auth = new v3.auth.AuthManager();
    let admin;
    try { admin = auth.createDefaultAdmin(); } catch { admin = auth.getUsers()[0]; }
    console.log(`  👤 Admin: ${admin.username}`);

    const token = auth.login("admin", "admin123");
    console.log(`  🎫 Token generated: ${token ? "✅" : "❌"}`);

    if (token) {
      const verify = auth.verifyToken(token.token);
      console.log(`  🔍 Token verified: ${verify.valid ? "✅" : "❌"}`);
      console.log(`  👤 User ID: ${verify.userId}`);
      console.log(`  🔑 Role: ${verify.role}`);
    }

    const user = auth.register("bowo", "password123", "admin");
    console.log(`  👤 New user registered: ${user.username}`);
    console.log(`  👥 Total users: ${auth.getUsers().length}`);
  }

  // ─── Demo 3: Database ───
  if (v3.database) {
    console.log("\n═══════════════════════════════════════════════════");
    console.log("💾 Demo 3: Database System");
    console.log("═══════════════════════════════════════════════════\n");

    const db = new v3.database.DatabaseManager();
    const todos = db.collection("todos");

    const todo1 = todos.insert({ title: "Build API", completed: false });
    const todo2 = todos.insert({ title: "Write tests", completed: false });
    console.log(`  📝 Inserted: ${todo1.title} (id: ${todo1.id.slice(0, 8)}...)`);
    console.log(`  📝 Inserted: ${todo2.title} (id: ${todo2.id.slice(0, 8)}...)`);

    todos.update(todo1.id, { completed: true });
    const found = todos.findById(todo1.id);
    console.log(`  ✅ Updated: ${found?.title} completed=${found?.completed}`);

    console.log(`  📊 Total todos: ${todos.count()}`);

    const stats = db.getStats();
    console.log(`  📊 Collections: ${stats.collections}, Records: ${stats.totalRecords}`);
  }

  // ─── Demo 4: Cache ───
  if (v3.cache) {
    console.log("\n═══════════════════════════════════════════════════");
    console.log("⚡ Demo 4: Cache System");
    console.log("═══════════════════════════════════════════════════\n");

    const cache = new v3.cache.CacheManager(60);

    cache.set("greeting", "Hello, BOWO!");
    cache.set("data", { users: 100, tasks: 50 }, 30);

    console.log(`  📥 Get greeting: ${cache.get("greeting")}`);
    console.log(`  📥 Get data: ${JSON.stringify(cache.get("data"))}`);
    console.log(`  📊 Cache size: ${cache.size()}`);

    const stats = cache.getStats();
    console.log(`  📊 Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
    console.log(`  💾 Memory: ${stats.memoryEstimate}`);
  }

  // ─── Demo 5: Agent Composition ───
  if (v3.composition) {
    console.log("\n═══════════════════════════════════════════════════");
    console.log("🤖 Demo 5: Agent Composition");
    console.log("═══════════════════════════════════════════════════\n");

    const composer = new v3.composition.AgentComposer(
      (bowo as any).workflow, (bowo as any).memory, (bowo as any).comm
    );

    // Create chain
    const chain = composer.createChain("dev-pipeline", [
      { agentName: "planner" },
      { agentName: "architect" },
      { agentName: "backend" },
    ]);
    console.log(`  🔗 Chain created: ${chain.name} (${chain.steps.length} steps)`);

    // Create group
    const group = composer.createGroup("review-team", [
      "qa", "security", "debug"
    ], "parallel");
    console.log(`  👥 Group created: ${group.name} (${group.agents.length} agents)`);

    // Execute chain
    const chainResult = await composer.executeChain(chain, {
      goal: "Build todo app"
    });
    console.log(`  ⚡ Chain result: ${chainResult.status} (${chainResult.totalDuration}ms)`);
    console.log(`  📦 Artifacts: ${chainResult.steps.filter(s => s.result?.artifacts?.length).length} steps produced output`);
  }

  // ─── Summary ───
  console.log("\n═══════════════════════════════════════════════════");
  console.log("📊 Summary");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  🤖 Agents: 9 (5 with LLM)`);
  console.log(`  📦 Source files: 54+`);
  console.log(`  🧪 Tests: 58+`);
  console.log(`  📚 API docs: 2350 lines`);
  console.log(`  📝 Examples: 5 files`);
  console.log("\n🤖 BOWO v3.2 demo complete! 🎉\n");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});

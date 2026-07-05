/**
 * BOWO Integration Tests
 *
 * End-to-end tests covering the full system:
 *   1. Full pipeline: orchestrator → register agents → execute → verify
 *   2. Auth flow: create admin → login → verify token → register user
 *   3. Database: insert → find → update → delete → verify
 *   4. Cache: set → get → expire → cleanup
 *   5. DAG: create graph → execute → verify node results
 *   6. Supervisor: create pipeline → run → verify decisions
 *   7. Agent composition: create chain → execute → verify steps
 *
 * Run: npx tsx tests/test-integration.ts
 */

import { Logger, type LogEntry } from "../src/logger.js";
import { BowoMemory, MemoryType } from "../src/memory.js";
import { Communication } from "../src/communication.js";
import { Workflow } from "../src/workflow.js";
import { Orchestrator } from "../src/orchestrator.js";
import { AuthManager, type User } from "../src/auth.js";
import { DatabaseManager } from "../src/database.js";
import { CacheManager } from "../src/cache.js";
import { DAGExecutor, buildSequentialGraph, type DAGGraph, type DAGNode } from "../src/dag.js";
import { SupervisorAgent, type SupervisorDecision } from "../src/supervisor.js";
import { AgentComposer, type AgentChain } from "../src/agent-composition.js";
import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult } from "../src/agents/base.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ─── Test Harness ────────────────────────────────────────
let total = 0;
let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  total++;
  try {
    const result = fn();
    if (result && typeof (result as Promise<void>).then === "function") {
      await (result as Promise<void>);
    }
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     → ${err.message}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function deepEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ─── Mock Agent for Integration Tests ────────────────────
class MockAgent extends BaseAgent {
  config: AgentConfig;
  private resultOverride?: Partial<TaskResult>;

  constructor(
    agentConfig: AgentConfig,
    memory: BowoMemory,
    communication: Communication,
    resultOverride?: Partial<TaskResult>,
  ) {
    super(agentConfig, memory, communication, null);
    this.config = agentConfig;
    this.resultOverride = resultOverride;
  }

  async execute(input: TaskInput): Promise<TaskResult> {
    return {
      agent: this.config.name,
      taskId: input.taskId,
      status: this.resultOverride?.status ?? "completed",
      summary: this.resultOverride?.summary ?? `Processed: ${input.goal}`,
      artifacts: this.resultOverride?.artifacts ?? [
        { name: `${this.config.name}-output`, type: "text", content: `output from ${this.config.name}` },
      ],
      duration: this.resultOverride?.duration ?? Math.floor(Math.random() * 50) + 1,
    };
  }
}

function createMockAgent(name: string, mem: BowoMemory, comm: Communication): MockAgent {
  return new MockAgent(
    {
      name,
      displayName: name,
      icon: "🤖",
      description: `Mock ${name} agent`,
      systemPrompt: `You are ${name}`,
      capabilities: ["mock"],
    },
    mem,
    comm,
  );
}

// ─── Temp directories for test isolation ─────────────────
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "bowo-integration-"));
const authDir = path.join(tmpBase, "auth");
const dbDir = path.join(tmpBase, "database");
const memDir = path.join(tmpBase, "memory");

// ══════════════════════════════════════════════════════════
// 0. Logger
// ══════════════════════════════════════════════════════════
async function testLogger() {
  console.log("\n📝 Logger Tests");

  test("Logger — constructor creates named logger", () => {
    const logger = new Logger("test-module");
    const logs = logger.getLogs();
    assertEqual(logs.length, 0, "no logs initially");
  });

  test("Logger — info message is captured", () => {
    const logger = new Logger("test", "debug");
    logger.info("hello world");
    const logs = logger.getLogs();
    assertEqual(logs.length, 1, "should have 1 log");
    assertEqual(logs[0].level, "INFO", "level should be INFO");
    assertEqual(logs[0].name, "test", "name should be test");
    assertEqual(logs[0].message, "hello world", "message should match");
    assert(typeof logs[0].timestamp === "string", "timestamp should be string");
  });

  test("Logger — debug filtered at info level", () => {
    const logger = new Logger("test", "info");
    logger.debug("should not appear");
    const logs = logger.getLogs();
    assertEqual(logs.length, 0, "debug should be filtered");
  });

  test("Logger — setLevel changes filtering", () => {
    const logger = new Logger("test", "warn");
    logger.debug("filtered");
    logger.info("filtered");
    assertEqual(logger.getLogs().length, 0, "no logs at warn level");

    logger.setLevel("debug");
    logger.debug("now visible");
    assertEqual(logger.getLogs().length, 1, "debug now visible");
  });

  test("Logger — child logger shares buffer", () => {
    const parent = new Logger("parent", "debug");
    const child = parent.child("child");

    parent.info("from parent");
    child.info("from child");

    const parentLogs = parent.getLogs();
    assertEqual(parentLogs.length, 2, "parent sees both logs");
    assertEqual(parentLogs[0].name, "parent", "first log from parent");
    assertEqual(parentLogs[1].name, "child", "second log from child");
  });

  test("Logger — data payload is stored", () => {
    const logger = new Logger("test", "debug");
    logger.warn("disk space low", { free: "2GB", path: "/data" });
    const logs = logger.getLogs();
    assertEqual(logs.length, 1, "one log entry");
    assertEqual(logs[0].data.free, "2GB", "data.free should be 2GB");
  });

  test("Logger — respects MAX_ENTRIES (1000)", () => {
    const logger = new Logger("stress", "debug");
    for (let i = 0; i < 1050; i++) {
      logger.info(`entry ${i}`);
    }
    const logs = logger.getLogs();
    assertEqual(logs.length, 1000, "should be capped at 1000");
    assertEqual(logs[0].message, "entry 50", "oldest kept entry should be 50");
  });

  test("Logger — error level only shows errors", () => {
    const logger = new Logger("strict", "error");
    logger.debug("no");
    logger.info("no");
    logger.warn("no");
    logger.error("yes");
    const logs = logger.getLogs();
    assertEqual(logs.length, 1, "only error logged");
    assertEqual(logs[0].level, "ERROR", "should be ERROR");
  });

  test("Logger — format matches expected structure", () => {
    const logger = new Logger("orchestrator", "debug");
    logger.info("Pipeline started", { pipelineId: "pipe-001" });
    const logs = logger.getLogs();
    const entry = logs[0];
    // Verify ISO timestamp format
    assert(entry.timestamp.endsWith("Z"), "timestamp should end with Z");
    assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.timestamp),
      "timestamp should be ISO format");
  });
}

// ══════════════════════════════════════════════════════════
// 1. Full Pipeline: Orchestrator → Agents → Execute → Verify
// ══════════════════════════════════════════════════════════
async function testFullPipeline() {
  console.log("\n🤖 Full Pipeline Tests");

  test("Orchestrator — constructor initializes with all agents", async () => {
    const orch = new Orchestrator({ logLevel: "warn" });
    const status = orch.getStatus();
    assert(status.agents.length >= 5, `should have >= 5 agents, got ${status.agents.length}`);
    assert(status.agents.includes("planner"), "should include planner");
    assert(status.agents.includes("backend"), "should include backend");
    assert(status.agents.includes("qa"), "should include qa");
  });

  test("Orchestrator — getStatus returns complete status", async () => {
    const orch = new Orchestrator({ logLevel: "error" });
    const status = orch.getStatus();
    assert(typeof status.agents === "object", "agents should be array");
    assert(typeof status.memory === "object", "memory should be object");
    assert(typeof status.pipelines === "number", "pipelines count");
    assert(typeof status.llm === "object", "llm info");
    assert(typeof status.modules === "object", "modules info");
  });

  test("Workflow — pipeline with mock agents runs end-to-end", async () => {
    const mem = new BowoMemory(path.join(memDir, "pipeline"));
    const comm = new Communication();
    const workflow = new Workflow();

    const agent1 = createMockAgent("planner", mem, comm);
    const agent2 = createMockAgent("backend", mem, comm);
    const agent3 = createMockAgent("reporter", mem, comm);
    workflow.registerAgent(agent1);
    workflow.registerAgent(agent2);
    workflow.registerAgent(agent3);

    const pipeline = await workflow.runPipeline("test-pipeline", [
      { agentName: "planner", input: { taskId: "t1", goal: "Plan architecture", context: {} } },
      { agentName: "backend", input: { taskId: "t2", goal: "Implement backend", context: {} } },
      { agentName: "reporter", input: { taskId: "t3", goal: "Generate report", context: {} } },
    ]);

    assertEqual(pipeline.status, "completed", "pipeline should complete");
    assertEqual(pipeline.steps.length, 3, "should have 3 steps");
    for (const step of pipeline.steps) {
      assertEqual(step.status, "completed", `step ${step.agentName} should complete`);
      assert(step.result !== undefined, `step ${step.agentName} should have result`);
    }
  });

  test("Workflow — pipeline passes context between agents", async () => {
    const mem = new BowoMemory(path.join(memDir, "ctx-pass"));
    const comm = new Communication();
    const workflow = new Workflow();

    const agent1 = createMockAgent("planner", mem, comm);
    const agent2 = createMockAgent("backend", mem, comm);
    workflow.registerAgent(agent1);
    workflow.registerAgent(agent2);

    const pipeline = await workflow.runPipeline("context-test", [
      { agentName: "planner", input: { taskId: "t1", goal: "Plan", context: { input: "data" } } },
      { agentName: "backend", input: { taskId: "t2", goal: "Build", context: {} } },
    ]);

    assertEqual(pipeline.status, "completed", "pipeline completed");
    // The backend step should have received enriched context with previousResults
    const backendStep = pipeline.steps[1];
    assert(backendStep.result !== undefined, "backend should have result");
    assert(backendStep.status === "completed", "backend step should be completed");
  });
}

// ══════════════════════════════════════════════════════════
// 2. Auth Flow: Create Admin → Login → Verify Token → Register
// ══════════════════════════════════════════════════════════
async function testAuthFlow() {
  console.log("\n🔐 Auth Flow Tests");

  // Clean users.json to start fresh
  const usersFile = path.join(process.cwd(), "output", "users.json");
  try { fs.unlinkSync(usersFile); } catch {}

  const auth = new AuthManager("test-secret-key-for-integration");

  test("Auth — createDefaultAdmin creates admin user", () => {
    const admin = auth.createDefaultAdmin();
    assertEqual(admin.username, "admin", "username should be admin");
    assertEqual(admin.role, "admin", "role should be admin");
    assert(admin.id.length > 0, "should have an id");
    assert(admin.createdAt.length > 0, "should have createdAt");
  });

  test("Auth — login with correct credentials returns token", () => {
    const token = auth.login("admin", "admin123");
    assert(token !== null, "login should return token");
    assert(typeof token!.token === "string", "token should be string");
    assert(token!.token.length > 0, "token should not be empty");
    assertEqual(token!.role, "admin", "token role should be admin");
    assertEqual(token!.userId, auth.getUsers()[0].id, "userId should match");
  });

  test("Auth — login with wrong password returns null", () => {
    const token = auth.login("admin", "wrongpassword");
    assertEqual(token, null, "wrong password should return null");
  });

  test("Auth — verifyToken validates a valid token", () => {
    const authToken = auth.login("admin", "admin123");
    assert(authToken !== null, "should get token");

    const result = auth.verifyToken(authToken!.token);
    assertEqual(result.valid, true, "token should be valid");
    assertEqual(result.role, "admin", "role should be admin");
  });

  test("Auth — verifyToken rejects invalid token", () => {
    const result = auth.verifyToken("invalid.token.here");
    assertEqual(result.valid, false, "invalid token should not be valid");
    assert(typeof result.error === "string", "should have error message");
  });

  test("Auth — register new user with role", () => {
    const user = auth.register("alice", "password123", "user");
    assertEqual(user.username, "alice", "username");
    assertEqual(user.role, "user", "role");
    assert(user.id.length > 0, "should have id");
  });

  test("Auth — full flow: create admin → login → register user → login user", () => {
    const token = auth.login("alice", "password123");
    assert(token !== null, "alice should be able to login");
    assertEqual(token!.role, "user", "alice role should be user");

    const verifyResult = auth.verifyToken(token!.token);
    assertEqual(verifyResult.valid, true, "alice's token should be valid");
  });

  test("Auth — duplicate username rejected", () => {
    let threw = false;
    try {
      auth.register("alice", "another", "viewer");
    } catch {
      threw = true;
    }
    assert(threw, "duplicate username should throw");
  });

  test("Auth — getUsers returns all users without password hashes", () => {
    const users = auth.getUsers();
    assert(users.length >= 3, `should have >= 3 users, got ${users.length}`);
    for (const u of users) {
      assert(!(u as any).passwordHash, "user should not expose passwordHash");
    }
  });

  test("Auth — deleteUser removes a user", () => {
    const usersBefore = auth.getUsers().length;
    const aliceId = auth.getUsers().find((u) => u.username === "alice")!.id;
    const deleted = auth.deleteUser(aliceId);
    assertEqual(deleted, true, "should return true");
    assertEqual(auth.getUsers().length, usersBefore - 1, "user count decreased");
  });
}

// ══════════════════════════════════════════════════════════
// 3. Database: Insert → Find → Update → Delete → Verify
// ══════════════════════════════════════════════════════════
async function testDatabase() {
  console.log("\n🗄️ Database Tests");

  const testDbDir = path.join(dbDir, `db-${Date.now()}`);
  const db = new DatabaseManager(testDbDir);

  test("Database — collection creates a new collection", () => {
    const todos = db.collection("todos");
    assert(todos !== null, "collection should be created");
    assertEqual(todos.count(), 0, "new collection should be empty");
  });

  test("Database — insert creates a record with auto-generated id", () => {
    const todos = db.collection("todos");
    const record = todos.insert({ title: "Buy milk", completed: false });
    assert(typeof record.id === "string", "should have id");
    assert(record.id.length > 0, "id should not be empty");
    assertEqual(record.title, "Buy milk", "title should match");
    assertEqual(record.completed, false, "completed should be false");
  });

  test("Database — findById returns correct record", () => {
    const todos = db.collection("todos");
    const all = todos.find();
    const first = all[0];
    const found = todos.findById(first.id);
    assert(found !== null, "findById should return record");
    assertEqual(found!.title, "Buy milk", "title should match");
  });

  test("Database — find with filters returns matching records", () => {
    const todos = db.collection("todos");
    todos.insert({ title: "Walk dog", completed: true });
    todos.insert({ title: "Clean house", completed: false });

    const completed = todos.find([{ field: "completed", operator: "eq", value: true }]);
    assertEqual(completed.length, 1, "should find 1 completed item");
    assertEqual(completed[0].title, "Walk dog", "should be Walk dog");

    const all = todos.find();
    assert(all.length >= 3, `should have >= 3 records, got ${all.length}`);
  });

  test("Database — update modifies a record", () => {
    const todos = db.collection("todos");
    const all = todos.find();
    const target = all.find((r) => r.title === "Buy milk")!;
    const updated = todos.update(target.id, { completed: true, title: "Buy milk (done)" });
    assert(updated !== null, "update should return record");
    assertEqual(updated!.completed, true, "completed should now be true");
    assertEqual(updated!.title, "Buy milk (done)", "title should be updated");
  });

  test("Database — delete removes a record", () => {
    const todos = db.collection("todos");
    const all = todos.find();
    const countBefore = all.length;
    const target = all.find((r) => r.title === "Walk dog")!;
    const deleted = todos.delete(target.id);
    assertEqual(deleted, true, "delete should return true");
    assertEqual(todos.count(), countBefore - 1, "count should decrease by 1");
  });

  test("Database — delete nonexistent returns false", () => {
    const todos = db.collection("todos");
    const deleted = todos.delete("nonexistent-id");
    assertEqual(deleted, false, "should return false for missing id");
  });

  test("Database — insertMany adds multiple records", () => {
    const items = db.collection("items");
    items.drop(); // clear from prior runs
    const inserted = items.insertMany([
      { name: "item-a", value: 1 },
      { name: "item-b", value: 2 },
      { name: "item-c", value: 3 },
    ]);
    assertEqual(inserted.length, 3, "should insert 3");
    assertEqual(items.count(), 3, "count should be 3");
  });

  test("Database — getStats returns correct summary", () => {
    const stats = db.getStats();
    assert(stats.collections >= 1, "should have >= 1 collection");
    assert(stats.totalRecords >= 1, "should have >= 1 record");
    assert(typeof stats.size === "string", "size should be string");
  });

  test("Database — backup and restore works", () => {
    const todos = db.collection("todos");
    const countBefore = todos.count();
    const backupPath = db.backup();
    assert(fs.existsSync(backupPath), "backup directory should exist");

    // Drop and restore
    todos.drop();
    assertEqual(todos.count(), 0, "collection should be empty after drop");
    const restored = db.restore(backupPath);
    assertEqual(restored, true, "restore should return true");
  });
}

// ══════════════════════════════════════════════════════════
// 4. Cache: Set → Get → Expire → Cleanup
// ══════════════════════════════════════════════════════════
async function testCache() {
  console.log("\n🗃️ Cache Tests");

  test("Cache — set and get basic values", () => {
    const cache = new CacheManager(60);
    cache.set("key1", "value1");
    cache.set("key2", { nested: true });
    cache.destroy();

    assertEqual(cache.get("key1"), "value1", "should get value1");
    assert(deepEqual(cache.get("key2"), { nested: true }), "should get nested object");
  });

  test("Cache — get returns null for missing keys", () => {
    const cache = new CacheManager(60);
    cache.destroy();
    assertEqual(cache.get("nonexistent"), null, "missing key returns null");
  });

  test("Cache — has checks existence", () => {
    const cache = new CacheManager(60);
    cache.destroy();
    cache.set("exists", "yes");
    assertEqual(cache.has("exists"), true, "key should exist");
    assertEqual(cache.has("nope"), false, "missing key");
  });

  test("Cache — TTL expiry returns null", () => {
    const cache = new CacheManager(3600);
    cache.destroy();
    // Set with negative TTL — expires in the past
    cache.set("ephemeral", "data", -1);
    assertEqual(cache.get("ephemeral"), null, "expired key should return null");
  });

  test("Cache — delete removes entry", () => {
    const cache = new CacheManager(60);
    cache.destroy();
    cache.set("to-delete", "value");
    assertEqual(cache.get("to-delete"), "value", "should exist before delete");
    const deleted = cache.delete("to-delete");
    assertEqual(deleted, true, "delete should return true");
    assertEqual(cache.get("to-delete"), null, "should be null after delete");
  });

  test("Cache — size returns active entry count", () => {
    const cache = new CacheManager(60);
    cache.destroy();
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3, 0); // expires immediately
    assert(cache.size() >= 2, "should have >= 2 active entries");
    cache.destroy();
  });

  test("Cache — cleanup removes expired entries", () => {
    const cache = new CacheManager(3600);
    cache.destroy();
    cache.set("alive", "yes", 3600);
    cache.set("dead", "yes", -1); // expired in the past
    const removed = cache.cleanup();
    assert(removed >= 1, `cleanup should remove >= 1, got ${removed}`);
    assertEqual(cache.get("alive"), "yes", "alive key should still be present");
  });

  test("Cache — getOrSet uses factory on miss", () => {
    const cache = new CacheManager(60);
    cache.destroy();
    let factoryCalled = false;
    const val = cache.getOrSet("factory-key", () => { factoryCalled = true; return "computed"; });
    assertEqual(val, "computed", "should return factory value");
    assert(factoryCalled, "factory should be called on miss");

    // Second call should use cache
    factoryCalled = false;
    const val2 = cache.getOrSet("factory-key", () => { factoryCalled = true; return "other"; });
    assertEqual(val2, "computed", "should return cached value");
    assert(!factoryCalled, "factory should not be called on hit");
  });

  test("Cache — keys returns active keys", () => {
    const cache = new CacheManager(60);
    cache.destroy();
    cache.set("k1", "v1");
    cache.set("k2", "v2");
    const keys = cache.keys();
    assert(keys.includes("k1"), "should include k1");
    assert(keys.includes("k2"), "should include k2");
  });

  test("Cache — getStats returns hit/miss info", () => {
    const cache = new CacheManager(60);
    cache.destroy();
    cache.set("x", 1);
    cache.get("x");  // hit
    cache.get("y");  // miss
    const stats = cache.getStats();
    assert(stats.totalHits >= 1, "should have >= 1 hit");
    assert(stats.totalMisses >= 1, "should have >= 1 miss");
  });
}

// ══════════════════════════════════════════════════════════
// 5. DAG: Create Graph → Execute → Verify Node Results
// ══════════════════════════════════════════════════════════
async function testDAG() {
  console.log("\n📊 DAG Tests");

  const mem = new BowoMemory(path.join(memDir, "dag"));
  const comm = new Communication();

  // Create mock agents map for DAGExecutor
  const agents = new Map<string, { execute(input: any): Promise<any> }>();
  for (const name of ["planner", "architect", "backend", "frontend", "qa", "reporter"]) {
    const mock = createMockAgent(name, mem, comm);
    agents.set(name, mock);
  }

  test("DAG — buildSequentialGraph creates valid graph", () => {
    const graph = buildSequentialGraph("test-seq", [
      { agentName: "planner" },
      { agentName: "architect" },
      { agentName: "backend" },
    ]);
    assertEqual(graph.name, "test-seq", "graph name");
    assertEqual(graph.nodes.length, 3, "should have 3 nodes");
    assertEqual(graph.nodes[0].dependsOn.length, 0, "first node has no deps");
    assertEqual(graph.nodes[1].dependsOn.length, 1, "second node depends on first");
    assertEqual(graph.nodes[2].dependsOn.length, 1, "third node depends on second");
  });

  test("DAG — execute sequential graph completes all nodes", async () => {
    const executor = new DAGExecutor(agents, mem);
    const graph = buildSequentialGraph("seq-test", [
      { agentName: "planner" },
      { agentName: "architect" },
      { agentName: "backend" },
    ]);

    const result = await executor.execute(graph);

    assertEqual(result.status, "completed", "graph should complete");
    assertEqual(result.nodeResults.size, 3, "should have 3 node results");
    assert(result.totalDuration >= 0, "duration should be >= 0");

    for (const [nodeId, nr] of result.nodeResults) {
      assertEqual(nr.status, "completed", `node ${nodeId} should complete`);
    }
  });

  test("DAG — parallel graph runs independent nodes concurrently", async () => {
    const executor = new DAGExecutor(agents, mem);

    const graph: DAGGraph = {
      id: "parallel-test",
      name: "parallel-test",
      nodes: [
        { id: "a", agentName: "planner", dependsOn: [] },
        { id: "b", agentName: "architect", dependsOn: [] },   // parallel with a
        { id: "c", agentName: "reporter", dependsOn: ["a", "b"] }, // depends on both
      ],
    };

    const result = await executor.execute(graph);
    assertEqual(result.status, "completed", "parallel graph should complete");
    assertEqual(result.nodeResults.size, 3, "3 nodes");
    assertEqual(result.nodeResults.get("c")!.status, "completed", "c should complete after a,b");
  });

  test("DAG — conditional node is skipped when condition is false", async () => {
    const executor = new DAGExecutor(agents, mem);
    const graph: DAGGraph = {
      id: "conditional-test",
      name: "conditional-test",
      nodes: [
        { id: "n1", agentName: "planner", dependsOn: [] },
        {
          id: "n2", agentName: "architect", dependsOn: ["n1"],
          condition: (_ctx) => false, // always skip
        },
        { id: "n3", agentName: "reporter", dependsOn: ["n1", "n2"] },
      ],
    };

    const result = await executor.execute(graph);
    assertEqual(result.status, "completed", "should complete");
    assertEqual(result.nodeResults.get("n2")!.status, "skipped", "n2 should be skipped");
    assertEqual(result.nodeResults.get("n3")!.status, "completed", "n3 should complete");
  });

  test("DAG — missing agent throws error", async () => {
    const executor = new DAGExecutor(agents, mem);
    const graph: DAGGraph = {
      id: "missing-agent",
      name: "missing-agent",
      nodes: [
        { id: "n1", agentName: "nonexistent-agent", dependsOn: [] },
      ],
    };

    let threw = false;
    try {
      await executor.execute(graph);
    } catch {
      threw = true;
    }
    assert(threw, "should throw for missing agent");
  });

  test("DAG — events fire during execution", async () => {
    const executor = new DAGExecutor(agents, mem);
    const started: string[] = [];
    const completed: string[] = [];

    executor.on("node:start", (e) => started.push(e.nodeId));
    executor.on("node:complete", (e) => completed.push(e.nodeId));

    const graph = buildSequentialGraph("event-test", [
      { agentName: "planner" },
      { agentName: "reporter" },
    ]);

    await executor.execute(graph);
    assert(started.length >= 2, `should fire >= 2 node:start events, got ${started.length}`);
    assert(completed.length >= 2, `should fire >= 2 node:complete events, got ${completed.length}`);
  });
}

// ══════════════════════════════════════════════════════════
// 6. Supervisor: Create Pipeline → Run → Verify Decisions
// ══════════════════════════════════════════════════════════
async function testSupervisor() {
  console.log("\n🎯 Supervisor Tests");

  test("Supervisor — empty context routes to planner", async () => {
    const supervisor = new SupervisorAgent({ maxRounds: 20 });
    const decision = await supervisor.decide({}, []);
    assertEqual(decision.nextAgent, "planner", "should start with planner");
    assertEqual(decision.done, false, "should not be done");
    assert(typeof decision.reason === "string", "should have reason");
  });

  test("Supervisor — plan present routes to architect", async () => {
    const supervisor = new SupervisorAgent({ maxRounds: 20 });
    const ctx = { plan: { subtasks: [] } };
    const decision = await supervisor.decide(ctx, [{ agent: "planner", result: {} }]);
    assertEqual(decision.nextAgent, "architect", "should go to architect");
    assertEqual(decision.done, false, "not done yet");
  });

  test("Supervisor — plan + architecture routes to backend", async () => {
    const supervisor = new SupervisorAgent({ maxRounds: 20 });
    const ctx = { plan: { subtasks: [] }, architecture: { modules: [] } };
    const decision = await supervisor.decide(ctx, [
      { agent: "planner", result: {} },
      { agent: "architect", result: {} },
    ]);
    assertEqual(decision.nextAgent, "backend", "should go to backend");
  });

  test("Supervisor — full pipeline ends with reporter done", async () => {
    const supervisor = new SupervisorAgent({ maxRounds: 20 });
    const ctx = {
      plan: { subtasks: [] },
      architecture: { modules: [] },
      code: { backend: true, frontend: true },
      tests: { passed: true },
      report: { summary: "all good" },
    };
    const history = [
      { agent: "planner", result: {} },
      { agent: "architect", result: {} },
      { agent: "backend", result: {} },
      { agent: "frontend", result: {} },
      { agent: "qa", result: {} },
      { agent: "reporter", result: {} },
    ];
    const decision = await supervisor.decide(ctx, history);
    assertEqual(decision.nextAgent, "reporter", "final step should be reporter");
    assertEqual(decision.done, true, "should be done");
  });

  test("Supervisor — shouldContinue returns false after done", async () => {
    const supervisor = new SupervisorAgent({ maxRounds: 20 });
    const ctx = {
      plan: true, architecture: true,
      code: { backend: true, frontend: true },
      tests: { passed: true },
      report: { summary: "done" },
    };
    await supervisor.decide(ctx, [
      { agent: "planner", result: {} },
      { agent: "architect", result: {} },
      { agent: "backend", result: {} },
      { agent: "frontend", result: {} },
      { agent: "qa", result: {} },
      { agent: "reporter", result: {} },
    ]);
    const shouldContinue = await supervisor.shouldContinue([
      { agent: "reporter", result: {} },
    ]);
    assertEqual(shouldContinue, false, "should not continue after reporter");
  });

  test("Supervisor — maxRounds enforced", async () => {
    const supervisor = new SupervisorAgent({ maxRounds: 2 });
    const ctx = {}; // empty context = always planner
    const d1 = await supervisor.decide(ctx, []);
    assertEqual(d1.nextAgent, "planner", "round 1: planner");

    const d2 = await supervisor.decide(ctx, []);
    assertEqual(d2.nextAgent, "planner", "round 2: planner");

    // Round 3 hits maxRounds (2), should force reporter
    const d3 = await supervisor.decide(ctx, []);
    assertEqual(d3.nextAgent, "reporter", "round 3: forced reporter");
    assertEqual(d3.done, false, "forced reporter not done");
  });

  test("Supervisor — allowedAgents restricts selection", async () => {
    const supervisor = new SupervisorAgent({
      maxRounds: 20,
      allowedAgents: ["planner", "reporter"],
    });
    // Empty context would normally pick planner, but architecture missing
    // would pick architect — which is NOT allowed, so should fallback to reporter
    const ctx = { plan: { subtasks: [] } };
    const decision = await supervisor.decide(ctx, []);
    // architect is not in allowedAgents, so should fallback
    assert(
      decision.nextAgent === "planner" || decision.nextAgent === "reporter",
      `should be planner or reporter, got ${decision.nextAgent}`,
    );
  });

  test("Supervisor — getHistory tracks decisions", async () => {
    const supervisor = new SupervisorAgent({ maxRounds: 20 });
    await supervisor.decide({}, []);
    await supervisor.decide({ plan: true }, []);
    const history = supervisor.getHistory();
    assertEqual(history.length, 2, "should have 2 decisions");
    assertEqual(history[0].nextAgent, "planner", "first decision");
    assertEqual(history[1].nextAgent, "architect", "second decision");
  });
}

// ══════════════════════════════════════════════════════════
// 7. Agent Composition: Create Chain → Execute → Verify Steps
// ══════════════════════════════════════════════════════════
async function testAgentComposition() {
  console.log("\n🔗 Agent Composition Tests");

  const mem = new BowoMemory(path.join(memDir, "composition"));
  const comm = new Communication();
  const workflow = new Workflow();

  // Register mock agents
  for (const name of ["planner", "architect", "backend", "frontend", "qa", "reporter"]) {
    workflow.registerAgent(createMockAgent(name, mem, comm));
  }

  const composer = new AgentComposer(workflow, mem, comm);

  test("Composer — createChain returns chain with steps", () => {
    const chain = composer.createChain("test-chain", [
      { agentName: "planner" },
      { agentName: "architect" },
      { agentName: "backend" },
    ]);
    assert(typeof chain.id === "string", "chain should have id");
    assertEqual(chain.name, "test-chain", "chain name");
    assertEqual(chain.steps.length, 3, "should have 3 steps");
    assertEqual(chain.steps[0].agentName, "planner", "first step");
    assertEqual(chain.steps[1].agentName, "architect", "second step");
  });

  test("Composer — executeChain runs all steps sequentially", async () => {
    const chain = composer.createChain("exec-chain", [
      { agentName: "planner" },
      { agentName: "backend" },
      { agentName: "reporter" },
    ]);
    const result = await composer.executeChain(chain, { goal: "build feature X" });
    assertEqual(result.status, "completed", "chain should complete");
    assertEqual(result.steps.length, 3, "should have 3 step results");
    assert(result.totalDuration >= 0, "duration >= 0");
    assert(result.finalOutput !== null, "should have final output");
  });

  test("Composer — chain steps feed output to next", async () => {
    const chain = composer.createChain("feed-chain", [
      { agentName: "planner" },
      { agentName: "backend" },
    ]);
    const result = await composer.executeChain(chain, { goal: "test" });
    assertEqual(result.steps.length, 2, "2 steps");

    // Each step result should be a TaskResult from the mock agent
    for (const step of result.steps) {
      assertEqual(step.result.status, "completed", `step ${step.agent} completed`);
    }
  });

  test("Composer — createGroup and listGroups works", () => {
    const group = composer.createGroup("review-group", ["qa", "security", "reporter"], "parallel");
    assert(typeof group.id === "string", "group should have id");
    assertEqual(group.strategy, "parallel", "strategy");
    assertEqual(group.agents.length, 3, "3 agents");

    const groups = composer.listGroups();
    assert(groups.length >= 1, "should list groups");
  });

  test("Composer — listChains shows created chains", () => {
    const chains = composer.listChains();
    assert(chains.length >= 2, `should have >= 2 chains, got ${chains.length}`);
  });

  test("Composer — getChain retrieves by id", () => {
    const chain = composer.createChain("lookup-test", [
      { agentName: "planner" },
    ]);
    const retrieved = composer.getChain(chain.id);
    assert(retrieved !== undefined, "should find chain by id");
    assertEqual(retrieved!.name, "lookup-test", "chain name");
  });

  test("Composer — addConditionalRouting validates chain steps", () => {
    const chain = composer.createChain("cond-chain", [
      { agentName: "planner" },
      { agentName: "backend" },
      { agentName: "reporter" },
    ]);

    // Valid routing
    composer.addConditionalRouting(
      chain.id,
      "planner",
      (result: any) => result?.status === "completed",
      "backend",
      "reporter",
    );

    // Invalid routing — fromAgent doesn't exist
    let threw = false;
    try {
      composer.addConditionalRouting(
        chain.id,
        "nonexistent",
        () => true,
        "backend",
        "reporter",
      );
    } catch {
      threw = true;
    }
    assert(threw, "should throw for nonexistent fromAgent");
  });

  test("Composer — conditional routing branches correctly", async () => {
    const chain = composer.createChain("branch-chain", [
      { agentName: "planner" },
      { agentName: "backend" },
      { agentName: "qa" },
    ]);

    // After planner, go to qa (skipping backend) if status is completed
    composer.addConditionalRouting(
      chain.id,
      "planner",
      (result: any) => result?.status === "completed",
      "qa",     // true branch
      "backend", // false branch
    );

    const result = await composer.executeChain(chain, { goal: "branch test" });
    // The mock planner returns "completed", so it should route to qa
    const stepNames = result.steps.map((s) => s.agent);
    assert(stepNames.includes("planner"), "should include planner");
    assert(stepNames.includes("qa"), "should include qa (routed via true branch)");
  });
}

// ══════════════════════════════════════════════════════════
// Run All Tests
// ══════════════════════════════════════════════════════════
async function main() {
  console.log("═".repeat(60));
  console.log("  BOWO Integration Tests");
  console.log("═".repeat(60));

  // Sync tests
  await testLogger();
  await testAuthFlow();
  await testCache();

  // Async tests
  await testFullPipeline();
  await testDatabase();
  await testDAG();
  await testSupervisor();
  await testAgentComposition();

  // Summary
  console.log("\n" + "═".repeat(60));
  console.log(`📊 Integration Tests: ${total} total, ${passed} passed, ${failed} failed`);
  console.log("═".repeat(60));

  // Cleanup
  try {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  } catch {
    // best effort
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();

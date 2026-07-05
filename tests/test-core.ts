/**
 * BOWO Core Module Tests
 * Tests: BowoMemory, Communication, LLMClient, BaseAgent, Workflow, Orchestrator
 * Run: npx tsx tests/test-core.ts
 */

import { BowoMemory, MemoryType } from "../src/memory.js";
import { Communication, MessageType } from "../src/communication.js";
import { LLMClient } from "../src/llm.js";
import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult } from "../src/agents/base.js";
import { Workflow } from "../src/workflow.js";
import { Orchestrator } from "../src/orchestrator.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ─── Test Harness ────────────────────────────────────────
let total = 0;
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  total++;
  try {
    fn();
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

// ─── Use temp directory for test output ───────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bowo-test-core-"));
const memDir = path.join(tmpDir, "memory");
const auditPath = path.join(tmpDir, "audit.json");

// ══════════════════════════════════════════════════════════
// 1. BowoMemory
// ══════════════════════════════════════════════════════════
console.log("\n🧠 BowoMemory Tests");

test("BowoMemory — constructor creates storage directory", () => {
  const mem = new BowoMemory(memDir);
  assert(fs.existsSync(memDir), "memory directory should exist");
});

test("BowoMemory — store returns an id", () => {
  const mem = new BowoMemory(memDir);
  const id = mem.store(MemoryType.DECISION, "test-agent", "chose postgres");
  assert(typeof id === "string", "should return string id");
  assert(id.startsWith("mem-"), `id should start with "mem-", got "${id}"`);
});

test("BowoMemory — store persists entries", () => {
  const mem = new BowoMemory(memDir);
  mem.clear(); // Clear any entries from previous tests
  mem.store(MemoryType.ARTIFACT, "backend", { file: "index.ts" });
  mem.store(MemoryType.ERROR, "qa", "test failed", { tags: ["bug"] });
  const summary = mem.getSummary();
  assertEqual(summary.totalEntries, 2, "totalEntries after storing 2");
});

test("BowoMemory — query filters by type", () => {
  const mem = new BowoMemory(memDir);
  mem.clear();
  mem.store(MemoryType.DECISION, "planner", "use REST");
  mem.store(MemoryType.ARTIFACT, "backend", { code: "ok" });
  const results = mem.query({ type: MemoryType.DECISION });
  assertEqual(results.length, 1, "should find 1 DECISION entry");
  assertEqual(results[0].type, MemoryType.DECISION, "type should be DECISION");
});

test("BowoMemory — query filters by agent", () => {
  const mem = new BowoMemory(memDir);
  mem.clear();
  mem.store(MemoryType.STATE, "planner", "step 1");
  mem.store(MemoryType.STATE, "backend", "step 2");
  const results = mem.query({ agent: "planner" });
  assertEqual(results.length, 1, "should find 1 entry for planner");
  assertEqual(results[0].agent, "planner", "agent should be planner");
});

test("BowoMemory — getSummary returns correct counts", () => {
  const mem = new BowoMemory(memDir);
  mem.clear();
  mem.store(MemoryType.DECISION, "planner", "d1");
  mem.store(MemoryType.DECISION, "planner", "d2");
  mem.store(MemoryType.ARTIFACT, "backend", "a1");
  const summary = mem.getSummary();
  assertEqual(summary.totalEntries, 3, "totalEntries");
  assertEqual(summary.byType["decision"], 2, "decision count");
  assertEqual(summary.byType["artifact"], 1, "artifact count");
  assertEqual(summary.byAgent["planner"], 2, "planner count");
  assert(summary.lastUpdated !== null, "lastUpdated should not be null");
});

// ══════════════════════════════════════════════════════════
// 2. Communication
// ══════════════════════════════════════════════════════════
console.log("\n📡 Communication Tests");

test("Communication — send returns a message with id", () => {
  const comm = new Communication();
  const msg = comm.send(MessageType.TASK, "orchestrator", "planner", { goal: "test" });
  assert(typeof msg.id === "string", "message should have id");
  assert(msg.id.startsWith("msg-"), `id should start with "msg-"`);
  assertEqual(msg.from, "orchestrator", "from");
  assertEqual(msg.to, "planner", "to");
  assertEqual(msg.type, MessageType.TASK, "type");
});

test("Communication — getAll returns sent messages", () => {
  const comm = new Communication();
  comm.send(MessageType.TASK, "a", "b", "m1");
  comm.send(MessageType.RESULT, "b", "a", "m2");
  const all = comm.getAll();
  assertEqual(all.length, 2, "should have 2 messages");
});

test("Communication — getConversation filters by pair", () => {
  const comm = new Communication();
  comm.send(MessageType.TASK, "orchestrator", "planner", "p1");
  comm.send(MessageType.RESULT, "planner", "orchestrator", "r1");
  comm.send(MessageType.TASK, "orchestrator", "backend", "b1");
  const convo = comm.getConversation("orchestrator", "planner");
  assertEqual(convo.length, 2, "orchestrator-planner conversation has 2 messages");
});

test("Communication — broadcast sends to *", () => {
  const comm = new Communication();
  const msg = comm.broadcast("system", "update");
  assertEqual(msg.to, "*", "broadcast target should be *");
  assertEqual(msg.type, MessageType.BROADCAST, "type should be BROADCAST");
});

test("Communication — events fire on send", () => {
  const comm = new Communication();
  let received = false;
  comm.on("to:backend", () => { received = true; });
  comm.send(MessageType.STATUS, "system", "backend", "ready");
  assert(received, "to:backend event should fire");
});

// ══════════════════════════════════════════════════════════
// 3. LLMClient
// ══════════════════════════════════════════════════════════
console.log("\n🤖 LLMClient Tests");

test("LLMClient — constructor creates instance with default config", () => {
  const client = new LLMClient();
  assert(client !== null, "client should exist");
});

test("LLMClient — getConfig returns provider info", () => {
  const client = new LLMClient({ provider: "ollama", model: "llama3.1" });
  const config = client.getConfig();
  assertEqual(config.provider, "ollama", "provider");
  assertEqual(config.model, "llama3.1", "model");
  assert(typeof config.baseUrl === "string", "baseUrl should be string");
});

test("LLMClient — isAvailable returns boolean", () => {
  const clientOllama = new LLMClient({ provider: "ollama" });
  assertEqual(clientOllama.isAvailable(), true, "ollama should always be available");

  const clientFake = new LLMClient({ provider: "openai", apiKey: "" });
  // Without key, openai is not available (unless env var is set)
  const config = clientFake.getConfig();
  assert(typeof config.provider === "string", "provider should be string");
});

test("LLMClient — getProvider returns provider definition", () => {
  const client = new LLMClient({ provider: "groq" });
  const provider = client.getProvider();
  assertEqual(provider.name, "groq", "provider name");
  assertEqual(provider.displayName, "Groq", "display name");
  assert(provider.models.length > 0, "should have models");
});

// ══════════════════════════════════════════════════════════
// 4. BaseAgent (via mock subclass)
// ══════════════════════════════════════════════════════════
console.log("\n🏗 BaseAgent Tests");

class MockAgent extends BaseAgent {
  config: AgentConfig = {
    name: "mock-agent",
    displayName: "Mock Agent",
    icon: "🧪",
    description: "A test mock agent",
    systemPrompt: "You are a mock.",
    capabilities: ["testing"],
  };

  async execute(input: TaskInput): Promise<TaskResult> {
    return {
      agent: this.config.name,
      taskId: input.taskId,
      status: "completed",
      summary: `Mock processed: ${input.goal}`,
      artifacts: [{ name: "mock-output", type: "text", content: "mock data" }],
      duration: 42,
    };
  }
}

test("BaseAgent — mock agent can be instantiated", () => {
  const mem = new BowoMemory(path.join(tmpDir, "mem-agent"));
  const comm = new Communication();
  const agent = new MockAgent(
    {
      name: "mock-agent",
      displayName: "Mock Agent",
      icon: "🧪",
      description: "A test mock agent",
      systemPrompt: "You are a mock.",
      capabilities: ["testing"],
    },
    mem,
    comm,
    null
  );
  assertEqual(agent.config.name, "mock-agent", "agent name");
  assert(agent.config.capabilities.includes("testing"), "should have testing capability");
});

test("BaseAgent — execute returns TaskResult", async () => {
  const mem = new BowoMemory(path.join(tmpDir, "mem-agent2"));
  const comm = new Communication();
  const agent = new MockAgent(
    {
      name: "mock-agent",
      displayName: "Mock Agent",
      icon: "🧪",
      description: "A test mock agent",
      systemPrompt: "You are a mock.",
      capabilities: ["testing"],
    },
    mem,
    comm,
    null
  );
  const result = await agent.execute({
    taskId: "task-001",
    goal: "do something",
    context: {},
  });
  assertEqual(result.status, "completed", "status");
  assertEqual(result.agent, "mock-agent", "agent name in result");
  assert(result.summary.includes("do something"), "summary should contain goal");
  assertEqual(result.artifacts.length, 1, "should have 1 artifact");
  assertEqual(result.duration, 42, "duration");
});

test("BaseAgent — log writes to memory", () => {
  const mem = new BowoMemory(path.join(tmpDir, "mem-log"));
  const comm = new Communication();
  const agent = new MockAgent(
    {
      name: "mock-agent",
      displayName: "Mock Agent",
      icon: "🧪",
      description: "A test mock agent",
      systemPrompt: "You are a mock.",
      capabilities: ["testing"],
    },
    mem,
    comm,
    null
  );
  // Call protected log via bracket notation
  (agent as any).log("test message", { detail: 42 });
  const entries = mem.query({ agent: "mock-agent" });
  assert(entries.length > 0, "log should create memory entry");
});

// ══════════════════════════════════════════════════════════
// 5. Workflow
// ══════════════════════════════════════════════════════════
console.log("\n⚙️ Workflow Tests");

test("Workflow — registerAgent adds agent", () => {
  const workflow = new Workflow();
  const mem = new BowoMemory(path.join(tmpDir, "mem-wf"));
  const comm = new Communication();
  const agent = new MockAgent(
    {
      name: "mock-agent",
      displayName: "Mock Agent",
      icon: "🧪",
      description: "A test mock agent",
      systemPrompt: "You are a mock.",
      capabilities: ["testing"],
    },
    mem,
    comm,
    null
  );
  workflow.registerAgent(agent);
  assertEqual(workflow.getAgentNames().length, 1, "should have 1 agent");
  assertEqual(workflow.getAgentNames()[0], "mock-agent", "agent name");
});

test("Workflow — runPipeline executes steps", async () => {
  const workflow = new Workflow();
  const mem = new BowoMemory(path.join(tmpDir, "mem-wf2"));
  const comm = new Communication();
  const agent = new MockAgent(
    {
      name: "mock-agent",
      displayName: "Mock Agent",
      icon: "🧪",
      description: "A test mock agent",
      systemPrompt: "You are a mock.",
      capabilities: ["testing"],
    },
    mem,
    comm,
    null
  );
  workflow.registerAgent(agent);
  const pipeline = await workflow.runPipeline("test-pipeline", [
    { agentName: "mock-agent", input: { taskId: "t1", goal: "test goal", context: {} } },
  ]);
  assertEqual(pipeline.name, "test-pipeline", "pipeline name");
  assertEqual(pipeline.steps.length, 1, "should have 1 step");
  assertEqual(pipeline.steps[0].status, "completed", "step should be completed");
  assert(pipeline.steps[0].result !== undefined, "step should have result");
});

test("Workflow — unregistered agent is skipped", async () => {
  const workflow = new Workflow();
  const pipeline = await workflow.runPipeline("test-skip", [
    { agentName: "ghost-agent", input: { taskId: "t2", goal: "noop", context: {} } },
  ]);
  assertEqual(pipeline.steps[0].status, "skipped", "unregistered agent should be skipped");
});

// ══════════════════════════════════════════════════════════
// 6. Orchestrator
// ══════════════════════════════════════════════════════════
console.log("\n🤖 Orchestrator Tests");

test("Orchestrator — constructor initializes without error", () => {
  const orch = new Orchestrator({ logLevel: "warn" });
  assert(orch !== null, "orchestrator should be created");
});

test("Orchestrator — getStatus returns system status", () => {
  const orch = new Orchestrator({ logLevel: "warn" });
  const status = orch.getStatus();
  assert(Array.isArray(status.agents), "agents should be array");
  assert(status.agents.length > 0, "should have registered agents");
  assert(typeof status.memory === "object", "memory should be object");
  assert(typeof status.pipelines === "number", "pipelines should be number");
  assert(typeof status.llm === "object", "llm should be object");
  assert(typeof status.llm.available === "boolean", "llm.available should be boolean");
  assert(typeof status.modules === "object", "modules should be object");
});

test("Orchestrator — getMemory returns BowoMemory instance", () => {
  const orch = new Orchestrator({ logLevel: "warn" });
  const mem = orch.getMemory();
  assert(typeof mem.getSummary === "function", "should be BowoMemory");
});

test("Orchestrator — getCommunication returns Communication instance", () => {
  const orch = new Orchestrator({ logLevel: "warn" });
  const comm = orch.getCommunication();
  assert(typeof comm.send === "function", "should be Communication");
});

// ─── Summary ─────────────────────────────────────────────
console.log("\n" + "═".repeat(50));
console.log(`📊 Core Tests: ${total} total, ${passed} passed, ${failed} failed`);
console.log("═".repeat(50));

// Cleanup
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

process.exit(failed > 0 ? 1 : 0);

/**
 * BOWO Feature Module Tests
 * Tests: CostTracker, AuditLog, Sessions, RateLimiter, Webhooks,
 *        Templates, Learning, EnvValidator
 *
 * Modules that don't yet exist in the codebase are tested via
 * minimal inline implementations that match the expected API.
 *
 * Run: npx tsx tests/test-features.ts
 */

import { CostTracker } from "../src/cost-tracker.js";
import { AuditLog } from "../src/audit.js";
import { SessionManager } from "../src/sessions.js";
import { TemplateEngine } from "../src/templates.js";
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

async function testAsync(name: string, fn: () => Promise<void>) {
  total++;
  try {
    await fn();
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

// ─── Temp directory for tests ────────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bowo-test-features-"));

// ══════════════════════════════════════════════════════════
// Inline implementations for modules not yet in codebase
// ══════════════════════════════════════════════════════════

/** Minimal RateLimiter — token-bucket style */
class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per second

  constructor(maxTokens: number = 10, refillRate: number = 1) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
  }

  acquire(count: number = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  release(count: number = 1): void {
    this.tokens = Math.min(this.maxTokens, this.tokens + count);
  }

  canAcquire(count: number = 1): boolean {
    this.refill();
    return this.tokens >= count;
  }

  private refill(): void {
    // Instant refill for testing (no time-based logic)
    this.tokens = Math.min(this.maxTokens, this.tokens + this.refillRate);
  }
}

/** Minimal Webhook registry */
interface WebhookEntry {
  id: string;
  url: string;
  events: string[];
  triggeredCount: number;
}

class Webhooks {
  private hooks: Map<string, WebhookEntry> = new Map();
  private counter = 0;

  register(url: string, events: string[]): WebhookEntry {
    this.counter++;
    const entry: WebhookEntry = { id: `wh-${this.counter}`, url, events, triggeredCount: 0 };
    this.hooks.set(entry.id, entry);
    return entry;
  }

  list(): WebhookEntry[] {
    return Array.from(this.hooks.values());
  }

  trigger(event: string, _payload: unknown): WebhookEntry[] {
    const triggered: WebhookEntry[] = [];
    for (const hook of this.hooks.values()) {
      if (hook.events.includes(event) || hook.events.includes("*")) {
        hook.triggeredCount++;
        triggered.push(hook);
      }
    }
    return triggered;
  }
}

/** Minimal Learning module */
interface FeedbackEntry {
  agent: string;
  taskId: string;
  score: number; // 0-1
  timestamp: string;
}

class Learning {
  private feedback: FeedbackEntry[] = [];

  recordFeedback(agent: string, taskId: string, score: number): void {
    this.feedback.push({ agent, taskId, score, timestamp: new Date().toISOString() });
  }

  getAgentPerformance(agent: string): { avg: number; count: number } {
    const entries = this.feedback.filter((f) => f.agent === agent);
    if (entries.length === 0) return { avg: 0, count: 0 };
    const avg = entries.reduce((s, e) => s + e.score, 0) / entries.length;
    return { avg: Math.round(avg * 100) / 100, count: entries.length };
  }
}

/** Minimal EnvValidator */
class EnvValidator {
  private required: string[];
  private optional: string[];

  constructor(required: string[] = [], optional: string[] = []) {
    this.required = required;
    this.optional = optional;
  }

  validate(): { valid: boolean; missing: string[]; found: string[]; optionalPresent: string[] } {
    const missing: string[] = [];
    const found: string[] = [];
    const optionalPresent: string[] = [];

    for (const key of this.required) {
      if (process.env[key]) {
        found.push(key);
      } else {
        missing.push(key);
      }
    }

    for (const key of this.optional) {
      if (process.env[key]) {
        optionalPresent.push(key);
      }
    }

    return { valid: missing.length === 0, missing, found, optionalPresent };
  }
}

// ══════════════════════════════════════════════════════════
// 1. CostTracker
// ══════════════════════════════════════════════════════════
console.log("\n💰 CostTracker Tests");

test("CostTracker — constructor initializes with defaults", () => {
  const tracker = new CostTracker();
  assert(tracker !== null, "tracker should be created");
  const status = tracker.getBudgetStatus();
  assertEqual(status.currentTokens, 0, "initial tokens");
  assertEqual(status.currentCostUsd, 0, "initial cost");
});

test("CostTracker — recordDetailedUsage tracks tokens", () => {
  const tracker = new CostTracker();
  const cost = tracker.recordDetailedUsage("backend", { prompt: 1000, completion: 500, total: 1500 });
  assert(typeof cost === "number", "should return cost");
  assert(cost > 0, "cost should be > 0");
  const usage = tracker.getGlobalUsage();
  assertEqual(usage.total, 1500, "total tokens");
  assertEqual(usage.prompt, 1000, "prompt tokens");
  assertEqual(usage.completion, 500, "completion tokens");
});

test("CostTracker — generateReport includes agent breakdown", () => {
  const tracker = new CostTracker();
  tracker.recordDetailedUsage("backend", { prompt: 500, completion: 200, total: 700 });
  tracker.recordDetailedUsage("frontend", { prompt: 300, completion: 100, total: 400 });
  const report = tracker.generateReport();
  assert(typeof report.total === "object", "should have total");
  assert(typeof report.byAgent === "object", "should have byAgent");
  assert("backend" in report.byAgent, "should have backend");
  assert("frontend" in report.byAgent, "should have frontend");
  assert(report.total.tokens.total === 1100, "total tokens should be 1100");
});

test("CostTracker — reset clears all data", () => {
  const tracker = new CostTracker();
  tracker.recordDetailedUsage("agent1", { prompt: 100, completion: 50, total: 150 });
  tracker.reset();
  const usage = tracker.getGlobalUsage();
  assertEqual(usage.total, 0, "tokens after reset");
  assertEqual(usage.costUsd, 0, "cost after reset");
});

test("CostTracker — budget status tracks limits", () => {
  const tracker = new CostTracker({ budget: { maxTokens: 1000 } });
  tracker.recordDetailedUsage("a", { prompt: 400, completion: 200, total: 600 });
  const status = tracker.getBudgetStatus();
  assertEqual(status.tokenLimit, 1000, "token limit");
  assert(status.tokenUsagePercent > 0, "usage % should be > 0");
  assert(!status.exceeded, "should not be exceeded yet");
});

test("CostTracker — getSummary returns human-readable string", () => {
  const tracker = new CostTracker();
  tracker.recordDetailedUsage("planner", { prompt: 200, completion: 100, total: 300 });
  const summary = tracker.getSummary();
  assert(typeof summary === "string", "should be string");
  assert(summary.includes("Cost Tracker"), "should include title");
});

// ══════════════════════════════════════════════════════════
// 2. AuditLog
// ══════════════════════════════════════════════════════════
console.log("\n📋 AuditLog Tests");

const auditPath = path.join(tmpDir, "audit.json");

test("AuditLog — log creates an entry", () => {
  const audit = new AuditLog(auditPath);
  const entry = audit.log({ action: "test.action", agent: "tester", detail: "testing 123" });
  assert(typeof entry.id === "string", "entry should have id");
  assert(entry.id.startsWith("aud-"), "id should start with aud-");
  assertEqual(entry.agent, "tester", "agent");
  assertEqual(entry.detail, "testing 123", "detail");
  assertEqual(entry.success, true, "default success");
});

test("AuditLog — getLog / query returns entries", () => {
  const audit = new AuditLog(auditPath);
  audit.log({ action: "file.write", agent: "backend", detail: "wrote file" });
  audit.log({ action: "file.read", agent: "qa", detail: "read file" });
  const recent = audit.getRecent(10);
  assert(recent.length >= 2, "should have at least 2 entries");
});

test("AuditLog — query filters by agent", () => {
  const audit = new AuditLog(path.join(tmpDir, "audit-filter.json"));
  audit.log({ action: "action1", agent: "alpha", detail: "a1" });
  audit.log({ action: "action2", agent: "beta", detail: "b1" });
  audit.log({ action: "action3", agent: "alpha", detail: "a2" });
  const alphaEntries = audit.query({ agent: "alpha" });
  assertEqual(alphaEntries.length, 2, "alpha should have 2 entries");
});

test("AuditLog — getStats returns aggregate info", () => {
  const audit = new AuditLog(path.join(tmpDir, "audit-stats.json"));
  audit.log({ action: "ok.action", agent: "a", detail: "ok", success: true });
  audit.log({ action: "fail.action", agent: "b", detail: "fail", success: false });
  const stats = audit.getStats();
  assertEqual(stats.totalEntries, 2, "total entries");
  assertEqual(stats.successes, 1, "successes");
  assertEqual(stats.failures, 1, "failures");
  assert("ok.action" in stats.byAction, "should track by action");
});

test("AuditLog — clear removes all entries", () => {
  const audit = new AuditLog(path.join(tmpDir, "audit-clear.json"));
  audit.log({ action: "x", agent: "a", detail: "d" });
  audit.clear();
  assertEqual(audit.size, 0, "size after clear");
});

// ══════════════════════════════════════════════════════════
// 3. Sessions (SessionManager)
// ══════════════════════════════════════════════════════════
console.log("\n📂 Sessions Tests");

const sessionsDir = path.join(tmpDir, "sessions");

test("SessionManager — constructor creates sessions directory", () => {
  const mgr = new SessionManager(sessionsDir);
  assert(fs.existsSync(sessionsDir), "sessions dir should exist");
});

test("SessionManager — createSession returns session id", () => {
  const mgr = new SessionManager(path.join(tmpDir, "sessions-create"));
  const pipeline = {
    id: "pipe-001",
    name: "test-pipeline",
    steps: [
      { agentName: "planner", input: { taskId: "t1", goal: "plan", context: {} } as any, status: "pending" as const },
      { agentName: "backend", input: { taskId: "t2", goal: "build", context: {} } as any, status: "pending" as const },
    ],
    status: "running" as const,
    createdAt: new Date().toISOString(),
  };
  const sessionId = mgr.createSession(pipeline, "test goal");
  assert(typeof sessionId === "string", "should return session id");
  assert(sessionId.startsWith("session-"), "should start with session-");
});

test("SessionManager — loadSession retrieves saved session", () => {
  const dir = path.join(tmpDir, "sessions-load");
  const mgr = new SessionManager(dir);
  const pipeline = {
    id: "pipe-002",
    name: "load-test",
    steps: [{ agentName: "planner", input: { taskId: "t1", goal: "g", context: {} } as any, status: "pending" as const }],
    status: "running" as const,
    createdAt: new Date().toISOString(),
  };
  const sid = mgr.createSession(pipeline, "load test");
  const loaded = mgr.loadSession(sid);
  assert(loaded !== null, "loaded session should not be null");
  assertEqual(loaded!.goal, "load test", "goal");
  assertEqual(loaded!.totalSteps, 1, "totalSteps");
});

test("SessionManager — listSessions returns all sessions", () => {
  const dir = path.join(tmpDir, "sessions-list");
  const mgr = new SessionManager(dir);
  const pipeline = {
    id: "pipe-003",
    name: "list-test",
    steps: [{ agentName: "planner", input: { taskId: "t1", goal: "g", context: {} } as any, status: "pending" as const }],
    status: "running" as const,
    createdAt: new Date().toISOString(),
  };
  mgr.createSession(pipeline, "list test 1");
  mgr.createSession(pipeline, "list test 2");
  const sessions = mgr.listSessions();
  assert(sessions.length >= 2, "should list at least 2 sessions");
  assert(sessions[0].goal !== undefined, "each session should have goal");
});

test("SessionManager — saveSession persists updates", () => {
  const dir = path.join(tmpDir, "sessions-save");
  const mgr = new SessionManager(dir);
  const pipeline = {
    id: "pipe-004",
    name: "save-test",
    steps: [{ agentName: "planner", input: { taskId: "t1", goal: "g", context: {} } as any, status: "pending" as const }],
    status: "running" as const,
    createdAt: new Date().toISOString(),
  };
  const sid = mgr.createSession(pipeline, "save test");
  const session = mgr.loadSession(sid)!;
  session.status = "completed" as any;
  mgr.saveSession(session);
  const reloaded = mgr.loadSession(sid)!;
  assertEqual(reloaded.status, "completed", "status after save");
});

// ══════════════════════════════════════════════════════════
// 4. RateLimiter (inline)
// ══════════════════════════════════════════════════════════
console.log("\n🚦 RateLimiter Tests");

test("RateLimiter — acquire consumes tokens", () => {
  const limiter = new RateLimiter(5, 0); // no auto-refill
  assert(limiter.acquire(1), "should acquire 1 token");
  assert(limiter.acquire(1), "should acquire another");
  assert(limiter.acquire(1), "should acquire another");
  assert(limiter.acquire(1), "should acquire another");
  assert(limiter.acquire(1), "should acquire last token");
  assert(!limiter.acquire(1), "should fail when exhausted");
});

test("RateLimiter — release returns tokens", () => {
  const limiter = new RateLimiter(3, 0);
  limiter.acquire(3);
  assert(!limiter.acquire(1), "should fail when empty");
  limiter.release(2);
  assert(limiter.acquire(1), "should succeed after release");
  assert(limiter.acquire(1), "should succeed after release");
  assert(!limiter.acquire(1), "should fail again");
});

test("RateLimiter — canAcquire checks without consuming", () => {
  const limiter = new RateLimiter(2, 0);
  assert(limiter.canAcquire(2), "canAcquire should return true");
  assert(!limiter.canAcquire(3), "canAcquire should return false for too many");
  // Tokens should still be there
  assert(limiter.acquire(2), "tokens should not have been consumed");
});

// ══════════════════════════════════════════════════════════
// 5. Webhooks (inline)
// ══════════════════════════════════════════════════════════
console.log("\n🔗 Webhooks Tests");

test("Webhooks — register creates a webhook", () => {
  const wh = new Webhooks();
  const entry = wh.register("https://example.com/hook", ["pipeline.complete"]);
  assert(typeof entry.id === "string", "should have id");
  assertEqual(entry.url, "https://example.com/hook", "url");
  assertEqual(entry.events.length, 1, "events count");
});

test("Webhooks — list returns all registered hooks", () => {
  const wh = new Webhooks();
  wh.register("https://a.com", ["event.a"]);
  wh.register("https://b.com", ["event.b", "event.c"]);
  const list = wh.list();
  assertEqual(list.length, 2, "should have 2 webhooks");
});

test("Webhooks — trigger fires matching hooks", () => {
  const wh = new Webhooks();
  wh.register("https://a.com", ["deploy"]);
  wh.register("https://b.com", ["build"]);
  wh.register("https://c.com", ["*"]);
  const triggered = wh.trigger("deploy", { id: 1 });
  assertEqual(triggered.length, 2, "deploy hook + wildcard hook should trigger");
});

// ══════════════════════════════════════════════════════════
// 6. Templates (TemplateEngine)
// ══════════════════════════════════════════════════════════
console.log("\n📝 Templates Tests");

test("Templates — listTemplates returns built-in templates", () => {
  const engine = new TemplateEngine();
  const templates = engine.listTemplates();
  assert(templates.length > 0, "should have templates");
  assert(templates.every((t) => typeof t.name === "string"), "each template should have name");
  assert(templates.every((t) => typeof t.description === "string"), "each template should have description");
});

test("Templates — getTemplate retrieves by name", () => {
  const engine = new TemplateEngine();
  const tpl = engine.getTemplate("express-rest-api");
  assertEqual(tpl.name, "express-rest-api", "name");
  assert(typeof tpl.description === "string", "description should be string");
  assert(tpl.files.length > 0, "should have files");
  assert(typeof tpl.installCommands === "object", "installCommands should be array");
});

test("Templates — getTemplate throws for unknown name", () => {
  const engine = new TemplateEngine();
  let threw = false;
  try {
    engine.getTemplate("nonexistent-template-xyz");
  } catch {
    threw = true;
  }
  assert(threw, "should throw for unknown template");
});

test("Templates — getTemplate returns files with path and content", () => {
  const engine = new TemplateEngine();
  const tpl = engine.getTemplate("react-web-app");
  const firstFile = tpl.files[0];
  assert(typeof firstFile.path === "string", "file should have path");
  assert(typeof firstFile.content === "string", "file should have content");
  assert(firstFile.content.length > 0, "file content should not be empty");
});

// ══════════════════════════════════════════════════════════
// 7. Learning (inline)
// ══════════════════════════════════════════════════════════
console.log("\n🎓 Learning Tests");

test("Learning — recordFeedback stores feedback", () => {
  const learning = new Learning();
  learning.recordFeedback("backend", "task-001", 0.9);
  learning.recordFeedback("backend", "task-002", 0.7);
  learning.recordFeedback("frontend", "task-003", 0.85);
  const perf = learning.getAgentPerformance("backend");
  assertEqual(perf.count, 2, "backend should have 2 feedback entries");
});

test("Learning — getAgentPerformance computes average score", () => {
  const learning = new Learning();
  learning.recordFeedback("agent-a", "t1", 0.8);
  learning.recordFeedback("agent-a", "t2", 0.6);
  const perf = learning.getAgentPerformance("agent-a");
  assertEqual(perf.count, 2, "count");
  assertEqual(perf.avg, 0.7, "average score");
});

test("Learning — getAgentPerformance returns 0 for unknown agent", () => {
  const learning = new Learning();
  const perf = learning.getAgentPerformance("ghost");
  assertEqual(perf.avg, 0, "avg for unknown");
  assertEqual(perf.count, 0, "count for unknown");
});

// ══════════════════════════════════════════════════════════
// 8. EnvValidator (inline)
// ══════════════════════════════════════════════════════════
console.log("\n🔍 EnvValidator Tests");

test("EnvValidator — validate passes when all required vars exist", () => {
  process.env.TEST_BOWO_VAR_A = "set";
  process.env.TEST_BOWO_VAR_B = "set";
  const validator = new EnvValidator(["TEST_BOWO_VAR_A", "TEST_BOWO_VAR_B"]);
  const result = validator.validate();
  assert(result.valid, "should be valid");
  assertEqual(result.missing.length, 0, "no missing vars");
  delete process.env.TEST_BOWO_VAR_A;
  delete process.env.TEST_BOWO_VAR_B;
});

test("EnvValidator — validate fails when required vars missing", () => {
  delete process.env.TEST_BOWO_MISSING;
  const validator = new EnvValidator(["TEST_BOWO_MISSING"]);
  const result = validator.validate();
  assert(!result.valid, "should be invalid");
  assert(result.missing.includes("TEST_BOWO_MISSING"), "should list missing var");
});

test("EnvValidator — validate tracks optional vars", () => {
  process.env.TEST_BOWO_OPT = "present";
  const validator = new EnvValidator([], ["TEST_BOWO_OPT"]);
  const result = validator.validate();
  assert(result.valid, "should be valid (no required)");
  assert(result.optionalPresent.includes("TEST_BOWO_OPT"), "should find optional var");
  delete process.env.TEST_BOWO_OPT;
});

test("EnvValidator — validate with no constraints returns valid", () => {
  const validator = new EnvValidator();
  const result = validator.validate();
  assert(result.valid, "no constraints should be valid");
  assertEqual(result.missing.length, 0, "no missing");
});

// ─── Summary ─────────────────────────────────────────────
console.log("\n" + "═".repeat(50));
console.log(`📊 Features Tests: ${total} total, ${passed} passed, ${failed} failed`);
console.log("═".repeat(50));

// Cleanup
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

process.exit(failed > 0 ? 1 : 0);

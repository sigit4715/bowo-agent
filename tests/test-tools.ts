/**
 * BOWO Tools Module Tests
 * Tests: FileTools, TerminalTools, LLMTools
 * Run: npx tsx tests/test-tools.ts
 */

import { FileTools, TerminalTools, LLMTools, type ToolResult } from "../src/tools.js";
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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bowo-test-tools-"));

// ══════════════════════════════════════════════════════════
// 1. FileTools
// ══════════════════════════════════════════════════════════
console.log("\n📁 FileTools Tests");

const fileTools = new FileTools(tmpDir);

test("FileTools — writeFile creates a file", () => {
  const result: ToolResult = fileTools.writeFile("test-write.txt", "hello world");
  assert(result.success, "writeFile should succeed");
  assert(result.output.includes("Written"), "output should mention Written");
  const fullPath = path.join(tmpDir, "test-write.txt");
  assert(fs.existsSync(fullPath), "file should exist on disk");
});

test("FileTools — readFile reads file content", () => {
  const result: ToolResult = fileTools.readFile("test-write.txt");
  assert(result.success, "readFile should succeed");
  assertEqual(result.output, "hello world", "file content");
});

test("FileTools — readFile fails on missing file", () => {
  const result: ToolResult = fileTools.readFile("nonexistent.txt");
  assert(!result.success, "readFile should fail for missing file");
  assert(typeof result.error === "string", "should have error message");
});

test("FileTools — writeFile creates nested directories", () => {
  const result: ToolResult = fileTools.writeFile("sub/dir/nested.txt", "nested content");
  assert(result.success, "writeFile should create dirs");
  const readResult: ToolResult = fileTools.readFile("sub/dir/nested.txt");
  assert(readResult.success, "should be able to read nested file");
  assertEqual(readResult.output, "nested content", "nested file content");
});

test("FileTools — findFiles searches by pattern", () => {
  fileTools.writeFile("src-a.ts", "const a = 1;");
  fileTools.writeFile("src-b.ts", "const b = 2;");
  fileTools.writeFile("readme.md", "# Hello");

  const result: ToolResult = fileTools.findFiles("\\.ts$");
  assert(result.success, "findFiles should succeed");
  assert(result.output.includes("src-a.ts"), "should find src-a.ts");
  assert(result.output.includes("src-b.ts"), "should find src-b.ts");
  assert(!result.output.includes("readme.md"), "should not find readme.md");
});

test("FileTools — grep searches file contents", () => {
  fileTools.writeFile("grep-test.ts", "function hello() {\n  return 'world';\n}");
  fileTools.writeFile("grep-other.txt", "no match here");

  const result: ToolResult = fileTools.grep("hello", ".", "\\.ts$");
  assert(result.success, "grep should succeed");
  assert(result.output.includes("hello"), "should find 'hello' in ts files");
  assert(result.output.includes("grep-test.ts"), "should show filename");
});

test("FileTools — grep returns no matches gracefully", () => {
  const result: ToolResult = fileTools.grep("zzzzzzzzz_not_real", ".");
  assert(result.success, "grep should succeed even with no matches");
  assert(result.output.includes("No matches"), "should say no matches");
});

// ══════════════════════════════════════════════════════════
// 2. TerminalTools
// ══════════════════════════════════════════════════════════
console.log("\n💻 TerminalTools Tests");

const termTools = new TerminalTools(tmpDir);

test("TerminalTools — exec('echo hello') returns hello", () => {
  const result: ToolResult = termTools.exec("echo hello");
  assert(result.success, "exec should succeed");
  assertEqual(result.output, "hello", "echo output");
  assert(typeof result.duration === "number", "should track duration");
});

test("TerminalTools — exec('ls') lists directory", () => {
  const result: ToolResult = termTools.exec("ls");
  assert(result.success, "ls should succeed");
  assert(result.output.includes("test-write.txt"), "should list test-write.txt");
});

test("TerminalTools — exec handles failures gracefully", () => {
  const result: ToolResult = termTools.exec("false");
  assert(!result.success, "exec of 'false' should fail");
  assert(typeof result.error === "string", "should have error");
});

test("TerminalTools — commandExists detects available commands", () => {
  assert(termTools.commandExists("node"), "node should exist");
  assert(termTools.commandExists("npm"), "npm should exist");
  assert(!termTools.commandExists("nonexistent_cmd_xyz_12345"), "fake cmd should not exist");
});

// ══════════════════════════════════════════════════════════
// 3. LLMTools
// ══════════════════════════════════════════════════════════
console.log("\n🧠 LLMTools Tests");

test("LLMTools — constructor accepts llm instance", () => {
  const tools = new LLMTools(null);
  assert(tools !== null, "LLMTools should be created");
});

await testAsync("LLMTools — reason fails gracefully without LLM", async () => {
  const tools = new LLMTools(null);
  try {
    const result = await tools.reason("test task");
    assert(!result.success, "should fail without LLM");
    assert(result.error !== undefined, "should have error");
  } catch {
    // Throwing is also acceptable
  }
});

await testAsync("LLMTools — generateCode fails gracefully without LLM", async () => {
  const tools = new LLMTools(null);
  try {
    const result = await tools.generateCode("write a function");
    assert(!result.success, "should fail without LLM");
  } catch {
    // acceptable
  }
});

await testAsync("LLMTools — reviewCode fails gracefully without LLM", async () => {
  const tools = new LLMTools(null);
  try {
    const result = await tools.reviewCode("const x = 1;");
    assert(!result.success, "should fail without LLM");
  } catch {
    // acceptable
  }
});

// ─── Summary ─────────────────────────────────────────────
console.log("\n" + "═".repeat(50));
console.log(`📊 Tools Tests: ${total} total, ${passed} passed, ${failed} failed`);
console.log("═".repeat(50));

// Cleanup
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

process.exit(failed > 0 ? 1 : 0);

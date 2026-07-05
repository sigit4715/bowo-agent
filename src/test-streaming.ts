/**
 * Smoke test for StreamingServer
 */

import { StreamingServer, streamHermesResponse } from "./streaming-server.js";

async function testBasicFlow() {
  const server = new StreamingServer({ flushIntervalMs: 50, tokenBufferSize: 3 });

  // Create session
  const session = server.createSession("test-agent");
  console.log(`✅ Created session: ${session.id}`);
  console.assert(session.status === "streaming", "Session should be streaming");
  console.assert(session.tokens === 0, "Tokens should be 0");

  // Subscribe and collect events
  const events: any[] = [];
  const unsub = server.subscribe(session.id, (e) => events.push(e));
  console.assert(typeof unsub === "function", "Unsubscribe should be a function");

  // Create a fake async generator
  async function* fakeGenerator() {
    const words = ["Hello", " ", "world", "!", " This", " is", " a", " test", ".", " Goodbye", "!"];
    for (const w of words) {
      yield w;
    }
  }

  // Stream response
  await server.streamResponse(session.id, fakeGenerator());

  console.log(`✅ Streamed ${session.tokens} tokens`);
  console.assert(session.status === "completed", "Session should be completed");
  console.assert(session.tokens === 11, `Expected 11 tokens, got ${session.tokens}`);
  console.assert(events.length > 0, `Should have events, got ${events.length}`);

  // Check event types
  const types = events.map((e: any) => e.type);
  console.assert(types.includes("metadata"), "Should have metadata event");
  console.assert(types.includes("token"), "Should have token events");
  console.assert(types.includes("done"), "Should have done event");

  // Check batched tokens (buffer size was 3, 11 tokens → 3 batches of 3 + 1 of 2)
  const tokenEvents = events.filter((e: any) => e.type === "token");
  console.assert(tokenEvents.length === 4, `Expected 4 batched token events, got ${tokenEvents.length}`);

  // Unsubscribe
  unsub();
  server.subscribe(session.id, () => {}); // re-add for stats check

  // Stats
  const stats = server.getStats();
  console.assert(stats.totalSessions === 1, `Expected 1 total, got ${stats.totalSessions}`);
  console.assert(stats.activeSessions === 0, `Expected 0 active, got ${stats.activeSessions}`);
  console.assert(stats.totalTokens === 11, `Expected 11 total tokens, got ${stats.totalTokens}`);
  console.assert(stats.avgTokensPerSession === 11, `Expected 11 avg, got ${stats.avgTokensPerSession}`);
  console.log(`✅ Stats: ${JSON.stringify(stats)}`);

  // Cleanup
  const removed = server.removeSession(session.id);
  console.assert(removed === true, "Should remove completed session");
  console.assert(server.getSession(session.id) === undefined, "Session should be gone");

  server.destroy();
  console.log("✅ All basic tests passed!\n");
}

async function testCancellation() {
  const server = new StreamingServer({ flushIntervalMs: 50, tokenBufferSize: 2 });

  const session = server.createSession("cancel-test");

  // Infinite generator that we'll cancel
  async function* infiniteGenerator() {
    let i = 0;
    while (true) {
      yield `token-${i++}`;
    }
  }

  // Start streaming in background
  const streamPromise = server.streamResponse(session.id, infiniteGenerator());

  // Give it a moment to produce some tokens
  await new Promise((r) => setTimeout(r, 150));
  console.assert(server.cancelSession(session.id) === true, "Should cancel successfully");

  // Wait for the stream to finish
  await streamPromise;
  console.assert(session.status === "error", "Cancelled session should be error");
  console.assert(session.tokens > 0, `Should have some tokens: ${session.tokens}`);
  console.log(`✅ Cancelled after ${session.tokens} tokens`);

  server.destroy();
  console.log("✅ Cancellation test passed!\n");
}

async function testMaxConcurrent() {
  const server = new StreamingServer({ maxConcurrentStreams: 2 });

  server.createSession("a");
  server.createSession("b");

  try {
    server.createSession("c");
    console.assert(false, "Should have thrown");
  } catch (e: any) {
    console.assert(e.message.includes("Max concurrent"), `Wrong error: ${e.message}`);
  }

  server.destroy();
  console.log("✅ Max concurrent test passed!\n");
}

async function main() {
  console.log("🧪 Running StreamingServer tests...\n");
  await testBasicFlow();
  await testCancellation();
  await testMaxConcurrent();
  console.log("🎉 All tests passed!");
}

main().catch((e) => {
  console.error("❌ Test failed:", e);
  process.exit(1);
});

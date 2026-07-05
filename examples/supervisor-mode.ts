/**
 * BOWO Supervisor Mode Example
 *
 * Demonstrates:
 * - Creating a supervisor pipeline
 * - Running with dynamic agent delegation
 * - Resuming from checkpoint
 */

import { SupervisorPipeline } from '../src/supervisor-pipeline.js';
import { SupervisorAgent } from '../src/supervisor.js';
import { CheckpointManager } from '../src/checkpoint.js';
import { ContextManager } from '../src/context.js';
import { BowoMemory } from '../src/memory.js';
import { Communication } from '../src/communication.js';
import { Workflow } from '../src/workflow.js';
import { PlannerAgent } from '../src/agents/planner.js';
import { ArchitectAgent } from '../src/agents/architect.js';
import { BackendAgent } from '../src/agents/backend.js';
import { FrontendAgent } from '../src/agents/frontend.js';
import { QAAgent } from '../src/agents/qa.js';
import { SecurityAgent } from '../src/agents/security.js';
import { ReporterAgent } from '../src/agents/reporter.js';

// ─── Setup ─────────────────────────────────────────────────

function setupWorkflow() {
  const memory = new BowoMemory();
  const comm = new Communication();
  const workflow = new Workflow();

  const agents = [
    new PlannerAgent(memory, comm),
    new ArchitectAgent(memory, comm),
    new BackendAgent(memory, comm),
    new FrontendAgent(memory, comm),
    new QAAgent(memory, comm),
    new SecurityAgent(memory, comm),
    new ReporterAgent(memory, comm),
  ];

  for (const agent of agents) {
    workflow.registerAgent(agent);
  }

  return { memory, comm, workflow, agents };
}

// ─── Example 1: Basic Supervisor Pipeline ──────────────────

async function basicSupervisorExample() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Supervisor Example 1: Basic Pipeline');
  console.log('═══════════════════════════════════════════════\n');

  const { memory, comm, workflow } = setupWorkflow();

  // Create the supervisor pipeline
  const pipeline = new SupervisorPipeline(workflow, memory, comm);

  // Listen for round completions
  pipeline.on('round:complete', (event) => {
    const icon = event.result?.status === 'completed' ? '✅' : '❌';
    console.log(`  ${icon} Round ${event.round}: ${event.agent} completed`);
  });

  console.log('🚀 Running supervisor pipeline...\n');

  const result = await pipeline.run('Build a REST API for a blog platform', {
    maxRounds: 8,  // Limit rounds for this example
  });

  // Print results
  console.log('📊 Pipeline Result:');
  console.log(`  Goal:     ${result.goal}`);
  console.log(`  Status:   ${result.status}`);
  console.log(`  Rounds:   ${result.rounds}`);
  console.log(`  Duration: ${result.duration}ms`);
  console.log(`  Artifacts: ${result.artifacts.length}`);

  if (result.checkpointId) {
    console.log(`  Checkpoint: ${result.checkpointId}`);
  }

  // Print context summary
  if (result.context) {
    console.log('\n  Context summary:');
    const ctx = result.context;
    if (ctx.plan) console.log('    📋 Plan: Present');
    if (ctx.architecture) console.log('    🏗  Architecture: Present');
    if (ctx.code) console.log('    ⚙  Code: Present');
    if (ctx.tests) console.log('    ✅ Tests: Present');
    if (ctx.report) console.log('    📊 Report: Present');
  }

  console.log();
  return result;
}

// ─── Example 2: Supervisor with Agent Restrictions ─────────

async function restrictedSupervisorExample() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Supervisor Example 2: Restricted Agents');
  console.log('═══════════════════════════════════════════════\n');

  const { memory, comm, workflow } = setupWorkflow();

  const pipeline = new SupervisorPipeline(workflow, memory, comm);

  console.log('🚀 Running with restricted agent set...\n');

  // Only allow planner, architect, and reporter
  const result = await pipeline.run('Design a microservices architecture', {
    maxRounds: 5,
    agents: ['planner', 'architect', 'reporter'],
  });

  console.log(`  Status: ${result.status}`);
  console.log(`  Rounds: ${result.rounds}`);
  console.log('  (Only planner, architect, reporter were used)\n');

  return result;
}

// ─── Example 3: Checkpoint and Resume ──────────────────────

async function checkpointResumeExample() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Supervisor Example 3: Checkpoint & Resume');
  console.log('═══════════════════════════════════════════════\n');

  const { memory, comm, workflow } = setupWorkflow();
  const checkpointMgr = new CheckpointManager('output/checkpoints-example');

  const pipeline = new SupervisorPipeline(workflow, memory, comm);

  // Run with low max rounds to force a "partial" completion
  console.log('🚀 Running first half (maxRounds: 3)...\n');

  const result1 = await pipeline.run('Build a complete todo application', {
    maxRounds: 3,
  });

  console.log(`  First run: ${result1.status} after ${result1.rounds} rounds`);

  // Save a checkpoint manually
  const checkpoint = checkpointMgr.autoSave(
    'supervisor-example',
    result1.rounds,
    result1.context,
    [],
  );

  console.log(`  💾 Saved checkpoint: ${checkpoint.id}\n`);

  // Now resume from that checkpoint
  console.log('🔄 Resuming from checkpoint...\n');

  const pipeline2 = new SupervisorPipeline(workflow, memory, comm);

  const result2 = await pipeline2.run('Build a complete todo application', {
    maxRounds: 8,
    resumeFrom: checkpoint.id,
  });

  console.log(`  Resumed run: ${result2.status} after ${result2.rounds} rounds`);
  console.log(`  Total artifacts: ${result2.artifacts.length}\n`);
}

// ─── Example 4: Standalone Supervisor Agent ────────────────

async function standaloneSupervisorExample() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Supervisor Example 4: Standalone Agent');
  console.log('═══════════════════════════════════════════════\n');

  // Create a standalone supervisor (no pipeline, just decision-making)
  const supervisor = new SupervisorAgent({
    maxRounds: 10,
    allowedAgents: ['planner', 'architect', 'backend', 'qa', 'reporter'],
  });

  // Simulate a multi-round decision process
  const context: Record<string, any> = { goal: 'Build a payment processing system' };
  const history: { agent: string; result: any }[] = [];

  console.log('🧠 Simulating supervisor decisions...\n');

  let rounds = 0;
  while (rounds < 6) {
    rounds++;

    // Get supervisor decision
    const decision = await supervisor.decide(context, history);

    console.log(`  Round ${rounds}:`);
    console.log(`    Next agent: ${decision.nextAgent}`);
    console.log(`    Reason: ${decision.reason}`);
    console.log(`    Done: ${decision.done}`);

    if (decision.done) {
      console.log('\n  ✅ Pipeline complete!');
      break;
    }

    // Simulate agent execution (update context)
    history.push({
      agent: decision.nextAgent,
      result: { status: 'completed', summary: `Simulated ${decision.nextAgent}` },
    });

    // Simulate context updates
    switch (decision.nextAgent) {
      case 'planner':
        context.plan = { subtasks: [{ agent: 'architect', description: 'Design system' }] };
        break;
      case 'architect':
        context.architecture = { components: ['payment-service', 'notification-service'] };
        break;
      case 'backend':
        context.code = { backend: { files: ['server.ts', 'routes.ts'] } };
        break;
      case 'qa':
        context.tests = { passed: true, coverage: 85 };
        break;
      case 'reporter':
        context.report = { summary: 'System built successfully' };
        break;
    }

    console.log();
  }

  // Print decision history
  const history2 = supervisor.getHistory();
  console.log(`  📋 Decision history (${history2.length} decisions):`);
  for (const d of history2) {
    console.log(`    → ${d.nextAgent}: ${d.reason}`);
  }
  console.log();
}

// ─── Run All Examples ──────────────────────────────────────

async function main() {
  try {
    await basicSupervisorExample();
    await restrictedSupervisorExample();
    await checkpointResumeExample();
    await standaloneSupervisorExample();

    console.log('═══════════════════════════════════════════════');
    console.log('  ✅ All Supervisor Examples Complete');
    console.log('═══════════════════════════════════════════════\n');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();

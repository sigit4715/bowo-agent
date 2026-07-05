/**
 * BOWO Agent Composition Example
 *
 * Demonstrates:
 * - Creating agent chains (A → B → C)
 * - Creating agent groups with different strategies
 * - Conditional routing within chains
 * - Executing chains and groups
 */

import { AgentComposer, type AgentChain, type AgentGroup } from '../src/agent-composition.js';
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

function createComposer() {
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

  const composer = new AgentComposer(workflow, memory, comm);
  return { composer, memory, comm, workflow };
}

// ─── Example 1: Agent Chain ────────────────────────────────

async function chainExample() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Composition Example 1: Agent Chain');
  console.log('═══════════════════════════════════════════════\n');

  const { composer } = createComposer();

  // Create a chain: planner → architect → backend
  const chain = composer.createChain('dev-pipeline', [
    { agentName: 'planner' },
    { agentName: 'architect' },
    { agentName: 'backend' },
  ]);

  console.log(`Created chain: "${chain.name}" (${chain.id})`);
  console.log(`Steps: ${chain.steps.map((s) => s.agentName).join(' → ')}\n`);

  // List all chains
  const allChains = composer.listChains();
  console.log(`Total chains: ${allChains.length}\n`);

  // Execute the chain
  console.log('⚡ Executing chain...\n');
  const result = await composer.executeChain(chain, {
    goal: 'Build a user authentication API',
  });

  console.log('📊 Chain Result:');
  console.log(`  Status: ${result.status}`);
  console.log(`  Steps: ${result.steps.length}`);
  console.log(`  Total duration: ${result.totalDuration}ms`);

  for (const step of result.steps) {
    const icon = step.result?.status === 'completed' ? '✅' : '❌';
    console.log(`    ${icon} ${step.agent} — ${step.duration}ms`);
  }

  if (result.finalOutput) {
    console.log(`\n  Final output summary: ${result.finalOutput.summary ?? 'N/A'}`);
  }

  console.log();
}

// ─── Example 2: Agent Groups ───────────────────────────────

async function groupExamples() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Composition Example 2: Agent Groups');
  console.log('═══════════════════════════════════════════════\n');

  const { composer } = createComposer();

  // ── Sequential Group ───────────────────────────────
  console.log('  📋 Sequential Group:');
  console.log('  Agents run one after another, each receiving the previous output.\n');

  const sequentialGroup = composer.createGroup(
    'sequential-dev',
    ['planner', 'architect', 'backend'],
    'sequential',
  );

  const seqResult = await composer.executeGroup(sequentialGroup, {
    goal: 'Build a blog platform',
  });

  if (Array.isArray(seqResult)) {
    for (const r of seqResult) {
      const icon = r.result?.status === 'completed' ? '✅' : '❌';
      console.log(`    ${icon} ${r.agent}`);
    }
  }
  console.log();

  // ── Parallel Group ─────────────────────────────────
  console.log('  📋 Parallel Group:');
  console.log('  All agents run simultaneously with the same input.\n');

  const parallelGroup = composer.createGroup(
    'parallel-review',
    ['qa', 'security'],
    'parallel',
  );

  const parResult = await composer.executeGroup(parallelGroup, {
    goal: 'Review the authentication module',
    code: 'export function authenticate(user: User) { ... }',
  });

  if (Array.isArray(parResult)) {
    for (const r of parResult) {
      const status = r.status === 'fulfilled' ? '✅' : '❌';
      console.log(`    ${status} ${r.agent}`);
    }
  }
  console.log();

  // ── Voting Group ───────────────────────────────────
  console.log('  📋 Voting Group:');
  console.log('  All agents run in parallel, majority result wins.\n');

  const votingGroup = composer.createGroup(
    'architecture-vote',
    ['planner', 'architect', 'backend'],
    'voting',
  );

  const voteResult = await composer.executeGroup(votingGroup, {
    goal: 'Choose the best architecture for a real-time chat system',
  });

  if (voteResult?.winner) {
    console.log(`    🏆 Winner: ${voteResult.winner.agent ?? 'N/A'}`);
    console.log(`    Votes:`);
    for (const [key, count] of Object.entries(voteResult.votes ?? {})) {
      console.log(`      ${key.slice(0, 50)}: ${count} votes`);
    }
  }
  console.log();

  // ── Round-Robin Group ──────────────────────────────
  console.log('  📋 Round-Robin Group:');
  console.log('  Agents run sequentially, fastest/best result selected.\n');

  const robinGroup = composer.createGroup(
    'best-agent',
    ['backend', 'frontend', 'qa'],
    'round-robin',
  );

  const robinResult = await composer.executeGroup(robinGroup, {
    goal: 'Analyze code quality',
  });

  if (robinResult?.best) {
    console.log(`    🏆 Best: ${robinResult.best.agent ?? 'N/A'}`);
    console.log(`    Rankings:`);
    for (const r of robinResult.rankings ?? []) {
      console.log(`      ${r.agent}: ${r.duration}ms`);
    }
  }
  console.log();

  // List all groups
  const allGroups = composer.listGroups();
  console.log(`  Total groups created: ${allGroups.length}\n`);
}

// ─── Example 3: Conditional Chain Routing ──────────────────

async function conditionalRoutingExample() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Composition Example 3: Conditional Routing');
  console.log('═══════════════════════════════════════════════\n');

  const { composer } = createComposer();

  // Create a chain with branching:
  //   planner → architect → {backend or frontend} based on condition
  const chain = composer.createChain('conditional-dev', [
    { agentName: 'planner' },
    { agentName: 'architect' },
    { agentName: 'backend' },
    { agentName: 'frontend' },
    { agentName: 'qa' },
    { agentName: 'reporter' },
  ]);

  console.log(`Created chain: "${chain.name}"`);
  console.log(`Steps: ${chain.steps.map((s) => s.agentName).join(' → ')}\n`);

  // Add conditional routing:
  // After architect, if the plan mentions "frontend", go to frontend first;
  // otherwise go to backend first
  composer.addConditionalRouting(
    chain.id,
    'architect',                           // After this agent...
    (result) => {
      // Route based on result content
      const resultStr = JSON.stringify(result).toLowerCase();
      return resultStr.includes('frontend') || resultStr.includes('ui');
    },
    'frontend',                            // If condition is true -> go here
    'backend',                             // If condition is false -> go here
  );

  console.log('Added conditional routing:');
  console.log('  architect -> frontend (if plan mentions frontend/UI)');
  console.log('  architect -> backend (otherwise)\n');

  // Execute
  console.log('⚡ Executing conditional chain...\n');
  const result = await composer.executeChain(chain, {
    goal: 'Build a responsive dashboard with real-time updates',
  });

  console.log('📊 Results:');
  console.log(`  Status: ${result.status}`);
  console.log(`  Steps executed: ${result.steps.map((s) => s.agent).join(' -> ')}`);
  console.log(`  Total duration: ${result.totalDuration}ms`);

  for (const step of result.steps) {
    console.log(`    ✅ ${step.agent} — ${step.duration}ms`);
  }

  console.log();
}

// ─── Example 4: Complex Composition ────────────────────────

async function complexCompositionExample() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Composition Example 4: Complex Workflow');
  console.log('═══════════════════════════════════════════════\n');

  const { composer } = createComposer();

  // Step 1: Planning chain
  console.log('  Phase 1: Planning');
  const planningChain = composer.createChain('planning', [
    { agentName: 'planner' },
    { agentName: 'architect' },
  ]);

  const planResult = await composer.executeChain(planningChain, {
    goal: 'Build an e-commerce platform with product catalog, cart, and checkout',
  });

  console.log(`    Status: ${planResult.status}`);
  console.log(`    Duration: ${planResult.totalDuration}ms\n`);

  // Step 2: Parallel implementation (backend + frontend)
  console.log('  Phase 2: Parallel Implementation');
  const implGroup = composer.createGroup(
    'implementation',
    ['backend', 'frontend'],
    'parallel',
  );

  const implResult = await composer.executeGroup(implGroup, {
    goal: 'Implement the e-commerce platform',
    plan: planResult.finalOutput,
  });

  if (Array.isArray(implResult)) {
    for (const r of implResult) {
      console.log(`    ${r.result?.status === 'completed' ? '✅' : '❌'} ${r.agent}`);
    }
  }
  console.log();

  // Step 3: Quality review (voting)
  console.log('  Phase 3: Quality Review');
  const reviewGroup = composer.createGroup(
    'quality-review',
    ['qa', 'security'],
    'parallel',
  );

  const reviewResult = await composer.executeGroup(reviewGroup, {
    goal: 'Review the e-commerce platform implementation',
  });

  if (Array.isArray(reviewResult)) {
    for (const r of reviewResult) {
      console.log(`    ${r.result?.status === 'completed' ? '✅' : '❌'} ${r.agent}`);
    }
  }
  console.log();

  // Step 4: Final report
  console.log('  Phase 4: Final Report');
  const reportChain = composer.createChain('reporting', [
    { agentName: 'reporter' },
  ]);

  const reportResult = await composer.executeChain(reportChain, {
    goal: 'Generate final report for e-commerce platform',
    allResults: { plan: planResult, implementation: implResult, review: reviewResult },
  });

  console.log(`    Status: ${reportResult.status}`);
  console.log(`    Duration: ${reportResult.totalDuration}ms\n`);

  // Summary
  console.log('📊 Complex Composition Summary:');
  console.log(`  Planning: ${planResult.totalDuration}ms`);
  console.log(`  Implementation: Parallel (backend + frontend)`);
  console.log(`  Review: ${Array.isArray(reviewResult) ? reviewResult.length : 0} reviewers`);
  console.log(`  Report: ${reportResult.totalDuration}ms`);

  const totalDuration = planResult.totalDuration + reportResult.totalDuration;
  console.log(`  Total sequential time: ~${totalDuration}ms`);
  console.log(`  (Parallel implementation saved time by running concurrently)\n`);
}

// ─── Run All Examples ──────────────────────────────────────

async function main() {
  try {
    await chainExample();
    await groupExamples();
    await conditionalRoutingExample();
    await complexCompositionExample();

    console.log('═══════════════════════════════════════════════');
    console.log('  ✅ All Composition Examples Complete');
    console.log('═══════════════════════════════════════════════\n');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();

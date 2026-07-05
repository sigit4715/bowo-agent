/**
 * BOWO DAG Pipeline Example
 *
 * Demonstrates:
 * - Creating a DAG graph with dependencies
 * - Executing with parallel nodes
 * - Checking results
 */

import { DAGExecutor, buildSequentialGraph, buildParallelGraph, type DAGGraph, type DAGNode } from '../src/dag.js';
import { BowoMemory, MemoryType } from '../src/memory.js';
import { Communication } from '../src/communication.js';
import { Workflow } from '../src/workflow.js';
import { PlannerAgent } from '../src/agents/planner.js';
import { ArchitectAgent } from '../src/agents/architect.js';
import { BackendAgent } from '../src/agents/backend.js';
import { FrontendAgent } from '../src/agents/frontend.js';
import { QAAgent } from '../src/agents/qa.js';
import { ReporterAgent } from '../src/agents/reporter.js';

// ─── Example 1: Sequential Pipeline ────────────────────────

async function sequentialExample() {
  console.log('═══════════════════════════════════════════════');
  console.log('  DAG Example 1: Sequential Pipeline');
  console.log('═══════════════════════════════════════════════\n');

  const memory = new BowoMemory();
  const comm = new Communication();
  const workflow = new Workflow();

  // Register agents
  const agents = {
    planner: new PlannerAgent(memory, comm),
    architect: new ArchitectAgent(memory, comm),
    backend: new BackendAgent(memory, comm),
    qa: new QAAgent(memory, comm),
    reporter: new ReporterAgent(memory, comm),
  };

  for (const agent of Object.values(agents)) {
    workflow.registerAgent(agent);
  }

  const agentMap = new Map(Object.entries(agents));

  // Build a sequential graph: planner → architect → backend → qa → reporter
  const graph = buildSequentialGraph('sequential-dev', [
    { agentName: 'planner' },
    { agentName: 'architect' },
    { agentName: 'backend' },
    { agentName: 'qa' },
    { agentName: 'reporter' },
  ]);

  console.log(`Graph: ${graph.name} (${graph.id})`);
  console.log(`Nodes: ${graph.nodes.length}`);
  for (const node of graph.nodes) {
    const deps = node.dependsOn.length > 0 ? ` (depends on: ${node.dependsOn.join(', ')})` : '';
    console.log(`  ${node.id} → ${node.agentName}${deps}`);
  }
  console.log();

  // Create executor and run
  const executor = new DAGExecutor(agentMap, memory);

  // Monitor events
  executor.on('node:start', (e) => {
    console.log(`  ▶ Starting: ${e.nodeId} (${e.agentName})`);
  });
  executor.on('node:complete', (e) => {
    console.log(`  ✅ Completed: ${e.nodeId} in ${e.duration}ms [${e.status}]`);
  });

  console.log('⚡ Executing graph...\n');
  const result = await executor.execute(graph, {
    goal: 'Build a simple REST API for user management',
  });

  // Print results
  console.log('\n📊 Results:');
  console.log(`  Status: ${result.status}`);
  console.log(`  Total duration: ${result.totalDuration.toFixed(0)}ms`);
  console.log(`  Node results:`);

  result.nodeResults.forEach((nr, nodeId) => {
    const icon = nr.status === 'completed' ? '✅' : nr.status === 'failed' ? '❌' : '⏭';
    console.log(`    ${icon} ${nodeId}: ${nr.status} (${nr.duration}ms)`);
  });

  console.log();
}

// ─── Example 2: Parallel Pipeline ──────────────────────────

async function parallelExample() {
  console.log('═══════════════════════════════════════════════');
  console.log('  DAG Example 2: Parallel Pipeline');
  console.log('═══════════════════════════════════════════════\n');

  const memory = new BowoMemory();
  const comm = new Communication();
  const workflow = new Workflow();

  // Register agents
  const agents = {
    planner: new PlannerAgent(memory, comm),
    architect: new ArchitectAgent(memory, comm),
    backend: new BackendAgent(memory, comm),
    frontend: new FrontendAgent(memory, comm),
    qa: new QAAgent(memory, comm),
    reporter: new ReporterAgent(memory, comm),
  };

  for (const agent of Object.values(agents)) {
    workflow.registerAgent(agent);
  }

  const agentMap = new Map(Object.entries(agents));

  // Build parallel graph:
  //   [planner] → [architect] → {backend, frontend} (parallel) → [qa] → [reporter]
  const graph = buildParallelGraph('full-stack', [
    [{ agentName: 'planner' }],                           // Group 0
    [{ agentName: 'architect' }],                         // Group 1 (depends on 0)
    [{ agentName: 'backend' }, { agentName: 'frontend' }], // Group 2 (parallel, depends on 1)
    [{ agentName: 'qa' }],                                // Group 3 (depends on 2)
    [{ agentName: 'reporter' }],                          // Group 4 (depends on 3)
  ]);

  console.log(`Graph: ${graph.name}`);
  console.log(`Groups: 5 (with parallel backend + frontend)`);
  for (const node of graph.nodes) {
    const deps = node.dependsOn.length > 0 ? ` ← [${node.dependsOn.join(', ')}]` : '';
    console.log(`  ${node.id} (${node.agentName})${deps}`);
  }
  console.log();

  // Create executor
  const executor = new DAGExecutor(agentMap, memory);

  // Monitor events
  const startTimes = new Map<string, number>();
  executor.on('node:start', (e) => {
    startTimes.set(e.nodeId, Date.now());
    console.log(`  ▶ Started: ${e.agentName}`);
  });
  executor.on('node:complete', (e) => {
    console.log(`  ✅ Done:   ${e.agentName} — ${e.duration}ms (${e.status})`);
  });
  executor.on('node:error', (e) => {
    console.log(`  ❌ Error:  ${e.agentName} — ${e.error}`);
  });

  console.log('⚡ Executing graph (backend & frontend run in parallel)...\n');
  const result = await executor.execute(graph, {
    goal: 'Build a full-stack todo application',
    requirements: {
      backend: 'REST API with Express',
      frontend: 'React SPA',
    },
  });

  // Summary
  console.log('\n📊 Summary:');
  console.log(`  Graph: ${result.graphId}`);
  console.log(`  Status: ${result.status}`);
  console.log(`  Duration: ${result.totalDuration.toFixed(0)}ms`);

  const completed = Array.from(result.nodeResults.values()).filter((r) => r.status === 'completed');
  const failed = Array.from(result.nodeResults.values()).filter((r) => r.status === 'failed');
  const skipped = Array.from(result.nodeResults.values()).filter((r) => r.status === 'skipped');

  console.log(`  Completed: ${completed.length}`);
  console.log(`  Failed: ${failed.length}`);
  console.log(`  Skipped: ${skipped.length}`);

  console.log();
}

// ─── Example 3: Custom DAG with Conditions ─────────────────

async function conditionalExample() {
  console.log('═══════════════════════════════════════════════');
  console.log('  DAG Example 3: Conditional Nodes');
  console.log('═══════════════════════════════════════════════\n');

  const memory = new BowoMemory();
  const comm = new Communication();
  const workflow = new Workflow();

  // Register agents
  const agents = {
    planner: new PlannerAgent(memory, comm),
    architect: new ArchitectAgent(memory, comm),
    backend: new BackendAgent(memory, comm),
    frontend: new FrontendAgent(memory, comm),
    security: new (await import('../src/agents/security.js')).SecurityAgent(memory, comm),
    qa: new QAAgent(memory, comm),
    reporter: new ReporterAgent(memory, comm),
  };

  for (const agent of Object.values(agents)) {
    workflow.registerAgent(agent);
  }

  const agentMap = new Map(Object.entries(agents));

  // Build custom DAG:
  //   planner → architect → {backend, frontend} → {security (conditional), qa} → reporter
  const graph: DAGGraph = {
    id: `dag-custom-${Date.now()}`,
    name: 'conditional-workflow',
    nodes: [
      {
        id: 'plan',
        agentName: 'planner',
        dependsOn: [],
      },
      {
        id: 'design',
        agentName: 'architect',
        dependsOn: ['plan'],
      },
      {
        id: 'api',
        agentName: 'backend',
        dependsOn: ['design'],
      },
      {
        id: 'ui',
        agentName: 'frontend',
        dependsOn: ['design'],
      },
      {
        id: 'security-scan',
        agentName: 'security',
        dependsOn: ['api', 'ui'],
        // Only run security scan if there's an API component
        condition: (ctx) => {
          const apiResult = ctx['api'] as any;
          return apiResult?.status === 'completed';
        },
      },
      {
        id: 'tests',
        agentName: 'qa',
        dependsOn: ['api', 'ui'],
      },
      {
        id: 'report',
        agentName: 'reporter',
        dependsOn: ['tests', 'security-scan'],
      },
    ],
  };

  console.log(`Custom graph: ${graph.name}`);
  console.log(`Nodes: ${graph.nodes.length} (with conditional security scan)\n`);

  const executor = new DAGExecutor(agentMap, memory);

  executor.on('node:start', (e) => console.log(`  ▶ ${e.agentName}`));
  executor.on('node:complete', (e) => {
    const icon = e.status === 'skipped' ? '⏭' : '✅';
    console.log(`  ${icon} ${e.agentName} — ${e.duration}ms`);
  });

  console.log('⚡ Executing with conditions...\n');
  const result = await executor.execute(graph, {
    goal: 'Build a secure web application',
    securityRequired: true,
  });

  console.log(`\n📊 Status: ${result.status}`);
  console.log(`  Duration: ${result.totalDuration.toFixed(0)}ms`);

  // Check which nodes ran vs skipped
  result.nodeResults.forEach((nr, nodeId) => {
    if (nr.status === 'skipped') {
      console.log(`  ⏭ Skipped: ${nodeId} (condition not met)`);
    }
  });

  console.log();
}

// ─── Run All Examples ──────────────────────────────────────

async function main() {
  try {
    await sequentialExample();
    await parallelExample();
    await conditionalExample();

    console.log('═══════════════════════════════════════════════');
    console.log('  ✅ All DAG Examples Complete');
    console.log('═══════════════════════════════════════════════\n');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();

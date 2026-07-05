/**
 * BOWO Basic Usage Example
 *
 * Demonstrates:
 * - Creating an orchestrator
 * - Registering agents
 * - Executing a task
 * - Getting results and printing artifacts
 */

import { Orchestrator } from '../src/orchestrator.js';
import { BowoMemory, MemoryType } from '../src/memory.js';
import { Communication } from '../src/communication.js';
import { Workflow } from '../src/workflow.js';
import { PlannerAgent } from '../src/agents/planner.js';
import { BackendAgent } from '../src/agents/backend.js';
import { QAAgent } from '../src/agents/qa.js';
import { ReporterAgent } from '../src/agents/reporter.js';
import type { TaskInput } from '../src/agents/base.js';

// ─── 1. Create Orchestrator (full pipeline) ────────────────

async function basicOrchestratorExample() {
  console.log('═══════════════════════════════════════════════');
  console.log('  BOWO Basic Usage — Orchestrator Example');
  console.log('═══════════════════════════════════════════════\n');

  // Create the orchestrator with info-level logging
  const bowo = new Orchestrator({ logLevel: 'info' });

  // Check system status before running
  const status = bowo.getStatus();
  console.log('📊 System Status:');
  console.log(`  Agents: ${status.agents.join(', ')}`);
  console.log(`  LLM: ${status.llm.available ? `🟢 ${status.llm.model}` : '🔴 Offline (rule-based)'}`);
  console.log(`  Memory entries: ${status.memory.totalEntries}`);
  console.log();

  // Execute a task through the full pipeline
  console.log('📋 Executing task: "Build a simple todo API"');
  console.log();

  const result = await bowo.execute('Build a simple todo API', {
    // Optionally restrict which agents participate
    // agents: ['planner', 'backend', 'qa', 'reporter'],
  });

  // Print results
  console.log('\n═══════════════════════════════════════════════');
  console.log('  📊 Execution Result');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Pipeline ID: ${result.pipelineId}`);
  console.log(`  Status:      ${result.status}`);
  console.log(`  Artifacts:   ${result.totalArtifacts}`);
  console.log(`  Duration:    ${result.totalDuration}ms`);

  if (result.agentResults.length > 0) {
    console.log('\n  Agent Results:');
    for (const ar of result.agentResults) {
      const icon = ar.status === 'completed' ? '✅' : '❌';
      const tokens = ar.tokens ? ` (${ar.tokens} tok)` : '';
      console.log(`    ${icon} ${ar.agent.padEnd(14)} ${ar.status}${tokens}`);
    }
  }

  console.log('═══════════════════════════════════════════════\n');
}

// ─── 2. Manual Pipeline (lower-level) ──────────────────────

async function manualPipelineExample() {
  console.log('═══════════════════════════════════════════════');
  console.log('  BOWO Basic Usage — Manual Pipeline');
  console.log('═══════════════════════════════════════════════\n');

  // Create shared systems
  const memory = new BowoMemory();
  const comm = new Communication();
  const workflow = new Workflow();

  // Create and register agents
  const planner = new PlannerAgent(memory, comm);
  const backend = new BackendAgent(memory, comm);
  const qa = new QAAgent(memory, comm);
  const reporter = new ReporterAgent(memory, comm);

  workflow.registerAgent(planner);
  workflow.registerAgent(backend);
  workflow.registerAgent(qa);
  workflow.registerAgent(reporter);

  console.log(`Registered agents: ${workflow.getAgentNames().join(', ')}\n`);

  // Listen for pipeline events
  workflow.on('step:start', (step) => {
    console.log(`  ▶ Starting: ${step.agentName}`);
  });
  workflow.on('step:complete', (step) => {
    console.log(`  ✅ Completed: ${step.agentName} (${step.result?.duration ?? 0}ms)`);
  });
  workflow.on('pipeline:complete', (pipeline) => {
    console.log(`\n  Pipeline ${pipeline.id}: ${pipeline.status}`);
  });

  // Define pipeline steps
  const goal = 'Build a REST API for a blog platform';
  const taskId = `task-${Date.now()}`;

  const pipelineSteps = [
    {
      agentName: 'planner',
      input: { taskId, goal, context: {} } as TaskInput,
    },
    {
      agentName: 'backend',
      input: {
        taskId: `backend-${taskId}`,
        goal: 'Implement the REST API endpoints',
        context: { goal, phase: 'implementation' },
      } as TaskInput,
    },
    {
      agentName: 'qa',
      input: {
        taskId: `qa-${taskId}`,
        goal: 'Write tests for the API',
        context: { goal, phase: 'testing' },
      } as TaskInput,
    },
    {
      agentName: 'reporter',
      input: {
        taskId: `report-${taskId}`,
        goal: 'Generate final report',
        context: { goal, phase: 'reporting' },
      } as TaskInput,
    },
  ];

  // Execute the pipeline
  console.log('⚡ Running pipeline...\n');
  const pipeline = await workflow.runPipeline('Blog API Pipeline', pipelineSteps);

  // Print artifact summary
  const totalArtifacts = pipeline.steps.reduce(
    (sum, s) => sum + (s.result?.artifacts.length ?? 0),
    0,
  );

  console.log(`\n📦 Total artifacts generated: ${totalArtifacts}`);
  console.log(`📊 Pipeline status: ${pipeline.status}`);

  // Print each agent's artifacts
  for (const step of pipeline.steps) {
    if (step.result?.artifacts && step.result.artifacts.length > 0) {
      console.log(`\n  📄 ${step.agentName} artifacts:`);
      for (const artifact of step.result.artifacts) {
        console.log(`    - ${artifact.name} (${artifact.type})`);
        // Print first 200 chars of content
        const preview = artifact.content.slice(0, 200);
        console.log(`      ${preview}${artifact.content.length > 200 ? '...' : ''}`);
      }
    }
  }

  // Check memory
  const summary = memory.getSummary();
  console.log(`\n💾 Memory: ${summary.totalEntries} entries`);
}

// ─── Run Examples ──────────────────────────────────────────

async function main() {
  try {
    // Run manual pipeline (lower-level, no LLM required)
    await manualPipelineExample();
  } catch (err) {
    console.error('Error:', err);
  }
}

main();

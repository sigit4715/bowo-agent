/**
 * BOWO Custom Agent Example
 *
 * Demonstrates:
 * - Creating a custom agent extending BaseAgent
 * - Registering it with the workflow
 * - Executing a custom task
 */

import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult, type Artifact } from '../src/agents/base.js';
import { BowoMemory, MemoryType } from '../src/memory.js';
import { Communication, MessageType } from '../src/communication.js';
import { Workflow } from '../src/workflow.js';
import type { LLMClient } from '../src/llm.js';

// ─── Custom Agent: Data Analyst ────────────────────────────

/**
 * A custom agent that analyzes data and produces reports.
 * Demonstrates how to extend BaseAgent with custom logic.
 */
class DataAnalystAgent extends BaseAgent {
  constructor(memory: BowoMemory, communication: Communication, llm?: LLMClient) {
    const config: AgentConfig = {
      name: 'data-analyst',
      displayName: 'Data Analyst',
      icon: '📈',
      description: 'Analyzes data and produces insights and recommendations',
      systemPrompt: `You are a senior data analyst. Your job is to:
1. Analyze the given data or requirements
2. Identify key patterns and insights
3. Generate actionable recommendations
4. Create structured reports

Always provide data-driven insights with clear explanations.`,
      capabilities: [
        'data-analysis',
        'pattern-recognition',
        'insight-generation',
        'report-writing',
      ],
    };
    super(config, memory, communication, llm);
  }

  async execute(input: TaskInput): Promise<TaskResult> {
    const startTime = Date.now();
    const artifacts: Artifact[] = [];

    this.log('DataAnalyst starting', { taskId: input.taskId, goal: input.goal });

    try {
      // Step 1: Analyze the task
      let analysis: string;

      if (this.llm) {
        // Use LLM for intelligent analysis
        const llmResult = await this.llmReason(
          `Analyze the following task and provide data-driven insights:\n\n${input.goal}`,
          JSON.stringify(input.context),
        );
        analysis = llmResult.output;
      } else {
        // Rule-based fallback when LLM is offline
        analysis = this.generateRuleBasedAnalysis(input);
      }

      // Step 2: Create analysis artifact
      const analysisArtifact: Artifact = {
        name: 'analysis-report.md',
        type: 'markdown',
        content: this.formatReport(input.goal, analysis),
      };
      artifacts.push(analysisArtifact);

      // Step 3: Create structured data artifact
      const structuredData = {
        task: input.goal,
        analysisDate: new Date().toISOString(),
        insights: [
          'Data completeness: High',
          'Processing complexity: Medium',
          'Recommended approach: Iterative analysis',
        ],
        metrics: {
          estimatedEffort: 'Medium',
          confidenceScore: 0.85,
          riskLevel: 'Low',
        },
      };

      const dataArtifact: Artifact = {
        name: 'analysis-data.json',
        type: 'json',
        content: JSON.stringify(structuredData, null, 2),
      };
      artifacts.push(dataArtifact);

      // Step 4: Store results in memory
      this.memory.store(MemoryType.ARTIFACT, this.config.name, analysisArtifact, {
        tags: ['analysis', 'report'],
        metadata: { taskId: input.taskId },
      });

      // Step 5: Communicate results
      this.communication.send(
        MessageType.RESULT,
        this.config.name,
        'orchestrator',
        { summary: `Analysis complete for: ${input.goal}`, artifactCount: artifacts.length },
      );

      const duration = Date.now() - startTime;

      return {
        agent: this.config.name,
        taskId: input.taskId,
        status: 'completed',
        summary: `Analysis complete. Generated ${artifacts.length} artifacts.`,
        artifacts,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Store error in memory
      this.memory.store(MemoryType.ERROR, this.config.name, {
        error: String(error),
        taskId: input.taskId,
      });

      return {
        agent: this.config.name,
        taskId: input.taskId,
        status: 'failed',
        summary: `Analysis failed: ${String(error)}`,
        artifacts,
        duration,
      };
    }
  }

  // ── Helper Methods ──────────────────────────────────

  private generateRuleBasedAnalysis(input: TaskInput): string {
    const goal = input.goal.toLowerCase();
    const insights: string[] = [];

    // Pattern matching for different task types
    if (goal.includes('api') || goal.includes('endpoint')) {
      insights.push('• API design should follow RESTful conventions');
      insights.push('• Consider rate limiting and authentication');
      insights.push('• Plan for versioning from the start');
    }

    if (goal.includes('database') || goal.includes('data')) {
      insights.push('• Consider data normalization requirements');
      insights.push('• Plan for indexing on frequently queried fields');
      insights.push('• Evaluate if a NoSQL approach is more suitable');
    }

    if (goal.includes('ui') || goal.includes('frontend') || goal.includes('dashboard')) {
      insights.push('• Follow accessibility guidelines (WCAG 2.1)');
      insights.push('• Consider responsive design for mobile');
      insights.push('• Use component library for consistency');
    }

    if (goal.includes('test') || goal.includes('qa')) {
      insights.push('• Target 80%+ code coverage');
      insights.push('• Include unit, integration, and e2e tests');
      insights.push('• Set up CI/CD pipeline for automated testing');
    }

    if (insights.length === 0) {
      insights.push('• Task requires careful planning and decomposition');
      insights.push('• Consider dependencies and blocking requirements');
      insights.push('• Estimate effort and set milestones');
    }

    return insights.join('\n');
  }

  private formatReport(goal: string, analysis: string): string {
    return `# Data Analysis Report

## Task
${goal}

## Analysis
${analysis}

## Recommendations
1. Break the task into smaller, measurable milestones
2. Identify key stakeholders and their requirements
3. Set up monitoring and feedback loops early
4. Document decisions and rationale for future reference

## Next Steps
- Review analysis with the team
- Prioritize insights by impact and effort
- Create an action plan with timelines

---
*Generated by Data Analyst Agent on ${new Date().toISOString()}*
`;
  }
}

// ─── Custom Agent: API Designer ────────────────────────────

/**
 * Another custom agent example — designs API specifications.
 */
class APIDesignerAgent extends BaseAgent {
  constructor(memory: BowoMemory, communication: Communication, llm?: LLMClient) {
    const config: AgentConfig = {
      name: 'api-designer',
      displayName: 'API Designer',
      icon: '🔌',
      description: 'Designs RESTful API specifications with schemas and documentation',
      systemPrompt: 'You are an expert API designer. Create well-structured, documented APIs.',
      capabilities: ['api-design', 'schema-generation', 'documentation'],
    };
    super(config, memory, communication, llm);
  }

  async execute(input: TaskInput): Promise<TaskResult> {
    const startTime = Date.now();
    const artifacts: Artifact[] = [];

    try {
      // Generate an API spec
      const spec = this.generateAPISpec(input.goal, input.context);

      artifacts.push({
        name: 'api-spec.json',
        type: 'json',
        content: JSON.stringify(spec, null, 2),
      });

      // Store in memory
      this.memory.store(MemoryType.ARTIFACT, this.config.name, artifacts[0], {
        tags: ['api', 'spec'],
      });

      return {
        agent: this.config.name,
        taskId: input.taskId,
        status: 'completed',
        summary: `API spec generated with ${spec.endpoints.length} endpoints`,
        artifacts,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        agent: this.config.name,
        taskId: input.taskId,
        status: 'failed',
        summary: `API design failed: ${String(error)}`,
        artifacts,
        duration: Date.now() - startTime,
      };
    }
  }

  private generateAPISpec(goal: string, context: Record<string, unknown>) {
    // Simple rule-based API spec generation
    const endpoints = [
      { method: 'GET', path: '/api/v1/resources', description: 'List all resources' },
      { method: 'GET', path: '/api/v1/resources/:id', description: 'Get resource by ID' },
      { method: 'POST', path: '/api/v1/resources', description: 'Create a new resource' },
      { method: 'PUT', path: '/api/v1/resources/:id', description: 'Update a resource' },
      { method: 'DELETE', path: '/api/v1/resources/:id', description: 'Delete a resource' },
    ];

    return {
      openapi: '3.0.0',
      info: { title: goal, version: '1.0.0' },
      endpoints,
    };
  }
}

// ─── Run Example ───────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  BOWO Custom Agent Example');
  console.log('═══════════════════════════════════════════════\n');

  // Create shared systems
  const memory = new BowoMemory();
  const comm = new Communication();
  const workflow = new Workflow();

  // Create custom agents
  const analyst = new DataAnalystAgent(memory, comm);
  const apiDesigner = new APIDesignerAgent(memory, comm);

  console.log(`Created agents:`);
  console.log(`  ${analyst.config.icon} ${analyst.config.displayName} — ${analyst.config.description}`);
  console.log(`  ${apiDesigner.config.icon} ${apiDesigner.config.displayName} — ${apiDesigner.config.description}`);
  console.log();

  // Register with workflow
  workflow.registerAgent(analyst);
  workflow.registerAgent(apiDesigner);

  console.log(`Registered agents: ${workflow.getAgentNames().join(', ')}\n`);

  // Listen for messages
  comm.on('message', (msg) => {
    console.log(`  📨 ${msg.from} → ${msg.to}: ${JSON.stringify(msg.content)}`);
  });

  // ── Execute DataAnalyst task ────────────────────────
  console.log('───────────────────────────────────────────────');
  console.log('📈 Running Data Analyst...\n');

  const analysisResult = await analyst.execute({
    taskId: 'analysis-001',
    goal: 'Analyze the performance metrics for our user registration API',
    context: {
      timeframe: 'last-30-days',
      endpoints: ['/register', '/login', '/profile'],
      totalRequests: 150000,
      avgResponseTime: 245,
      errorRate: 0.02,
    },
  });

  console.log(`  Status: ${analysisResult.status}`);
  console.log(`  Summary: ${analysisResult.summary}`);
  console.log(`  Artifacts: ${analysisResult.artifacts.length}`);
  console.log(`  Duration: ${analysisResult.duration}ms`);

  for (const artifact of analysisResult.artifacts) {
    console.log(`\n  📄 ${artifact.name} (${artifact.type}):`);
    console.log(`  ${artifact.content.slice(0, 300)}${artifact.content.length > 300 ? '...' : ''}`);
  }

  // ── Execute APIDesigner task ────────────────────────
  console.log('\n───────────────────────────────────────────────');
  console.log('🔌 Running API Designer...\n');

  const designResult = await apiDesigner.execute({
    taskId: 'design-001',
    goal: 'Design API for a blog platform with posts, comments, and users',
    context: { version: 'v1', format: 'REST' },
  });

  console.log(`  Status: ${designResult.status}`);
  console.log(`  Summary: ${designResult.summary}`);
  console.log(`  Duration: ${designResult.duration}ms`);

  if (designResult.artifacts.length > 0) {
    const spec = JSON.parse(designResult.artifacts[0].content);
    console.log(`\n  📄 API Spec:`);
    console.log(`  Title: ${spec.info.title}`);
    console.log(`  Endpoints: ${spec.endpoints.length}`);
    for (const ep of spec.endpoints) {
      console.log(`    ${ep.method.padEnd(7)} ${ep.path} — ${ep.description}`);
    }
  }

  // ── Check memory ────────────────────────────────────
  console.log('\n───────────────────────────────────────────────');
  console.log('💾 Memory after execution:\n');

  const summary = memory.getSummary();
  console.log(`  Total entries: ${summary.totalEntries}`);
  console.log(`  By type:`);
  for (const [type, count] of Object.entries(summary.byType)) {
    console.log(`    ${type}: ${count}`);
  }
  console.log(`  By agent:`);
  for (const [agent, count] of Object.entries(summary.byAgent)) {
    console.log(`    ${agent}: ${count}`);
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  ✅ Custom Agent Example Complete');
  console.log('═══════════════════════════════════════════════\n');
}

main();

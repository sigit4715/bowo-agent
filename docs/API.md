# BOWO Agent System — API Documentation

> **Backend Orchestrator for Workflow Optimization**
> Version 1.0.0 · TypeScript · Node.js

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Core APIs](#core-apis)
  - [Orchestrator](#orchestrator)
  - [Workflow](#workflow)
  - [Memory (BowoMemory)](#memory-bowomemory)
  - [Communication](#communication)
- [Agent APIs](#agent-apis)
  - [BaseAgent](#baseagent)
  - [PlannerAgent](#planneragent)
  - [ArchitectAgent](#architectagent)
  - [BackendAgent](#backendagent)
  - [FrontendAgent](#frontendagent)
  - [QAAgent](#qaagent)
  - [DebugAgent](#debugagent)
  - [SecurityAgent](#securityagent)
  - [DevOpsAgent](#devopsagent)
  - [ReporterAgent](#reporteragent)
- [Feature APIs](#feature-apis)
  - [Recovery](#recovery)
  - [CostTracker](#costtracker)
  - [Streaming](#streaming)
  - [Templates](#templates)
  - [Audit](#audit)
  - [Sessions](#sessions)
  - [Monitoring](#monitoring)
  - [i18n](#i18n)
  - [Learning](#learning)
- [V3 APIs](#v3-apis)
  - [DAG](#dag-directed-acyclic-graph)
  - [Checkpoint](#checkpoint)
  - [Supervisor](#supervisor-agent)
  - [Context](#context-manager)
  - [StructuredOutput](#structured-output)
  - [AgentComposition](#agent-composition)
  - [SupervisorPipeline](#supervisor-pipeline)
- [V3.1 APIs](#v31-apis)
  - [Auth](#auth)
  - [Database](#database)
  - [Cache](#cache)
  - [WebSocket](#websocket)
  - [Sanitize](#sanitize)
- [Tool APIs](#tool-apis)
  - [FileTools](#filetools)
  - [TerminalTools](#terminaltools)
  - [LLMTools](#llmtools)
- [Integration](#integration)
  - [Hermes](#hermes-integration)
  - [LLM Providers](#llm-providers)
- [CLI Reference](#cli-reference)
- [Configuration](#configuration)

---

## Overview

BOWO (Backend Orchestrator for Workflow Optimization) is a multi-agent system that decomposes complex software engineering tasks and executes them through a coordinated pipeline of specialist agents.

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       Orchestrator                            │
│  ┌─────────────┐  ┌───────────┐  ┌─────────────────────┐   │
│  │   Memory     │  │  Comm Bus │  │   LLM Provider      │   │
│  │  (shared)    │◄─┤ (events)  │◄─┤ (OpenAI/etc.)       │   │
│  └──────┬──────┘  └─────┬─────┘  └─────────────────────┘   │
│         │               │                                    │
│  ┌──────▼───────────────▼──────────────────────────────┐    │
│  │                   Workflow Engine                     │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │    │
│  │  │ Pipeline │  │   DAG    │  │ Supervisor       │  │    │
│  │  │ Executor │  │ Executor │  │ Pipeline         │  │    │
│  │  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │    │
│  └───────┼──────────────┼──────────────────┼────────────┘    │
│          │              │                  │                  │
│  ┌───────▼──────────────▼──────────────────▼────────────┐    │
│  │              Specialist Agents                        │    │
│  │  📋Planner  🏗Architect  ⚙Backend  🎨Frontend        │    │
│  │  ✅QA       🔍Debug     🔒Security 🚀DevOps          │    │
│  │  📊Reporter  🧩Composer                              │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  Features: Recovery · CostTracker · Streaming ·       │    │
│  │  Templates · Audit · Sessions · Monitoring · i18n     │    │
│  │  ───────────────────────────────────────────────────  │    │
│  │  V3.1: Auth · Database · Cache · WebSocket · Sanitize │    │
│  └───────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Installation

```bash
# Clone the repository
git clone <repo-url> bowo-agent
cd bowo-agent

# Install dependencies
npm install

# Set up your LLM provider (choose one)
export OPENAI_API_KEY="sk-..."
# OR
export BOWO_LLM_PROVIDER=ollama
```

### First Run

```bash
# Run with a task
npx tsx src/index.ts --task "Build a REST API for a todo app"

# Or use the interactive CLI
npx tsx src/cli.ts
```

### Programmatic Usage

```typescript
import { Orchestrator } from './src/orchestrator.js';

const bowo = new Orchestrator({ logLevel: 'info' });
const result = await bowo.execute('Build a REST API for a todo app');
console.log(result);
```

---

## Core APIs

### Orchestrator

The main entry point that coordinates all agents, memory, communication, and features.

**Import:**
```typescript
import { Orchestrator, type OrchestratorConfig, type ExecutionResult } from './src/orchestrator.js';
```

**Constructor:**
```typescript
new Orchestrator(config?: Partial<OrchestratorConfig>)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `logLevel` | `"debug" \| "info" \| "warn" \| "error"` | `"info"` | Logging verbosity |
| `language` | `"en" \| "id" \| "zh"` | `"en"` | UI language |

**Methods:**

```typescript
// Execute a task through the full pipeline
async execute(goal: string, options?: { agents?: string[] }): Promise<ExecutionResult>

// Get system status (agents, memory, LLM, modules)
getStatus(): {
  agents: string[];
  memory: MemorySummary;
  pipelines: number;
  llm: { available: boolean; model: string };
  modules: Record<string, boolean>;
}

// Access internal systems
getMemory(): BowoMemory
getCommunication(): Communication
```

**Properties (lazy-loaded modules):**

```typescript
costTracker: CostTracker | null
recovery: RecoveryExecutor | null
sessions: SessionManager | null
audit: AuditLog | null
templates: TemplateEngine | null
monitor: MonitoringCollector | null
hermesBrain: HermesBrain | null
cache: CacheManager | null
database: DatabaseManager | null
websocket: DashboardWebSocket | null
auth: AuthManager | null
sanitizer: InputSanitizer | null
agentComposer: AgentComposer | null
```

**Events:**
Inherits from `EventEmitter`. Emits pipeline lifecycle events.

**Example:**
```typescript
import { Orchestrator } from './src/orchestrator.js';

const bowo = new Orchestrator({ logLevel: 'info' });
const result = await bowo.execute('Build a todo API', { agents: ['planner', 'backend', 'qa'] });

console.log(`Status: ${result.status}`);
console.log(`Artifacts: ${result.totalArtifacts}`);
console.log(`Duration: ${result.totalDuration}ms`);

// Get detailed status
const status = bowo.getStatus();
console.log(`Agents: ${status.agents.join(', ')}`);
console.log(`LLM: ${status.llm.available ? status.llm.model : 'Offline'}`);
```

---

### Workflow

Pipeline execution engine. Defines and runs agent pipelines with sequential execution and event emission.

**Import:**
```typescript
import {
  Workflow,
  PipelineStatus,
  type Pipeline,
  type PipelineStep,
} from './src/workflow.js';
```

**Types:**

```typescript
enum PipelineStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
}

interface Pipeline {
  id: string;
  name: string;
  steps: PipelineStep[];
  status: PipelineStatus;
  createdAt: string;
  completedAt?: string;
}

interface PipelineStep {
  agentName: string;
  input: TaskInput;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: TaskResult;
  startedAt?: string;
  completedAt?: string;
}
```

**Methods:**

```typescript
// Register an agent for use in pipelines
registerAgent(agent: BaseAgent): void

// Create and execute a pipeline
async runPipeline(
  name: string,
  steps: { agentName: string; input: TaskInput }[]
): Promise<Pipeline>

// Query pipelines
getPipelines(): Pipeline[]
getPipeline(id: string): Pipeline | undefined
getAgentNames(): string[]
```

**Events:**
- `pipeline:start` — Pipeline begins
- `step:start` — Individual step begins
- `step:complete` — Step completed successfully
- `step:skipped` — Step was skipped
- `step:error` — Step threw an error
- `pipeline:complete` — Pipeline finished
- `pipeline:failed` — Pipeline failed

**Example:**
```typescript
import { Workflow } from './src/workflow.js';
import { BowoMemory } from './src/memory.js';
import { Communication } from './src/communication.js';
import { PlannerAgent } from './src/agents/planner.js';

const memory = new BowoMemory();
const comm = new Communication();
const workflow = new Workflow();

// Register agents
const planner = new PlannerAgent(memory, comm);
workflow.registerAgent(planner);

// Run a pipeline
const pipeline = await workflow.runPipeline('My Pipeline', [
  {
    agentName: 'planner',
    input: {
      taskId: 'task-001',
      goal: 'Build a login page',
      context: {},
    },
  },
]);

console.log(`Pipeline ${pipeline.id}: ${pipeline.status}`);
```

---

### Memory (BowaMemory)

Shared project memory system. All agents read from and write to this shared store.

**Import:**
```typescript
import { BowoMemory, MemoryType, type MemoryEntry, type MemorySummary } from './src/memory.js';
```

**Types:**

```typescript
enum MemoryType {
  DECISION = 'decision',
  ARTIFACT = 'artifact',
  ERROR = 'error',
  LEARNING = 'learning',
  STATE = 'state',
  TASK = 'task',
  RESULT = 'result',
}

interface MemoryEntry {
  id: string;
  type: MemoryType;
  agent: string;
  content: unknown;
  timestamp: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

interface MemorySummary {
  totalEntries: number;
  byType: Record<string, number>;
  byAgent: Record<string, number>;
  lastUpdated: string | null;
}
```

**Constructor:**
```typescript
new BowoMemory(storageDir?: string)  // default: 'output/memory'
```

**Methods:**

```typescript
// Store an entry
store(
  type: MemoryType,
  agent: string,
  content: unknown,
  options?: { tags?: string[]; metadata?: Record<string, unknown> }
): string  // returns entry ID

// Query entries with filters
query(filters: {
  type?: MemoryType;
  agent?: string;
  tags?: string[];
  limit?: number;
}): MemoryEntry[]

// Get recent entries
getRecent(n?: number): MemoryEntry[]  // default: 10

// Get entries by agent
getByAgent(agent: string): MemoryEntry[]

// Key-value state management
getState(key: string): unknown
setState(key: string, value: unknown, agent?: string): string

// Summary statistics
getSummary(): MemorySummary

// Clear all memory
clear(): void
```

**Example:**
```typescript
import { BowoMemory, MemoryType } from './src/memory.js';

const memory = new BowoMemory();

// Store a decision
memory.store(MemoryType.DECISION, 'planner', {
  approach: 'MVC pattern',
  reason: 'Scalability and separation of concerns',
}, { tags: ['architecture', 'backend'] });

// Query decisions
const decisions = memory.query({ type: MemoryType.DECISION, limit: 5 });

// State management
memory.setState('currentPhase', 'implementation');
const phase = memory.getState('currentPhase');

// Get summary
const summary = memory.getSummary();
console.log(`Total entries: ${summary.totalEntries}`);
```

---

### Communication

Event-based inter-agent messaging system.

**Import:**
```typescript
import { Communication, MessageType, type AgentMessage } from './src/communication.js';
```

**Types:**

```typescript
enum MessageType {
  TASK = 'task',
  RESULT = 'result',
  ERROR = 'error',
  QUESTION = 'question',
  ANSWER = 'answer',
  STATUS = 'status',
  BROADCAST = 'broadcast',
}

interface AgentMessage {
  id: string;
  type: MessageType;
  from: string;
  to: string | '*';
  content: unknown;
  timestamp: string;
  replyTo?: string;
  metadata: Record<string, unknown>;
}
```

**Methods:**

```typescript
// Send a direct message
send(
  type: MessageType,
  from: string,
  to: string,
  content: unknown,
  options?: { replyTo?: string; metadata?: Record<string, unknown> }
): AgentMessage

// Send a task assignment
sendTask(
  from: string,
  to: string,
  task: { description: string; context: unknown; priority: number }
): AgentMessage

// Send result back
sendResult(from: string, to: string, result: unknown, replyTo?: string): AgentMessage

// Broadcast to all agents
broadcast(from: string, content: unknown): AgentMessage

// Query messages
getMessagesFor(agent: string): AgentMessage[]
getAll(): AgentMessage[]
getConversation(agent1: string, agent2: string): AgentMessage[]
```

**Example:**
```typescript
import { Communication, MessageType } from './src/communication.js';

const comm = new Communication();

// Listen for messages
comm.on('message', (msg) => {
  console.log(`${msg.from} → ${msg.to}: ${JSON.stringify(msg.content)}`);
});

// Send a task
comm.sendTask('orchestrator', 'planner', {
  description: 'Break down the login feature',
  context: { project: 'my-app' },
  priority: 1,
});

// Broadcast status
comm.broadcast('orchestrator', { status: 'Pipeline started' });
```

---

## Agent APIs

### BaseAgent

Abstract base class for all specialist agents. Provides LLM, file I/O, and terminal tools.

**Import:**
```typescript
import {
  BaseAgent,
  type AgentConfig,
  type TaskInput,
  type TaskResult,
  type Artifact,
} from './src/agents/base.js';
```

**Types:**

```typescript
interface AgentConfig {
  name: string;
  displayName: string;
  icon: string;
  description: string;
  systemPrompt: string;
  capabilities: string[];
}

interface TaskInput {
  taskId: string;
  goal: string;
  context: Record<string, unknown>;
  parentTaskId?: string;
}

interface TaskResult {
  agent: string;
  taskId: string;
  status: 'completed' | 'failed' | 'partial';
  summary: string;
  artifacts: Artifact[];
  tokens?: number;
  duration: number;
}

interface Artifact {
  name: string;
  type: string;
  content: string;
  path?: string;
}
```

**Constructor:**
```typescript
abstract class BaseAgent {
  constructor(
    config: AgentConfig,
    memory: BowoMemory,
    communication: Communication,
    llm?: LLMClient | null,
    workDir?: string
  )
}
```

**Abstract Methods (must implement):**
```typescript
abstract execute(input: TaskInput): Promise<TaskResult>
```

**Protected Helpers:**

```typescript
// Memory & communication
protected log(message: string, data?: unknown): void
protected emit(type: string, data: unknown): void
protected getContext(taskId: string): Record<string, unknown>
protected getPreviousArtifacts(taskId: string): Artifact[]

// File I/O
protected readFile(path: string): ToolResult
protected writeFile(path: string, content: string): ToolResult
protected listDir(path?: string): ToolResult
protected findFiles(pattern: string, dir?: string): ToolResult
protected grep(pattern: string, dir?: string, filePattern?: string): ToolResult

// Terminal
protected exec(command: string, options?: { timeout?: number; cwd?: string }): ToolResult
protected npm(args: string, cwd?: string): ToolResult
protected git(args: string, cwd?: string): ToolResult

// LLM
protected llmReason(task: string, context?: string): Promise<ToolResult>
protected llmGenerateCode(task: string, language?: string, context?: string): Promise<ToolResult>
protected llmReviewCode(code: string, criteria?: string): Promise<ToolResult>
protected llmFixBug(error: string, code?: string, context?: string): Promise<ToolResult>
```

**Example (extending BaseAgent):**
```typescript
import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult } from './src/agents/base.js';
import type { BowoMemory } from './src/memory.js';
import type { Communication } from './src/communication.js';

class MyAgent extends BaseAgent {
  constructor(memory: BowoMemory, comm: Communication) {
    const config: AgentConfig = {
      name: 'my-agent',
      displayName: 'My Agent',
      icon: '🤖',
      description: 'A custom agent',
      systemPrompt: 'You are a helpful assistant.',
      capabilities: ['custom-task'],
    };
    super(config, memory, comm);
  }

  async execute(input: TaskInput): Promise<TaskResult> {
    const start = Date.now();
    // Use this.llmReason(), this.writeFile(), etc.
    return {
      agent: this.config.name,
      taskId: input.taskId,
      status: 'completed',
      summary: 'Task completed',
      artifacts: [],
      duration: Date.now() - start,
    };
  }
}
```

---

### PlannerAgent

📋 Breaks down complex tasks into actionable subtasks with dependencies.

**Import:**
```typescript
import { PlannerAgent } from './src/agents/planner.js';
```

```typescript
new PlannerAgent(memory: BowoMemory, communication: Communication, llm?: LLMClient, workDir?: string)
```

**Capabilities:** `task-decomposition`, `dependency-analysis`, `agent-assignment`

**Behavior:** Uses LLM to analyze the user's goal and create a structured plan with subtasks, estimated times, and agent assignments. Falls back to rule-based planning when LLM is offline.

---

### ArchitectAgent

🏗 Designs system architecture and generates diagrams.

**Import:**
```typescript
import { ArchitectAgent } from './src/agents/architect.js';
```

**Capabilities:** `architecture-design`, `diagram-generation`, `tech-selection`

---

### BackendAgent

⚙️ Implements backend code (APIs, services, databases).

**Import:**
```typescript
import { BackendAgent } from './src/agents/backend.js';
```

**Capabilities:** `api-implementation`, `database-design`, `business-logic`

**Languages:** Python, Node.js, Go

---

### FrontendAgent

🎨 Implements frontend code (UI, components, styles).

**Import:**
```typescript
import { FrontendAgent } from './src/agents/frontend.js';
```

**Capabilities:** `ui-implementation`, `component-design`, `responsive-layout`

**Frameworks:** React, Vue, Svelte

---

### QAAgent

✅ Creates test plans and test cases.

**Import:**
```typescript
import { QAAgent } from './src/agents/qa.js';
```

**Capabilities:** `test-planning`, `test-generation`, `coverage-analysis`

---

### DebugAgent

🔍 Diagnoses and fixes bugs.

**Import:**
```typescript
import { DebugAgent } from './src/agents/debug.js';
```

**Capabilities:** `bug-diagnosis`, `root-cause-analysis`, `fix-generation`

---

### SecurityAgent

🔒 Performs security audits and vulnerability scanning.

**Import:**
```typescript
import { SecurityAgent } from './src/agents/security.js';
```

**Capabilities:** `vulnerability-scanning`, `security-audit`, `dependency-analysis`

---

### DevOpsAgent

🚀 Handles deployment and infrastructure.

**Import:**
```typescript
import { DevOpsAgent } from './src/agents/devops.js';
```

**Capabilities:** `docker-configuration`, `k8s-deployment`, `ci-cd-setup`

**Targets:** Docker, Kubernetes, Cloud

---

### ReporterAgent

📊 Generates executive summary reports.

**Import:**
```typescript
import { ReporterAgent } from './src/agents/reporter.js';
```

**Capabilities:** `report-generation`, `summary-creation`, `metrics-aggregation`

**Output Format:** Markdown

---

## Feature APIs

### Recovery

Automatic retry and recovery for agent failures.

**Import:**
```typescript
import { RecoveryExecutor } from './src/recovery.js';
```

**Methods:**

```typescript
// Execute an agent with automatic recovery
async execute(
  agentName: string,
  input: TaskInput,
  options?: { maxRetries?: number; backoff?: number }
): Promise<{ result: TaskResult; retries: number }>

// Register an agent for recovery
registerAgent(agent: BaseAgent): void
```

**Example:**
```typescript
const recovery = new RecoveryExecutor();
recovery.registerAgent(backendAgent);

// Automatically retries on failure
const result = await recovery.execute('backend', {
  taskId: 'task-001',
  goal: 'Create API endpoint',
  context: {},
});
```

---

### CostTracker

Tracks token usage and API costs across all LLM calls.

**Import:**
```typescript
import { CostTracker } from './src/cost-tracker.js';
```

**Methods:**

```typescript
// Record a token usage event
record(model: string, tokens: { prompt: number; completion: number }, cost?: number): void

// Get summary
getSummary(): {
  totalTokens: number;
  totalCost: number;
  byModel: Record<string, { tokens: number; cost: number }>;
  byAgent: Record<string, { tokens: number; cost: number }>;
}

// Export to JSON
exportToJson(filePath?: string): void
```

---

### Streaming

Real-time streaming of agent outputs.

**Import:**
```typescript
import { StreamingManager } from './src/streaming.js';
```

**Methods:**

```typescript
// Create a stream for a task
createStream(taskId: string): StreamHandle

// Subscribe to stream events
on(event: 'data' | 'end' | 'error', callback: Function): void
```

---

### Templates

Task template engine for reusable agent configurations.

**Import:**
```typescript
import { TemplateEngine } from './src/templates.js';
```

**Methods:**

```typescript
// Register a template
register(name: string, template: TaskTemplate): void

// Get a template by name
get(name: string): TaskTemplate | undefined

// List all templates
list(): TaskTemplate[]

// Execute a template with variables
async execute(templateName: string, variables: Record<string, unknown>): Promise<TaskResult>
```

---

### Audit

Audit logging for all system actions.

**Import:**
```typescript
import { AuditLog } from './src/audit.js';
```

**Methods:**

```typescript
// Log an action
log(entry: {
  action: string;
  agent: string;
  detail?: unknown;
  timestamp?: string;
}): void

// Query audit log
query(filters?: { action?: string; agent?: string; limit?: number }): AuditEntry[]

// Export to file
exportToJson(filePath?: string): void
```

---

### Sessions

Session persistence and management.

**Import:**
```typescript
import { SessionManager } from './src/sessions.js';
```

**Methods:**

```typescript
// Save a session
saveSession(sessionId: string, data: Record<string, unknown>): void

// Load a session
loadSession(sessionId: string): Record<string, unknown> | null

// List sessions
listSessions(): string[]
```

---

### Monitoring

System monitoring and metrics collection.

**Import:**
```typescript
import { MonitoringCollector } from './src/monitoring.js';
```

**Methods:**

```typescript
// Record a metric
record(metric: string, value: number, tags?: Record<string, string>): void

// Get a snapshot
getSnapshot(): {
  uptime: number;
  metrics: Record<string, unknown>;
  agents: Record<string, unknown>;
}

// Export to JSON
exportToJson(filePath?: string): void
```

---

### i18n

Internationalization support for multi-language agent output.

**Import:**
```typescript
import { I18nManager } from './src/i18n.js';
```

**Methods:**

```typescript
// Set language
setLanguage(lang: 'en' | 'id' | 'zh'): void

// Get translated string
t(key: string, vars?: Record<string, string>): string

// Get current language
getLanguage(): string
```

---

### Learning

Agent learning from past pipeline results.

**Import:**
```typescript
import { LearningEngine } from './src/learning.js';
```

**Methods:**

```typescript
// Record a lesson from a pipeline
recordLesson(pipelineId: string, lesson: string, tags?: string[]): void

// Get lessons for an agent type
getLessons(agentType: string): Lesson[]

// Get recommendations based on context
getRecommendations(context: Record<string, unknown>): string[]
```

---

## V3 APIs

### DAG (Directed Acyclic Graph)

Graph-based workflow execution with dependency resolution and parallel node execution. Inspired by LangGraph.

**Import:**
```typescript
import {
  DAGExecutor,
  type DAGNode,
  type DAGGraph,
  type DAGNodeResult,
  type DAGResult,
  buildSequentialGraph,
  buildParallelGraph,
} from './src/dag.js';
```

**Types:**

```typescript
interface DAGNode {
  id: string;
  agentName: string;
  dependsOn: string[];
  condition?: (context: Record<string, unknown>) => boolean;
}

interface DAGGraph {
  id: string;
  name: string;
  nodes: DAGNode[];
}

interface DAGResult {
  graphId: string;
  status: 'completed' | 'failed' | 'partial';
  nodeResults: Map<string, DAGNodeResult>;
  totalDuration: number;
}

interface DAGNodeResult {
  status: 'completed' | 'failed' | 'skipped';
  duration: number;
  artifacts: unknown[];
}
```

**DAGExecutor Constructor:**
```typescript
new DAGExecutor(
  agents: Map<string, { execute(input: any): Promise<any> }>,
  memory: BowoMemory
)
```

**DAGExecutor Methods:**

```typescript
async execute(graph: DAGGraph, initialContext?: Record<string, unknown>): Promise<DAGResult>
```

**Builder Helpers:**

```typescript
// Build a linear chain: A → B → C
buildSequentialGraph(
  name: string,
  steps: { agentName: string; condition?: (ctx: Record<string, unknown>) => boolean }[]
): DAGGraph

// Build parallel groups: {A, B} → {C, D} → {E}
buildParallelGraph(
  name: string,
  groups: { agentName: string; condition?: (ctx: Record<string, unknown>) => boolean }[][]
): DAGGraph
```

**Events:**
- `node:start` — `{ nodeId, agentName }`
- `node:complete` — `{ nodeId, agentName, duration, status }`
- `node:error` — `{ nodeId, agentName, error }`
- `graph:complete` — `{ graphId, status, totalDuration }`

**Example:**
```typescript
import { DAGExecutor, buildParallelGraph } from './src/dag.js';

// Build a graph: {frontend, backend} → qa → reporter
const graph = buildParallelGraph('full-stack', [
  [{ agentName: 'frontend' }, { agentName: 'backend' }],  // parallel
  [{ agentName: 'qa' }],                                   // depends on both above
  [{ agentName: 'reporter' }],                             // depends on qa
]);

const agentMap = new Map([['frontend', frontendAgent], ['backend', backendAgent], ...]);
const executor = new DAGExecutor(agentMap, memory);

// Listen for events
executor.on('node:complete', (e) => console.log(`${e.nodeId} done in ${e.duration}ms`));

const result = await executor.execute(graph);
console.log(`Status: ${result.status}, Duration: ${result.totalDuration}ms`);
```

---

### Checkpoint

Pipeline checkpointing for resuming workflows after interruption.

**Import:**
```typescript
import { CheckpointManager, type Checkpoint } from './src/checkpoint.js';
```

**Types:**

```typescript
interface Checkpoint {
  id: string;
  pipelineId: string;
  stepIndex: number;
  status: string;
  context: any;
  nodeResults: any;
  timestamp: string;
}
```

**Constructor:**
```typescript
new CheckpointManager(outputDir?: string)  // default: 'output/checkpoints'
```

**Methods:**

```typescript
save(checkpoint: Checkpoint): void
load(checkpointId: string): Checkpoint | null
listByPipeline(pipelineId: string): Checkpoint[]
getLatest(pipelineId: string): Checkpoint | null
delete(checkpointId: string): void

// Auto-generate and save a checkpoint
autoSave(
  pipelineId: string,
  stepIndex: number,
  context: any,
  nodeResults: any
): Checkpoint
```

**Example:**
```typescript
import { CheckpointManager } from './src/checkpoint.js';

const checkpoints = new CheckpointManager('output/checkpoints');

// Auto-save after each step
const cp = checkpoints.autoSave('pipeline-001', 3, context, results);
console.log(`Checkpoint saved: ${cp.id}`);

// Resume from latest checkpoint
const latest = checkpoints.getLatest('pipeline-001');
if (latest) {
  console.log(`Resuming from step ${latest.stepIndex}`);
}
```

---

### Supervisor Agent

Dynamic agent selection based on pipeline state. Inspired by AutoGen.

**Import:**
```typescript
import { SupervisorAgent, type SupervisorDecision, type SupervisorConfig } from './src/supervisor.js';
```

**Types:**

```typescript
interface SupervisorDecision {
  nextAgent: string;
  reason: string;
  context: any;
  done: boolean;
}

interface SupervisorConfig {
  maxRounds?: number;        // default: 20
  allowedAgents?: string[];
}
```

**Constructor:**
```typescript
new SupervisorAgent(config?: SupervisorConfig)
```

**Methods:**

```typescript
// Decide which agent runs next
async decide(
  context: any,
  history: { agent: string; result: any }[]
): Promise<SupervisorDecision>

// Check if pipeline should continue
async shouldContinue(history: { agent: string; result: any }[]): Promise<boolean>

// Get decision history
getHistory(): SupervisorDecision[]
```

**Decision Logic:**
1. No plan → `planner`
2. Plan, no design → `architect`
3. Design, no code → `backend` / `frontend`
4. Code, no tests → `qa`
5. Tests pass → `reporter` (done)

**Example:**
```typescript
import { SupervisorAgent } from './src/supervisor.js';

const supervisor = new SupervisorAgent({ maxRounds: 10 });

const decision = await supervisor.decide(
  { goal: 'Build REST API' },  // context
  []                            // history
);

if (!decision.done) {
  console.log(`Next agent: ${decision.nextAgent}`);
  console.log(`Reason: ${decision.reason}`);
}
```

---

### Context Manager

Shared agent context for pipeline state flow. Inspired by CrewAI shared memory.

**Import:**
```typescript
import { ContextManager, type AgentContext } from './src/context.js';
```

**Types:**

```typescript
interface AgentContext {
  goal: string;
  plan?: any;
  architecture?: any;
  code?: { backend?: any; frontend?: any };
  tests?: any;
  security?: any;
  report?: any;
  artifacts: any[];
  metadata: Record<string, any>;
  agentOutputs: Map<string, any>;
  sharedState: Record<string, any>;
}
```

**Constructor:**
```typescript
new ContextManager(goal: string)
```

**Methods:**

```typescript
getContext(): AgentContext
setAgentOutput(agentName: string, output: any): void
getAgentOutput(agentName: string): any
getAllOutputs(): Record<string, any>
update(key: string, value: any): void
get<T = any>(key: string): T
addArtifact(artifact: any): void
getArtifacts(): any[]
merge(other: Partial<AgentContext>): void
toJSON(): string
static fromJSON(json: string): ContextManager
```

**Example:**
```typescript
import { ContextManager } from './src/context.js';

const ctx = new ContextManager('Build a REST API');

// Store agent outputs
ctx.setAgentOutput('planner', { subtasks: [...] });
ctx.setAgentOutput('architect', { components: [...] });

// Access outputs
const plan = ctx.get('plan');
const archOutput = ctx.getAgentOutput('architect');

// Serialize and restore
const json = ctx.toJSON();
const restored = ContextManager.fromJSON(json);
```

---

### Structured Output

JSON schema validation for agent outputs. Inspired by PydanticAI type safety.

**Import:**
```typescript
import { StructuredOutput, type OutputSchema, type FieldSchema, type ValidationResult, AGENT_SCHEMAS } from './src/structured-output.js';
```

**Types:**

```typescript
interface OutputSchema {
  name: string;
  description: string;
  fields: Record<string, FieldSchema>;
}

interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description?: string;
  default?: any;
  items?: FieldSchema;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  data?: any;
}
```

**Predefined Schemas:** `planner`, `architect`, `backend`, `frontend`, `qa`, `security`, `reporter`

**Constructor:**
```typescript
new StructuredOutput()  // Loads built-in agent schemas
```

**Methods:**

```typescript
register(agentName: string, schema: OutputSchema): void
getSchema(agentName: string): OutputSchema | undefined
validate(agentName: string, output: any): ValidationResult
normalize(agentName: string, output: any): any
listSchemas(): { agent: string; name: string; description: string; fieldCount: number }[]
```

**Example:**
```typescript
import { StructuredOutput } from './src/structured-output.js';

const so = new StructuredOutput();

// Register a custom schema
so.register('custom-agent', {
  name: 'CustomOutput',
  description: 'Custom agent output',
  fields: {
    result: { type: 'string', required: true, description: 'The result' },
    score: { type: 'number', required: false, default: 0 },
  },
});

// Validate
const validation = so.validate('custom-agent', { result: 'done' });
if (!validation.valid) {
  console.error('Errors:', validation.errors);
}

// Normalize (fill defaults)
const normalized = so.normalize('custom-agent', { result: 'done' });
// normalized.score === 0 (filled from default)
```

---

### Agent Composition

Dynamic agent chains and groups with multiple execution strategies.

**Import:**
```typescript
import {
  AgentComposer,
  type AgentChain,
  type AgentGroup,
  type ChainResult,
  type GroupStrategy,
  type ChainStep,
} from './src/agent-composition.js';
```

**Types:**

```typescript
type GroupStrategy = 'sequential' | 'parallel' | 'voting' | 'round-robin';

interface AgentChain {
  id: string;
  name: string;
  steps: ChainStep[];
}

interface AgentGroup {
  id: string;
  name: string;
  agents: string[];
  strategy: GroupStrategy;
}

interface ChainResult {
  chainId: string;
  status: 'completed' | 'failed' | 'partial';
  steps: { agent: string; result: any; duration: number }[];
  finalOutput: any;
  totalDuration: number;
}
```

**Constructor:**
```typescript
new AgentComposer(workflow: Workflow, memory: BowoMemory, comm: Communication)
```

**Methods:**

```typescript
// Chain management
createChain(name: string, steps: { agentName: string; inputMapping?: (ctx: any) => any }[]): AgentChain
getChain(id: string): AgentChain | undefined
listChains(): AgentChain[]

// Group management
createGroup(name: string, agents: string[], strategy: string): AgentGroup
getGroup(id: string): AgentGroup | undefined
listGroups(): AgentGroup[]

// Conditional routing
addConditionalRouting(
  chainId: string,
  fromAgent: string,
  condition: (result: any) => boolean,
  trueAgent: string,
  falseAgent: string
): void

// Execution
async executeChain(chain: AgentChain, initialInput: any): Promise<ChainResult>
async executeGroup(group: AgentGroup, input: any): Promise<any>
```

**Group Strategies:**

| Strategy | Behavior |
|----------|----------|
| `sequential` | Run agents one after another, feeding each output to the next |
| `parallel` | Run all agents concurrently with `Promise.allSettled` |
| `voting` | Run all in parallel, return the majority result |
| `round-robin` | Run sequentially, pick the best result (fastest) |

**Example:**
```typescript
import { AgentComposer } from './src/agent-composition.js';

const composer = new AgentComposer(workflow, memory, comm);

// Create a chain: planner → architect → backend
const chain = composer.createChain('full-dev', [
  { agentName: 'planner' },
  { agentName: 'architect' },
  { agentName: 'backend' },
]);

const result = await composer.executeChain(chain, { goal: 'Build API' });
console.log(`Chain ${result.status} in ${result.totalDuration}ms`);

// Create a voting group
const group = composer.createGroup('code-review', ['backend', 'frontend', 'qa'], 'voting');
const voteResult = await composer.executeGroup(group, { code: '...' });
```

---

### Supervisor Pipeline

High-level orchestrator combining Supervisor, DAG, Checkpointing, and Context.

**Import:**
```typescript
import { SupervisorPipeline, type PipelineOptions, type PipelineResult } from './src/supervisor-pipeline.js';
```

**Types:**

```typescript
interface PipelineOptions {
  maxRounds?: number;
  resumeFrom?: string;  // checkpoint ID
  agents?: string[];
}

interface PipelineResult {
  goal: string;
  status: 'completed' | 'failed' | 'partial';
  rounds: number;
  artifacts: any[];
  duration: number;
  context: any;
  checkpointId?: string;
}
```

**Constructor:**
```typescript
new SupervisorPipeline(workflow: Workflow, memory: BowoMemory, comm: Communication)
```

**Methods:**

```typescript
async run(goal: string, options?: PipelineOptions): Promise<PipelineResult>
```

**Events:**
- `round:complete` — `{ round, agent, result }`

**Example:**
```typescript
import { SupervisorPipeline } from './src/supervisor-pipeline.js';

const pipeline = new SupervisorPipeline(workflow, memory, comm);

// Run with supervisor
const result = await pipeline.run('Build a complete todo app', { maxRounds: 8 });
console.log(`${result.status} in ${result.rounds} rounds`);

// Resume from checkpoint
const resumed = await pipeline.run('Build a todo app', {
  resumeFrom: result.checkpointId,
});
```

---

## V3.1 APIs

### Auth

JWT-based authentication with user management.

**Import:**
```typescript
import { AuthManager, type User, type AuthToken } from './src/auth.js';
```

**Types:**

```typescript
interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: 'admin' | 'user' | 'viewer';
  createdAt: string;
}

interface AuthToken {
  token: string;
  expiresAt: string;
  userId: string;
  role: string;
}
```

**Constructor:**
```typescript
new AuthManager(secret?: string)  // uses BOWO_AUTH_SECRET or generates random
```

**Methods:**

```typescript
hashPassword(password: string): string
verifyPassword(password: string, hash: string): boolean
generateToken(user: User): AuthToken
verifyToken(token: string): { valid: boolean; userId?: string; role?: string; error?: string }
register(username: string, password: string, role?: string): User
login(username: string, password: string): AuthToken | null
getUsers(): User[]
deleteUser(userId: string): boolean
createDefaultAdmin(): User
```

**Example:**
```typescript
import { AuthManager } from './src/auth.js';

const auth = new AuthManager();

// Register a user
const user = auth.register('alice', 'secure123', 'admin');

// Login
const token = auth.login('alice', 'secure123');
if (token) {
  console.log(`Token: ${token.token.slice(0, 20)}...`);
}

// Verify
const verified = auth.verifyToken(token!.token);
console.log(`Valid: ${verified.valid}, Role: ${verified.role}`);
```

---

### Database

JSON-file-backed document database with collection management.

**Import:**
```typescript
import {
  DatabaseManager,
  CollectionHandle,
  type DBRecord,
  type QueryFilter,
} from './src/database.js';
```

**Types:**

```typescript
interface DBRecord {
  id: string;
  [key: string]: any;
}

interface QueryFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';
  value: any;
}
```

**DatabaseManager Constructor:**
```typescript
new DatabaseManager(dbPath?: string)  // default: 'output/database'
```

**DatabaseManager Methods:**

```typescript
collection(name: string): CollectionHandle
getCollections(): string[]
backup(): string   // returns backup directory path
restore(backupPath: string): boolean
getStats(): { collections: number; totalRecords: number; size: string }
```

**CollectionHandle Methods:**

```typescript
insert(record: Omit<DBRecord, 'id'>): DBRecord
insertMany(records: Omit<DBRecord, 'id'>[]): DBRecord[]
findById(id: string): DBRecord | null
find(filters?: QueryFilter[]): DBRecord[]
findOne(filters?: QueryFilter[]): DBRecord | null
update(id: string, updates: Partial<DBRecord>): DBRecord | null
delete(id: string): boolean
count(): number
drop(): void
createIndex(field: string): void
```

**Example:**
```typescript
import { DatabaseManager } from './src/database.js';

const db = new DatabaseManager();

// Insert records
const users = db.collection('users');
const alice = users.insert({ username: 'alice', role: 'admin' });
const bob = users.insert({ username: 'bob', role: 'user' });

// Query
const admins = users.find([{ field: 'role', operator: 'eq', value: 'admin' }]);
const alice2 = users.findOne([{ field: 'username', operator: 'eq', value: 'alice' }]);

// Update
users.update(alice.id, { role: 'superadmin' });

// Stats
const stats = db.getStats();
console.log(`${stats.collections} collections, ${stats.totalRecords} records, ${stats.size}`);
```

---

### Cache

In-memory TTL cache with hit/miss statistics.

**Import:**
```typescript
import { CacheManager, type CacheEntry } from './src/cache.js';
```

**Constructor:**
```typescript
new CacheManager(defaultTTL?: number)  // TTL in seconds, default: 300
```

**Methods:**

```typescript
get(key: string): any | null
set(key: string, value: any, ttl?: number): void
delete(key: string): boolean
has(key: string): boolean
clear(): void
size(): number
keys(): string[]
getOrSet(key: string, factory: () => any, ttl?: number): any
cleanup(): number
getStats(): { totalEntries: number; hitRate: number; totalHits: number; totalMisses: number; memoryEstimate: string }
destroy(): void  // stops cleanup timer
```

**Example:**
```typescript
import { CacheManager } from './src/cache.js';

const cache = new CacheManager(60); // 60 second TTL

// Basic operations
cache.set('user:123', { name: 'Alice' }, 120);
const user = cache.get('user:123');  // { name: 'Alice' }

// Compute-or-cache pattern
const expensive = cache.getOrSet('expensive-query', () => {
  return runExpensiveOperation();
}, 300);

// Stats
const stats = cache.getStats();
console.log(`Hit rate: ${stats.hitRate}%, Entries: ${stats.totalEntries}`);
```

---

### WebSocket

EventEmitter-based WebSocket abstraction for real-time dashboard updates.

**Import:**
```typescript
import { DashboardWebSocket, type WSMessage, type WSClient } from './src/websocket.js';
```

**Constructor:**
```typescript
new DashboardWebSocket(port?: number)  // default: 8080
```

**Methods:**

```typescript
start(): void
stop(): void
subscribe(clientId: string, channel: string): void
unsubscribe(clientId: string, channel: string): void
broadcast(channel: string, message: any): void
sendToClient(clientId: string, message: any): void
getClients(): WSClient[]
getChannels(): string[]
getMessageHistory(channel: string, limit?: number): WSMessage[]
getStats(): { clients: number; channels: number; messagesSent: number; uptime: string }
```

**Default Channels:** `pipeline:progress`, `agent:status`, `system:alerts`, `metrics:update`

**Events:** `client:connect`, `channel:subscribe`, `message:sent`

**Example:**
```typescript
import { DashboardWebSocket } from './src/websocket.js';

const ws = new DashboardWebSocket(8080);
ws.start();

// Subscribe a client
ws.subscribe('client-1', 'pipeline:progress');
ws.subscribe('client-1', 'agent:status');

// Broadcast updates
ws.broadcast('pipeline:progress', { step: 3, total: 5, status: 'running' });

// Check stats
console.log(ws.getStats());
```

---

### Sanitize

Input validation and sanitization utilities.

**Import:**
```typescript
import { InputSanitizer } from './src/sanitize.js';
```

**Methods:**

```typescript
sanitize(input: string): string
sanitizeObject(obj: Record<string, any>): Record<string, any>
validateEmail(email: string): boolean
validateUrl(url: string): boolean
validateJSON(json: string): { valid: boolean; data?: any; error?: string }
preventInjection(input: string): string
limitLength(input: string, max: number): string
stripAnsi(input: string): string
isSafePath(path: string): boolean
```

**Example:**
```typescript
import { InputSanitizer } from './src/sanitize.js';

const sanitizer = new InputSanitizer();

// Sanitize HTML
const clean = sanitizer.sanitize('<script>alert("xss")</script>Hello');
// → 'alert(&quot;xss&quot;)Hello'

// Prevent injection
const safe = sanitizer.preventInjection("'; DROP TABLE users; --");
// → ' DROP TABLE users '

// Validate inputs
sanitizer.validateEmail('alice@example.com');  // true
sanitizer.validateUrl('https://example.com');   // true
sanitizer.isSafePath('/home/user/file.txt');     // true
sanitizer.isSafePath('/etc/passwd');             // false
```

---

## Tool APIs

### FileTools

File I/O operations for agents.

**Import:**
```typescript
import { FileTools, type ToolResult, type FileContent } from './src/tools.js';
```

**Constructor:**
```typescript
new FileTools(workDir?: string)  // default: process.cwd()
```

**Methods:**

```typescript
readFile(filePath: string): ToolResult
writeFile(filePath: string, content: string): ToolResult
listDir(dirPath?: string, pattern?: string): ToolResult
findFiles(pattern: string, dir?: string): ToolResult
grep(pattern: string, dir?: string, filePattern?: string): ToolResult
deleteFile(filePath: string): ToolResult
```

---

### TerminalTools

Shell command execution for agents.

**Import:**
```typescript
import { TerminalTools } from './src/tools.js';
```

**Constructor:**
```typescript
new TerminalTools(workDir?: string, timeout?: number)  // default: 30s
```

**Methods:**

```typescript
exec(command: string, options?: { timeout?: number; cwd?: string }): ToolResult
npm(args: string, cwd?: string): ToolResult
git(args: string, cwd?: string): ToolResult
commandExists(cmd: string): boolean
getSystemInfo(): ToolResult
```

---

### LLMTools

LLM-based reasoning and code generation tools.

**Import:**
```typescript
import { LLMTools } from './src/tools.js';
```

**Constructor:**
```typescript
new LLMTools(llm: LLMClient)
```

**Methods:**

```typescript
async reason(task: string, context?: string): Promise<ToolResult>
async generateCode(task: string, language?: string, context?: string): Promise<ToolResult>
async reviewCode(code: string, criteria?: string): Promise<ToolResult>
async fixBug(error: string, code?: string, context?: string): Promise<ToolResult>
```

**Example:**
```typescript
import { FileTools, TerminalTools } from './src/tools.js';

const files = new FileTools('/path/to/project');
files.writeFile('src/app.ts', 'export const app = {};');
const content = files.readFile('src/app.ts');

const terminal = new TerminalTools('/path/to/project');
terminal.exec('npm install');
terminal.git('status');
```

---

## Integration

### Hermes Integration

Connect BOWO agents to the Hermes Agent ecosystem.

**Import:**
```typescript
import {
  HermesIntegration,
  type HermesConfig,
  type HermesStatus,
  setupHermesIntegration,
} from './src/hermes.js';
```

**Constructor:**
```typescript
new HermesIntegration(config?: Partial<HermesConfig>)
```

**HermesConfig:**
```typescript
interface HermesConfig {
  proxyUrl?: string;       // e.g., http://localhost:3456/v1
  cliPath?: string;        // default: 'hermes'
  workDir?: string;        // default: process.cwd()
  model?: string;
  profile?: string;
  autoDetect: boolean;     // default: true
}
```

**Methods:**

```typescript
async detect(): Promise<HermesStatus>
getProxyUrl(): string | null
getLLMConfig(): { provider: string; baseUrl: string; model: string; apiKey: string }

// Execute tasks via Hermes CLI
async executeWithHermes(task: string, options?: {
  timeout?: number;
  skills?: string[];
  model?: string;
  workDir?: string;
}): Promise<{ output: string; exitCode: number; duration: number }>

// Background execution
executeWithHermesBackground(task: string, options?: {
  skills?: string[];
  model?: string;
  workDir?: string;
}): { pid: number | null; kill: () => void }

// Session management
searchSessions(query: string, limit?: number): string
async resumeSession(sessionId: string): Promise<{ output: string; exitCode: number }>

// Skills sharing
exportAsSkill(agentName: string, skillDir: string): void

// Status
async getStatus(): Promise<{
  hermes: HermesStatus;
  proxy: string | null;
  config: HermesConfig;
  recommendations: string[];
}>
```

**Quick Setup:**
```typescript
import { setupHermesIntegration } from './src/hermes.js';
await setupHermesIntegration();
```

**Example:**
```typescript
import { HermesIntegration } from './src/hermes.js';

const hermes = new HermesIntegration({ model: 'hermes-auto' });
const status = await hermes.detect();
console.log(`Hermes installed: ${status.installed}`);
console.log(`Proxy running: ${status.proxyRunning}`);

if (status.installed && status.proxyRunning) {
  const config = hermes.getLLMConfig();
  console.log(`Using: ${config.model} via ${config.baseUrl}`);
}
```

---

### LLM Providers

Multi-provider LLM integration layer.

**Import:**
```typescript
import {
  LLMClient,
  type LLMConfig,
  type LLMResponse,
  type ProviderDefinition,
  registerProvider,
  getProviders,
  getProviderNames,
  detectProvider,
  getLLM,
  resetLLM,
} from './src/llm.js';
```

**Types:**

```typescript
interface LLMConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

interface LLMResponse {
  content: string;
  model: string;
  tokens: { prompt: number; completion: number; total: number };
  finishReason: string;
}

interface ProviderDefinition {
  name: string;
  displayName: string;
  baseUrl: string;
  apiKeyEnv: string;
  defaultModel: string;
  models: string[];
}
```

**Built-in Providers:**
- `openai` — OpenAI (gpt-4o, gpt-4o-mini, o1, o3-mini)
- `openrouter` — OpenRouter (Claude, GPT-4o, Gemini, etc.)
- `anthropic` — Anthropic (Claude 3/3.5)
- `deepseek` — DeepSeek (deepseek-chat, deepseek-coder)
- `groq` — Groq (Llama 3.1, Mixtral)
- `ollama` — Ollama Local (llama3.1, codellama, mistral)
- `lmstudio` — LM Studio Local
- `together` — Together AI
- `fireworks` — Fireworks AI
- `xai` — xAI Grok
- `google` — Google Gemini

**LLMClient Methods:**

```typescript
constructor(config?: Partial<LLMConfig>)

async chat(
  messages: ChatCompletionMessageParam[],
  options?: { temperature?: number; maxTokens?: number; system?: string }
): Promise<LLMResponse>

async prompt(
  systemPrompt: string,
  userMessage: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<LLMResponse>

async json<T = unknown>(
  systemPrompt: string,
  userMessage: string,
  options?: { temperature?: number }
): Promise<T>

isAvailable(): boolean
getConfig(): Omit<LLMConfig, 'apiKey'> & { apiKey: string }
getProvider(): ProviderDefinition
```

**Utility Functions:**

```typescript
registerProvider(def: ProviderDefinition): void
getProviders(): ProviderDefinition[]
getProviderNames(): string[]
detectProvider(): string
getLLM(config?: Partial<LLMConfig>): LLMClient  // singleton
resetLLM(): void
```

**Environment Variables:**

| Variable | Description |
|----------|-------------|
| `BOWO_LLM_PROVIDER` | LLM provider name |
| `BOWO_LLM_MODEL` | Model name |
| `BOWO_LLM_API_KEY` | API key |
| `BOWO_LLM_BASE_URL` | Custom endpoint URL |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GROQ_API_KEY` | Groq API key |
| `DEEPSEEK_API_KEY` | DeepSeek API key |

**Example:**
```typescript
import { LLMClient, registerProvider, detectProvider } from './src/llm.js';

// Auto-detect from environment
const provider = detectProvider();
console.log(`Detected: ${provider}`);

// Create client
const llm = new LLMClient({ provider: 'openai', model: 'gpt-4o-mini' });

// Simple prompt
const response = await llm.prompt(
  'You are a helpful assistant',
  'Explain what a DAG is'
);

// Structured JSON output
const plan = await llm.json<{ steps: string[] }>(
  'You are a project planner',
  'Plan building a REST API'
);

// Register a custom provider
registerProvider({
  name: 'my-llm',
  displayName: 'My Custom LLM',
  baseUrl: 'https://my-llm.example.com/v1',
  apiKeyEnv: 'MY_LLM_API_KEY',
  defaultModel: 'my-model-v1',
  models: ['my-model-v1', 'my-model-v2'],
});
```

---

## CLI Reference

### Interactive REPL

```bash
npx tsx src/cli.ts
```

**Commands:**

| Command | Description |
|---------|-------------|
| `/status` | Show system status (agents, LLM, memory) |
| `/agents` | List all registered agents |
| `/providers` | List LLM providers and which is active |
| `/hermes` | Show Hermes integration status |
| `/history` | Show recent pipeline executions |
| `/help` | Show help banner |
| `/quit` | Exit the REPL |

Any other input is treated as a task and executed through the pipeline.

### Entry Point

```bash
npx tsx src/index.ts --task "Build a REST API" [--agents planner,backend,qa] [--model gpt-4o] [--provider openai]
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--task <text>` | The task to execute (required) |
| `--agents <list>` | Comma-separated agent names to use |
| `--model <name>` | LLM model override |
| `--provider <name>` | LLM provider override |

---

## Configuration

The default configuration lives at `config/default.json`:

```json
{
  "name": "BOWO",
  "version": "1.0.0",
  "description": "Backend Orchestrator for Workflow Optimization",

  "llm": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "api_key_env": "OPENAI_API_KEY",
    "temperature": 0.7,
    "max_tokens": 4096
  },

  "orchestrator": {
    "max_retries": 3,
    "timeout_seconds": 300,
    "parallel_agents": true,
    "log_level": "INFO"
  },

  "agents": {
    "planner":    { "enabled": true, "max_subtasks": 10, "priority": 1 },
    "architect":  { "enabled": true, "generate_diagrams": true, "priority": 2 },
    "backend":    { "enabled": true, "languages": ["python", "nodejs", "go"], "priority": 3 },
    "frontend":   { "enabled": true, "frameworks": ["react", "vue", "svelte"], "priority": 3 },
    "qa":         { "enabled": true, "auto_test": true, "coverage_threshold": 80, "priority": 4 },
    "debug":      { "enabled": true, "auto_fix": false, "priority": 5 },
    "security":   { "enabled": true, "scan_dependencies": true, "priority": 6 },
    "devops":     { "enabled": true, "targets": ["docker", "k8s", "cloud"], "priority": 7 },
    "reporter":   { "enabled": true, "output_format": "markdown", "priority": 8 }
  },

  "workflow": {
    "default_pipeline": ["planner", "architect", "backend", "frontend", "qa", "reporter"],
    "enable_debug_loop": true,
    "enable_security_scan": true
  },

  "memory": {
    "backend": "file",
    "directory": "output/memory",
    "max_entries": 1000
  },

  "output": {
    "directory": "output",
    "save_logs": true,
    "save_artifacts": true
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BOWO_LLM_PROVIDER` | LLM provider | `openai` |
| `BOWO_LLM_MODEL` | Model name | `gpt-4o-mini` |
| `BOWO_LLM_API_KEY` | API key | — |
| `BOWO_LLM_BASE_URL` | Custom endpoint URL | Provider default |
| `BOWO_AUTH_SECRET` | JWT secret key | Random generated |

---

## License

MIT © BOWO

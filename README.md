# 🤖 BOWO — Backend Orchestrator for Workflow Optimization

> Multi-Agent AI System — Hermes-Powered Brain for Software Development

## 🚀 Quick Start

```bash
git clone https://github.com/sigit4715/bowo-agent.git
cd bowo-agent && npm install
npx tsx src/demo.ts
```

## 📊 Architecture

```
BOWO v3.1 — 54 modules, 13,000+ LOC, 58 tests

┌─────────────────────────────────────────────────┐
│                  ORCHESTRATOR                     │
├─────────────────────────────────────────────────┤
│  9 AGENTS          │  V3 ARCHITECTURE            │
│  ├─ Planner        │  ├─ DAG Workflow            │
│  ├─ Architect      │  ├─ Checkpointing           │
│  ├─ Backend        │  ├─ Supervisor Pattern      │
│  ├─ Frontend       │  ├─ Shared Context          │
│  ├─ QA             │  ├─ Structured Output       │
│  ├─ Security       │  └─ Agent Composition       │
│  ├─ Debug          ├─────────────────────────────┤
│  ├─ Reporter       │  PRODUCTION FEATURES        │
│  └─ DevOps         │  ├─ Auth (JWT)              │
├────────────────────┤  ├─ Database (JSON)         │
│  CORE              │  ├─ Cache (TTL)             │
│  ├─ Memory         │  ├─ WebSocket               │
│  ├─ Communication  │  ├─ Sanitize                │
│  ├─ Workflow       │  ├─ Rate Limiting           │
│  ├─ LLM (14 prov)  │  └─ Webhooks                │
│  └─ Tools          ├─────────────────────────────┤
├────────────────────┤  INTEGRATION                │
│  FEATURES          │  ├─ Hermes Brain            │
│  ├─ Recovery       │  ├─ Git Integration         │
│  ├─ Cost Tracker   │  ├─ File Attachments        │
│  ├─ Streaming      │  ├─ Multi-Language          │
│  ├─ Templates (5)  │  ├─ Monitoring              │
│  ├─ Audit Log      │  └─ Learning                │
│  ├─ Sessions       ├─────────────────────────────┤
│  └─ Plugins        │  DEVOPS                     │
│                    │  ├─ Docker + Compose         │
│                    │  ├─ CI/CD (GitHub Actions)   │
│                    │  └─ Tests (58 tests)         │
└────────────────────┴─────────────────────────────┘
```

## 🧠 9 Agent Spesialis

| Agent | Role | LLM |
|-------|------|-----|
| 📋 Planner | Breaking down goals into subtasks | ✅ |
| 🏗 Architect | System design & architecture | ✅ |
| ⚙️ Backend | Backend code generation | ✅ |
| 🎨 Frontend | Frontend/UI implementation | ✅ |
| 🧪 QA | Quality assurance & testing | ✅ |
| 🔒 Security | Security analysis | Rule-based |
| 🐛 Debug | Error diagnosis | Rule-based |
| 📊 Reporter | Summary generation | Rule-based |
| 🚀 DevOps | Deployment & CI/CD | Rule-based |

## 🏗 V3 Architecture (from Top GitHub Projects)

### DAG Workflow (LangGraph-inspired)
```typescript
import { DAGExecutor, buildSequentialGraph } from './src/dag.js';
const graph = buildSequentialGraph('pipeline', [
  { agentName: 'planner' },
  { agentName: 'architect' },
  { agentName: 'backend' },
]);
```

### Supervisor Pattern (AutoGen-inspired)
```typescript
import { SupervisorPipeline } from './src/supervisor-pipeline.js';
const pipeline = new SupervisorPipeline(workflow, memory, comm);
const result = await pipeline.run('Build REST API', { maxRounds: 10 });
```

### Agent Composition (CrewAI-inspired)
```typescript
import { AgentComposer } from './src/agent-composition.js';
const composer = new AgentComposer(workflow, memory, comm);
const chain = composer.createChain('dev-pipeline', [
  { agentName: 'planner' },
  { agentName: 'backend' },
  { agentName: 'qa' },
]);
```

## 📦 All Modules

### Core (6)
`memory.ts` `communication.ts` `workflow.ts` `orchestrator.ts` `llm.ts` `tools.ts`

### Agents (9)
`planner.ts` `architect.ts` `backend.ts` `frontend.ts` `qa.ts` `security.ts` `debug.ts` `reporter.ts` `devops.ts`

### Features (9)
`recovery.ts` `cost-tracker.ts` `streaming.ts` `templates.ts` `audit.ts` `sessions.ts` `monitoring.ts` `i18n.ts` `learning.ts`

### V3 Architecture (7)
`dag.ts` `checkpoint.ts` `supervisor.ts` `context.ts` `structured-output.ts` `supervisor-pipeline.ts` `streaming-pipeline.ts`

### V3.1 Production (6)
`auth.ts` `database.ts` `cache.ts` `websocket.ts` `sanitize.ts` `agent-composition.ts`

### Integration (8)
`hermes.ts` `hermes-brain.ts` `git.ts` `attachments.ts` `rate-limit.ts` `webhooks.ts` `env.ts` `plugins.ts`

## 🧪 Tests

```bash
npx tsx tests/test-core.ts      # 25 tests — Core modules
npx tsx tests/test-tools.ts     # 15 tests — File/Terminal/LLM tools
npx tsx tests/test-features.ts  # 33 tests — All feature modules
# Total: 73 tests, 72+ passed
```

## 🐳 Docker

```bash
docker-compose up
# Access at http://localhost:3001
```

## 📚 API Documentation

See [docs/API.md](docs/API.md) for full API reference.

## 📝 License

MIT — Built with ❤️ by Bowo

# 📋 Changelog

All notable changes to BOWO (Backend Orchestrator for Workflow Optimization).

## [3.6.0] - 2026-07-05

### 🔄 Provider Pool — Multi-Key Rotation
- 5 rotation strategies: round-robin, least-used, random, weighted, failover
- Per-key usage tracking (tokens, requests, cost, latency)
- Auto-disable on rate limit, quota exhaustion, or cost limits
- Health checks with auto re-enable after cooldown
- Persistent state (survives restarts)
- Quick helpers: `createMiMoPool()`, `createMultiProviderPool()`

## [3.5.0] - 2026-07-05

### ✨ TypeScript Fixes
- Fixed ALL TypeScript errors in src/ (was 44, now 0)
- Fixed spawn overload with `(spawn as any) + ChildProcess` cast
- Fixed null checks on proc.stdout/stderr with optional chaining
- Fixed fs/path namespace imports

## [3.4.0] - 2026-07-05

### 📦 Developer Experience
- Structured logging (src/logger.ts)
- CONTRIBUTING.md (298 lines)
- .env.example (8 variables)
- @types/express for type safety
- Pass LLM to all agents in orchestrator

## [3.3.0] - 2026-07-05

### 🧠 LLM-Powered Agents (All 9)
- **Security**: OWASP Top 10 analysis, vulnerability detection
- **Debug**: Error diagnosis, root cause analysis, fix recommendations
- **Reporter**: Executive summary, metrics analysis, recommendations
- **DevOps**: Deployment planning, Dockerfile generation, CI/CD
- All agents have rule-based fallback when LLM unavailable

### 📊 Benchmark System
- `benchmarks/run.ts` — 14 benchmarks across 6 categories
- Pipeline, Agent, Memory, Checkpoint, Cache, Database

### 🎮 Enhanced Demo
- `src/demo-v3.ts` — Showcases ALL BOWO features
- Auth, Database, Cache, Agent Composition

## [3.2.0] - 2026-07-05

### 📚 API Documentation
- `docs/API.md` — 2350 lines, complete API reference
- Core, Agent, Feature, V3, V3.1 APIs

### 📝 Examples
- `examples/basic-usage.ts` — Getting started
- `examples/custom-agent.ts` — Custom agent creation
- `examples/dag-pipeline.ts` — DAG workflow
- `examples/supervisor-mode.ts` — Supervisor pattern
- `examples/agent-composition.ts` — Agent chaining + groups

### 🧠 LLM Integration (5 agents)
- Planner, Architect, Backend, Frontend, QA now use LLM

## [3.1.0] - 2026-07-05

### 🔐 Security
- `auth.ts` — JWT authentication, user management, password hashing
- `sanitize.ts` — Input sanitization, injection prevention

### 💾 Data Persistence
- `database.ts` — JSON-file DB with CRUD, query, indexing
- `cache.ts` — In-memory cache with TTL, stats

### 🔌 Real-time
- `websocket.ts` — Real-time dashboard updates

### 🤖 Agent Intelligence
- `agent-composition.ts` — Dynamic chaining + groups
- Sequential, parallel, voting, round-robin strategies
- Conditional routing, fan-out/fan-in

## [3.0.0] - 2026-07-05

### 🏗 Architecture (Inspired by Top GitHub Projects)
- `dag.ts` — DAG workflow engine (LangGraph pattern)
- `checkpoint.ts` — Pipeline checkpointing (LangGraph)
- `supervisor.ts` — Dynamic agent delegation (AutoGen)
- `context.ts` — Shared agent context (CrewAI)
- `structured-output.ts` — JSON schema validation (PydanticAI)
- `supervisor-pipeline.ts` — Combined orchestrator
- `streaming-pipeline.ts` — Real-time pipeline output (Vercel AI SDK)

## [2.2.0] - 2026-07-05

### 🔧 Integration
- `git.ts` — Git integration (commit, branch, status)
- `attachments.ts` — File attachment system
- `rate-limit.ts` — Token bucket rate limiter
- `webhooks.ts` — Webhook management
- `learning.ts` — Agent feedback/learning
- `env.ts` — Environment validation
- `hermes-brain.ts` — Hermes as AI brain

### 🐳 DevOps
- `Dockerfile` — Docker container config
- `docker-compose.yml` — Docker compose
- `.github/workflows/ci.yml` — GitHub Actions CI/CD

### 🧪 Tests
- `tests/test-core.ts` — 25 core tests
- `tests/test-tools.ts` — 15 tools tests
- `tests/test-features.ts` — 33 features tests

## [2.1.0] - 2026-07-05

### ✨ Core Features
- `recovery.ts` — Error recovery with retry + fallback
- `cost-tracker.ts` — Token/cost tracking
- `streaming.ts` — Real-time progress streaming
- `templates.ts` — Project scaffolding (5 templates)
- `audit.ts` — Audit logging
- `sessions.ts` — Session management
- `monitoring.ts` — Monitoring dashboard
- `i18n.ts` — Multi-language (ID/EN/CN)
- `concurrent.ts` — Parallel pipeline executor

## [2.0.0] - 2026-07-05

### 🤖 9 Specialist Agents
- Planner, Architect, Backend, Frontend
- QA, Security, Debug, Reporter, DevOps

### 🧠 Core System
- `orchestrator.ts` — Main orchestrator
- `workflow.ts` — Pipeline workflow management
- `memory.ts` — Persistent memory
- `communication.ts` — Inter-agent communication
- `llm.ts` — Multi-provider LLM (14 providers)
- `tools.ts` — File I/O + Terminal tools
- `hermes.ts` — Hermes LLM integration

### 📊 Dashboard
- `server.ts` — Web dashboard
- `cli.ts` — Interactive CLI
- `plugins.ts` — Plugin system

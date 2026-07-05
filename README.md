# 🤖 BOWO — Backend Orchestrator for Workflow Optimization

> Multi-Agent AI System untuk Software Development

BOWO adalah sistem multi-agent AI di mana **9 agent spesialis** bekerja sama dalam pipeline otomatis untuk build software dari requirements sampai deployment.

## 🚀 Quick Start

```bash
git clone https://github.com/sigit4715/bowo-agent.git
cd bowo-agent
npm install

# Run demo
npx tsx src/demo.ts

# Run a task
npx tsx src/index.ts --task "Build REST API for todo app"

# Interactive CLI
npx tsx src/cli.ts

# Web dashboard
npx tsx src/server.ts
```

## 🤖 9 Agent Spesialis

| Agent | Tugas | Tools |
|-------|-------|-------|
| 📋 **Planner** | Analisis & breakdown task | LLM + File I/O |
| 🏗️ **Architect** | System design & arsitektur | LLM + File I/O |
| ⚙️ **Backend** | Generate backend code | LLM + File I/O + Terminal |
| 🎨 **Frontend** | Generate frontend code | LLM + File I/O |
| 🛡️ **Security** | Security audit & hardening | LLM + File I/O |
| 🧪 **QA** | Testing & quality assurance | LLM + File I/O + Terminal |
| 🐛 **Debug** | Bug detection & fixing | LLM + File I/O |
| 🚀 **DevOps** | Deployment & infra | LLM + File I/O + Terminal |
| 📝 **Reporter** | Report & documentation | LLM + File I/O |

## 🧰 9 Fitur Inti

### 1. Real LLM Execution
Agent beneran mikir pakai AI — bukan cuma rule-based.
```bash
export DEEPSEEK_API_KEY=***
npx tsx src/index.ts --task "Build REST API"
```

### 2. File I/O
Agent bisa baca, tulis, search, dan grep files.
```typescript
await this.tools.file.read("src/index.ts");
await this.tools.file.write("output.txt", "Hello");
await this.tools.file.search("src", "*.ts");
await this.tools.file.grep("src", "TODO");
```

### 3. Terminal Execution
Agent bisa jalankan command bash (npm, git, docker, dll).
```typescript
await this.tools.terminal.exec("npm install express");
await this.tools.terminal.exec("git init && git add .");
```

### 4. Error Recovery
Automatic retry dengan exponential backoff + fallback agents.
```typescript
const recovery = new RecoveryExecutor();
recovery.registerAgent(planner);
const result = await recovery.execute("planner", input, {
  retry: { maxRetries: 3, baseDelayMs: 1000 },
  fallbackAgentNames: ["architect"],
});
```

### 5. Cost Tracking
Monitor token usage dan cost per agent/pipeline.
```typescript
const tracker = new CostTracker({ budgetLimit: 5.0 });
tracker.track("planner", 150, 50, 0.001);
tracker.getReport(); // { totalTokens, totalCost, byAgent }
```

### 6. Streaming Output
Real-time progress events untuk dashboard/Telegram.
```typescript
const stream = new PipelineStream();
stream.on("step:start", (e) => console.log(`▶ ${e.agentName}`));
stream.on("step:complete", (e) => console.log(`✅ ${e.agentName}`));
```

### 7. Project Templates
Scaffolding untuk common project types.
```typescript
const templates = new TemplateEngine();
templates.listTemplates(); // ["express-api", "react-web", "cli-tool", "fullstack", "microservice"]
await templates.generate("express-api", "./my-api");
```

### 8. Audit Log
Trace semua aktivitas agent ke file JSON.
```typescript
const audit = new AuditLog();
audit.log({ action: "file.write", agent: "backend", detail: { path: "src/index.ts" } });
audit.getStats(); // { byAction, byAgent }
```

### 9. Session Management
Save, resume, dan browse pipeline sessions.
```typescript
const sessions = new SessionManager();
sessions.saveSession("sess-123", { goal, status, duration });
sessions.loadSession("sess-123");
sessions.listSessions();
```

## 📊 Web Dashboard

```bash
npx tsx src/server.ts
# Buka http://localhost:3001
```

Dashboard menampilkan:
- 🤖 Agent status (9 agents)
- 📊 Pipeline history
- 🧠 Memory entries
- 📁 Templates
- 📈 Monitoring metrics

## 🔌 LLM Providers (14 Built-in)

| Provider | Env Variable | Default Model |
|----------|-------------|---------------|
| DeepSeek | `DEEPSEEK_API_KEY` | deepseek-chat |
| OpenAI | `OPENAI_API_KEY` | gpt-4o-mini |
| Anthropic | `ANTHROPIC_API_KEY` | claude-3-haiku |
| Groq | `GROQ_API_KEY` | llama-3-3-70b-versatile |
| xAI | `XAI_API_KEY` | grok-3 |
| Google | `GOOGLE_API_KEY` | gemini-2.0-flash |
| OpenRouter | `OPENROUTER_API_KEY` | auto |
| Together | `TOGETHER_API_KEY` | meta-llama/Llama-3-3-70B |
| Fireworks | `FIREWORKS_API_KEY` | accounts/fireworks/models/llama-v3p3-70b |
| Ollama | (auto-detect) | llama3.2 |
| LM Studio | (auto-detect) | local-model |
| Cerebras | `CEREBRAS_API_KEY` | llama-3.3-70b |
| Mistral | `MISTRAL_API_KEY` | mistral-small-latest |
| Perplexity | `PERPLEXITY_API_KEY` | sonar |

### Custom Provider
```typescript
import { registerProvider } from "./src/llm.js";
registerProvider("my-provider", {
  baseUrl: "https://api.my-provider.com/v1",
  models: ["my-model-1", "my-model-2"],
  headers: { "X-API-Key": "my-key" },
});
```

## 🏗️ Architecture

```
src/
├── orchestrator.ts     # Main brain — coordinates everything
├── workflow.ts         # Pipeline engine — sequential execution
├── llm.ts              # Multi-provider LLM client (14 providers)
├── memory.ts           # Persistent memory (JSON file)
├── communication.ts    # Inter-agent messaging
├── tools.ts            # File I/O + Terminal + LLM tools
├── cli.ts              # Interactive REPL
├── server.ts           # Express web server
├── plugins.ts          # Dynamic plugin loader
├── index.ts            # CLI entry point
├── demo.ts             # Demo scenarios
├── agents/
│   ├── base.ts         # BaseAgent class with tools integration
│   ├── planner.ts      # LLM-powered planning
│   ├── architect.ts    # System design
│   ├── backend.ts      # Code generation
│   ├── frontend.ts     # UI generation
│   ├── security.ts     # Security audit
│   ├── qa.ts           # Testing
│   ├── debug.ts        # Bug detection
│   ├── devops.ts       # Deployment
│   └── reporter.ts     # Report generation
├── recovery.ts         # Error recovery + retry + fallback
├── cost-tracker.ts     # Token/cost monitoring
├── streaming.ts        # Real-time progress events
├── templates.ts        # Project scaffolding
├── audit.ts            # Activity audit log
├── sessions.ts         # Session management
├── monitoring.ts       # Metrics collector
├── i18n.ts             # Multi-language support (ID/EN/CN)
└── hermes.ts           # Hermes Agent integration
```

## 🔌 Hermes Integration

BOWO bisa dikontrol dari Hermes Agent via skill:

```
/bowo Build REST API for todo app
/bowo --cli  (interactive mode)
/bowo --web  (start dashboard)
```

## 🧪 Testing

```bash
# Demo
npx tsx src/demo.ts

# Full pipeline
npx tsx src/index.ts --task "Build Express REST API for todo app"

# Check status
npx tsx src/index.ts --status
```

## 📝 License

MIT License — see [LICENSE](LICENSE)

---

**Built with ❤️ by [Bowo](https://github.com/sigit4715)**

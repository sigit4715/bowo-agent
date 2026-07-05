# 🤖 BOWO — Backend Orchestrator for Workflow Optimization

> Multi-Agent AI Framework by Bowo

Sistem multi-agent AI di mana beberapa agent spesialis bekerja sama dalam pipeline pengembangan software. Orchestrator mengkoordinasi, planner memecah tangan, specialist agents mengerjakan, QA memverifikasi.

## 🏗 Arsitektur

```
                    ┌─────────────┐
                    │  🧠 BOWO    │
                    │ Orchestrator│
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
     ┌──────▼──────┐ ┌────▼────┐ ┌──────▼──────┐
     │   Planner   │ │Architect│ │  Reporter   │
     │  (Planning) │ │ (Design)│ │  (Reports)  │
     └──────┬──────┘ └────┬────┘ └──────▲──────┘
            │              │              │
     ┌──────▼──────────────▼──────────────┤
     │         Specialist Agents          │
     │  Backend │ Frontend │ QA │ Debug   │
     │  Security│ DevOps   │    │         │
     └────────────────────────────────────┘
```

## 🤖 Agent Roster

| # | Agent | Role | Deskripsi |
|---|-------|------|-----------|
| 0 | Orchestrator | Koordinator | Mengatur flow & routing tugas |
| 1 | Planner | Perencana | Break down task jadi subtask |
| 2 | Architect | Arsitek | Desain sistem & struktur |
| 3 | Backend | Backend Dev | API, database, logic |
| 4 | Frontend | Frontend Dev | UI, component, styling |
| 5 | QA | Quality Assurance | Testing & validasi |
| 6 | Debug | Debugger | Cari & fix bugs |
| 7 | Security | Security Audit | Audit keamanan |
| 8 | DevOps | Deployment | CI/CD, infra, deploy |
| 9 | Reporter | Pelaporan | Laporan hasil kerja |

## 🚀 Quick Start

```bash
cd bowo-agent
pip install -r requirements.txt

# Run demo
python -m src.main --task "Build a REST API for todo app"

# Run with specific agents
python -m src.main --task "Fix login bug" --agents debug,qa
```

## ⚙ Konfigurasi

Lihat `config/default.json` untuk konfigurasi lengkap. Bisa set:
- LLM provider (OpenAI, Anthropic, local)
- Agent behavior
- Workflow pipeline
- Output format

## 📁 Struktur

```
bowo-agent/
├── src/
│   ├── __init__.py
│   ├── main.py              # Entry point
│   ├── orchestrator.py      # 🧠 Core orchestrator
│   ├── memory.py            # 💾 Shared project memory
│   ├── communication.py     # 📡 Inter-agent messaging
│   ├── workflow.py          # ⚡ Workflow engine
│   └── agents/
│       ├── base.py          # Base agent class
│       ├── planner.py       # 📋 Planner agent
│       ├── architect.py     # 🏗 Architect agent
│       ├── backend.py       # ⚙ Backend agent
│       ├── frontend.py      # 🎨 Frontend agent
│       ├── qa.py            # ✅ QA agent
│       ├── debug.py         # 🔍 Debug agent
│       ├── security.py      # 🔒 Security agent
│       ├── devops.py        # 🚀 DevOps agent
│       └── reporter.py      # 📊 Reporter agent
├── config/
│   └── default.json
├── docs/                     # 21 documentation files
├── examples/
│   └── demo.py
└── output/
```

## 📜 License

MIT — Built with ❤️ by Bowo

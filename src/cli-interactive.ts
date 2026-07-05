/**
 * 🤖 BOWO Interactive CLI — Rich REPL
 *
 * A feature-rich interactive CLI for chatting with BOWO agents,
 * managing pools, combos, and monitoring the system.
 *
 * Zero external deps — uses only node:readline, node:fs, node:path.
 *
 * Usage:
 *   npx tsx src/cli-interactive.ts
 *   npx tsx src/cli-interactive.ts --theme fancy
 *   npx tsx src/cli-interactive.ts --prompt "🤖 > "
 */

import "dotenv/config";
import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CLIConfig {
  prompt: string;
  historySize: number;
  theme: "default" | "minimal" | "fancy";
}

export interface CommandResult {
  output: string;
  success: boolean;
  metadata?: Record<string, unknown>;
}

export interface HistoryEntry {
  input: string;
  output: string;
  timestamp: string;
  duration: number;
}

// ─── ANSI Colors ────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",

  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",

  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
} as const;

// ─── Theme Presets ──────────────────────────────────────────────────────────

interface ThemeColors {
  accent: string;
  prompt: string;
  success: string;
  error: string;
  warning: string;
  info: string;
  dim: string;
  header: string;
}

const THEMES: Record<CLIConfig["theme"], ThemeColors> = {
  default: {
    accent: C.cyan,
    prompt: `${C.cyan}${C.bold}🤖 bowo${C.reset}${C.gray}>${C.reset} `,
    success: C.green,
    error: C.red,
    warning: C.yellow,
    info: C.blue,
    dim: C.gray,
    header: C.cyan,
  },
  minimal: {
    accent: C.white,
    prompt: `${C.white}${C.bold}$${C.reset} `,
    success: C.green,
    error: C.red,
    warning: C.yellow,
    info: C.white,
    dim: C.gray,
    header: C.white,
  },
  fancy: {
    accent: C.magenta,
    prompt: `${C.magenta}${C.bold}✦ bowo${C.reset}${C.gray}›${C.reset} `,
    success: C.green,
    error: C.red,
    warning: C.yellow,
    info: C.cyan,
    dim: C.gray,
    header: C.magenta,
  },
};

// ─── Version ────────────────────────────────────────────────────────────────

function getVersion(): string {
  try {
    const pkgPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.version ?? "3.3.0";
  } catch {
    return "3.3.0";
  }
}

// ─── Box Drawing Helpers ────────────────────────────────────────────────────

const BOX = {
  tl: "╔", tr: "╗", bl: "╚", br: "╝",
  h: "═", v: "║", lt: "╠", rt: "╣", tt: "╦", bt: "╩", cr: "╬",
} as const;

function boxLine(text: string, width: number): string {
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, "");
  const pad = Math.max(0, width - stripped.length - 2);
  return `${BOX.v} ${text}${" ".repeat(pad)} ${BOX.v}`;
}

function boxTop(width: number): string {
  return `${BOX.tl}${BOX.h.repeat(width - 2)}${BOX.tr}`;
}

function boxBottom(width: number): string {
  return `${BOX.bl}${BOX.h.repeat(width - 2)}${BOX.br}`;
}

function boxSep(width: number): string {
  return `${BOX.lt}${BOX.h.repeat(width - 2)}${BOX.rt}`;
}

function makeTable(headers: string[], rows: string[][], colWidths?: number[]): string {
  if (headers.length === 0) return "";
  const widths = colWidths ?? headers.map((h, i) => {
    const maxContent = Math.max(h.length, ...rows.map(r => (r[i] ?? "").replace(/\x1b\[[0-9;]*m/g, "").length));
    return maxContent + 2;
  });
  const totalWidth = widths.reduce((a, b) => a + b, 0) + 1;

  const lines: string[] = [];
  lines.push(boxTop(totalWidth));
  lines.push(boxLine(
    headers.map((h, i) => h.padEnd(widths[i])).join(""),
    totalWidth,
  ));
  lines.push(boxSep(totalWidth));
  for (const row of rows) {
    lines.push(boxLine(
      row.map((c, i) => c.padEnd(widths[i] + (c.replace(/\x1b\[[0-9;]*m/g, "").length - c.length))).join(""),
      totalWidth,
    ));
  }
  lines.push(boxBottom(totalWidth));
  return lines.join("\n");
}

// ─── Progress Indicator ─────────────────────────────────────────────────────

function showProgress(message: string): () => string {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${C.cyan}${frames[i % frames.length]}${C.reset} ${message}   `);
    i++;
  }, 100);
  return () => {
    clearInterval(interval);
    process.stdout.write("\r" + " ".repeat(message.length + 10) + "\r");
    return message;
  };
}

// ─── Syntax Highlighting (minimal) ──────────────────────────────────────────

function highlightCode(code: string): string {
  return code
    // strings
    .replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, `${C.green}$&${C.reset}`)
    // keywords
    .replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|try|catch|throw|type|interface)\b/g, `${C.magenta}$1${C.reset}`)
    // numbers
    .replace(/\b(\d+\.?\d*)\b/g, `${C.yellow}$1${C.reset}`)
    // comments
    .replace(/(\/\/.*$)/gm, `${C.gray}$1${C.reset}`)
    .replace(/(\/\*[\s\S]*?\*\/)/g, `${C.gray}$1${C.reset}`)
    // booleans/null
    .replace(/\b(true|false|null|undefined)\b/g, `${C.cyan}$1${C.reset}`);
}

function wrapCodeBlock(code: string): string {
  const lines = code.split("\n");
  const highlighted = lines.map(l => `  ${C.gray}${l}${C.reset}`);
  return [
    `\n${C.gray}┌─ code ─${"─".repeat(40)}┐${C.reset}`,
    ...highlighted,
    `${C.gray}└${"─".repeat(49)}┘${C.reset}`,
  ].join("\n");
}

// ─── History Manager ────────────────────────────────────────────────────────

class HistoryManager {
  private entries: HistoryEntry[] = [];
  private maxSize: number;
  private filePath: string;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.filePath = path.join(os.homedir(), ".bowo", "cli-history.json");
    this.load();
  }

  add(entry: HistoryEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxSize) {
      this.entries = this.entries.slice(-this.maxSize);
    }
    this.save();
  }

  search(query: string): HistoryEntry[] {
    const q = query.toLowerCase();
    return this.entries.filter(
      e => e.input.toLowerCase().includes(q) || e.output.toLowerCase().includes(q),
    );
  }

  getRecent(count = 20): HistoryEntry[] {
    return this.entries.slice(-count);
  }

  getAll(): HistoryEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
    this.save();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
        this.entries = Array.isArray(data) ? data.slice(-this.maxSize) : [];
      }
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2));
    } catch {
      // Silently fail — history is non-critical
    }
  }
}

// ─── Combo Manager (local cache for CLI) ────────────────────────────────────

interface ComboInfo {
  name: string;
  strategy: string;
  models: { provider: string; model: string; priority: number }[];
  createdAt: string;
}

// In-memory combos for the CLI session
const comboStore: Map<string, ComboInfo> = new Map();

function initDefaultCombos(): void {
  comboStore.set("hermes-auto", {
    name: "hermes-auto",
    strategy: "fallback",
    models: [
      { provider: "mimo", model: "mimo-v2.5-pro", priority: 1 },
      { provider: "cx", model: "gpt-5.4-mini", priority: 2 },
      { provider: "mimo", model: "mimo-v2-flash", priority: 3 },
      { provider: "qwencloud", model: "qwen3.7-plus", priority: 4 },
    ],
    createdAt: new Date().toISOString(),
  });
  comboStore.set("budget", {
    name: "budget",
    strategy: "cost-optimized",
    models: [
      { provider: "mimo", model: "mimo-v2-flash", priority: 1 },
      { provider: "deepseek", model: "deepseek-v4-flash", priority: 2 },
      { provider: "qwencloud", model: "deepseek-v4-flash", priority: 3 },
    ],
    createdAt: new Date().toISOString(),
  });
  comboStore.set("premium", {
    name: "premium",
    strategy: "fallback",
    models: [
      { provider: "cx", model: "gpt-5.5", priority: 1 },
      { provider: "agentrouter", model: "claude-opus-4-8", priority: 2 },
      { provider: "openai", model: "gpt-5.5", priority: 3 },
    ],
    createdAt: new Date().toISOString(),
  });
}

// ─── Agent Info ─────────────────────────────────────────────────────────────

const AGENT_EMOJI: Record<string, string> = {
  planner: "📋",
  architect: "🏗",
  backend: "⚙️",
  frontend: "🎨",
  qa: "✅",
  debug: "🔍",
  security: "🔒",
  devops: "🚀",
  reporter: "📊",
};

// ─── CLI Interactive Class ──────────────────────────────────────────────────

export class CLIInteractive {
  private config: CLIConfig;
  private history: HistoryManager;
  private theme: ThemeColors;
  private orchestrator: any = null;
  private running = false;
  private startTime = Date.now();

  constructor(config?: Partial<CLIConfig>) {
    this.config = {
      prompt: config?.prompt ?? `${C.cyan}${C.bold}🤖 bowo${C.reset}${C.gray}>${C.reset} `,
      historySize: config?.historySize ?? 500,
      theme: config?.theme ?? "default",
    };
    this.theme = THEMES[this.config.theme];
    this.history = new HistoryManager(this.config.historySize);
    initDefaultCombos();
  }

  // ─── Start ────────────────────────────────────────────

  async start(): Promise<void> {
    this.running = true;

    // Print welcome banner
    this.printBanner();

    // Lazy-init orchestrator
    this.printProgress("Initializing orchestrator...");
    try {
      const { Orchestrator } = await import("./orchestrator.js");
      this.orchestrator = new Orchestrator({ logLevel: "warn" });
      this.printSuccess("System ready.\n");
      this.printSystemSummary();
    } catch (err) {
      this.printWarning(`Orchestrator unavailable (running in standalone mode): ${err}`);
      this.printInfo("Commands and demos will work. Pipeline execution requires full system.\n");
    }

    // REPL loop
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: (line: string) => this.completer(line),
      historySize: 100,
    });

    // Handle Ctrl+C
    rl.on("SIGINT", () => {
      console.log(`\n${this.theme.info}Use ${C.bold}/exit${C.reset}${this.theme.info} to quit.${C.reset}`);
      rl.prompt();
    });

    rl.on("close", () => {
      console.log(`\n${this.theme.accent}${C.bold}🤖 BOWO signing off! 👋${C.reset}\n`);
      process.exit(0);
    });

    rl.setPrompt(this.config.prompt);
    rl.prompt();

    const processLine = async (line: string) => {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        return;
      }

      const start = Date.now();
      try {
        const result = await this.processInput(input);
        const duration = Date.now() - start;

        if (result.output) {
          console.log(result.output);
        }

        this.history.add({
          input,
          output: result.output.replace(/\x1b\[[0-9;]*m/g, ""),
          timestamp: new Date().toISOString(),
          duration,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`${this.theme.error}❌ Error: ${msg}${C.reset}`);
        this.history.add({
          input,
          output: `ERROR: ${msg}`,
          timestamp: new Date().toISOString(),
          duration: Date.now() - start,
        });
      }

      rl.prompt();
    };

    rl.on("line", (line) => { processLine(line); });
  }

  // ─── Tab Completion ───────────────────────────────────

  private completer(line: string): [string[], string] {
    const commands = [
      "/help", "/agents", "/ask", "/combo", "/pool", "/health",
      "/stats", "/history", "/clear", "/exit", "/theme", "/version",
    ];
    const hits = commands.filter(c => c.startsWith(line));
    return [hits.length ? hits : commands, line];
  }

  // ─── Process Input ────────────────────────────────────

  async processInput(input: string): Promise<CommandResult> {
    // Parse command
    if (input.startsWith("/")) {
      const spaceIdx = input.indexOf(" ");
      const cmd = spaceIdx === -1 ? input.toLowerCase() : input.substring(0, spaceIdx).toLowerCase();
      const args = spaceIdx === -1 ? "" : input.substring(spaceIdx + 1).trim();
      const argParts = args ? args.split(/\s+/) : [];

      switch (cmd) {
        case "/help":       return this.cmdHelp();
        case "/agents":     return this.cmdAgents();
        case "/ask":        return this.cmdAsk(argParts);
        case "/combo":      return this.cmdCombo(args, argParts);
        case "/pool":       return this.cmdPool(args, argParts);
        case "/health":     return this.cmdHealth();
        case "/stats":      return this.cmdStats();
        case "/history":    return this.cmdHistory(args);
        case "/clear":      return this.cmdClear();
        case "/exit":       return this.cmdExit();
        case "/quit":       return this.cmdExit();
        case "/theme":      return this.cmdTheme(args);
        case "/version":    return this.cmdVersion();
        default:
          return {
            output: `${this.theme.error}Unknown command: ${C.bold}${cmd}${C.reset}\n  Type ${C.cyan}/help${C.reset} for available commands.`,
            success: false,
          };
      }
    }

    // Treat as prompt to default agent (planner)
    return this.cmdAskAgent("planner", input);
  }

  // ─── Commands ─────────────────────────────────────────

  private cmdHelp(): CommandResult {
    const lines = [
      "",
      `${this.theme.header}${C.bold}╔══════════════════════════════════════════════════════╗${C.reset}`,
      `${this.theme.header}${C.bold}║          🤖 BOWO Interactive CLI — Help             ║${C.reset}`,
      `${this.theme.header}${C.bold}╠══════════════════════════════════════════════════════╣${C.reset}`,
      "",
      `  ${C.bold}Navigation${C.reset}`,
      `    ${C.cyan}/help${C.reset}                  Show this help`,
      `    ${C.cyan}/clear${C.reset}                 Clear the screen`,
      `    ${C.cyan}/exit${C.reset}                  Exit the CLI`,
      "",
      `  ${C.bold}Agents${C.reset}`,
      `    ${C.cyan}/agents${C.reset}                List all agents with status`,
      `    ${C.cyan}/ask <agent> <prompt>${C.reset}   Ask a specific agent`,
      `    ${C.cyan}<prompt>${C.reset}                Send to default agent (planner)`,
      "",
      `  ${C.bold}Combos${C.reset}`,
      `    ${C.cyan}/combo${C.reset}                  List all combos`,
      `    ${C.cyan}/combo create <name> <strategy>${C.reset}  Create a new combo`,
      `    ${C.cyan}/combo test <name> <prompt>${C.reset}       Test a combo`,
      "",
      `  ${C.bold}Pool${C.reset}`,
      `    ${C.cyan}/pool${C.reset}                   List provider pool status`,
      `    ${C.cyan}/pool add${C.reset}               Add a key interactively`,
      "",
      `  ${C.bold}System${C.reset}`,
      `    ${C.cyan}/health${C.reset}                 Run health checks`,
      `    ${C.cyan}/stats${C.reset}                  Show system stats`,
      `    ${C.cyan}/version${C.reset}                Show version info`,
      "",
      `  ${C.bold}History${C.reset}`,
      `    ${C.cyan}/history${C.reset}                Show recent commands`,
      `    ${C.cyan}/history <query>${C.reset}         Search command history`,
      "",
      `  ${C.bold}Settings${C.reset}`,
      `    ${C.cyan}/theme <name>${C.reset}           Switch theme (default|minimal|fancy)`,
      "",
      `${this.theme.header}${C.bold}╚══════════════════════════════════════════════════════╝${C.reset}`,
      "",
    ];
    return { output: lines.join("\n"), success: true };
  }

  private cmdAgents(): CommandResult {
    const agents = [
      { name: "planner",   icon: "📋", role: "Orchestrates task breakdown", status: "active" },
      { name: "architect", icon: "🏗",  role: "System design & architecture", status: "active" },
      { name: "backend",   icon: "⚙️",  role: "Server-side implementation",  status: "active" },
      { name: "frontend",  icon: "🎨", role: "UI/UX implementation",         status: "active" },
      { name: "qa",        icon: "✅", role: "Quality assurance & testing",  status: "active" },
      { name: "debug",     icon: "🔍", role: "Bug diagnosis & fixes",        status: "active" },
      { name: "security",  icon: "🔒", role: "Security audit & hardening",   status: "active" },
      { name: "devops",    icon: "🚀", role: "Deployment & infrastructure",  status: "active" },
      { name: "reporter",  icon: "📊", role: "Progress reports & summaries",  status: "active" },
    ];

    // Try to get real status from orchestrator
    let activeCount = agents.length;
    if (this.orchestrator) {
      try {
        const status = this.orchestrator.getStatus();
        activeCount = status.agents.length;
      } catch { /* use default */ }
    }

    const header = ["Name", "Role", "Status"];
    const rows = agents.map(a => [
      `${a.icon} ${C.bold}${a.name}${C.reset}`,
      C.dim + a.role + C.reset,
      `${C.green}●${C.reset} active`,
    ]);

    const table = makeTable(header, rows);
    const summary = `\n  ${C.bold}${activeCount}${C.reset} agents registered • ${C.dim}Send ${C.cyan}/ask <name> <prompt>${C.reset}${C.dim} to interact${C.reset}`;

    return { output: `\n${this.theme.header}${C.bold}🤖 Registered Agents${C.reset}\n\n${table}${summary}\n`, success: true };
  }

  private async cmdAsk(args: string[]): Promise<CommandResult> {
    if (args.length < 2) {
      return {
        output: `${this.theme.error}Usage: ${C.cyan}/ask <agent> <prompt>${C.reset}\n  Example: ${C.cyan}/ask planner Build a REST API${C.reset}`,
        success: false,
      };
    }
    const agent = args[0];
    const prompt = args.slice(1).join(" ");
    return await this.cmdAskAgent(agent, prompt);
  }

  private async cmdAskAgent(agent: string, prompt: string): Promise<CommandResult> {
    const emoji = AGENT_EMOJI[agent] ?? "🤖";

    if (!this.orchestrator) {
      return {
        output: [
          `\n${emoji} ${C.bold}${agent}${C.reset} ${C.dim}received:${C.reset} "${prompt}"`,
          `\n${C.yellow}⚠ Orchestrator not available. Start BOWO with full system to run agents.${C.reset}`,
          `${C.dim}Tip: Run ${C.cyan}npx tsx src/cli.ts${C.reset}${C.dim} for full pipeline execution.${C.reset}\n`,
        ].join("\n"),
        success: true,
        metadata: { agent, prompt, standalone: true },
      };
    }

    const stop = showProgress(`${emoji} ${agent} processing...`);

    try {
      const startTime = Date.now();
      const result = await this.orchestrator.execute(prompt, { agents: [agent] });
      const elapsed = Date.now() - startTime;
      stop();

      const outputLines = [
        `\n${emoji} ${C.bold}${agent}${C.reset} ${C.green}completed${C.reset} ${C.dim}(${elapsed}ms)${C.reset}`,
      ];

      if (result.agentResults?.length > 0) {
        for (const ar of result.agentResults) {
          const icon = ar.status === "completed" ? `${C.green}✓` : `${C.red}✗`;
          outputLines.push(`  ${icon}${C.reset} ${ar.agent} ${C.dim}${ar.duration}ms${C.reset}`);
        }
      }

      outputLines.push(`\n  ${C.dim}Artifacts: ${result.totalArtifacts} • Duration: ${result.totalDuration}ms${C.reset}`);

      return {
        output: outputLines.join("\n"),
        success: result.status === "completed",
        metadata: { agent, result },
      };
    } catch (err) {
      stop();
      const msg = err instanceof Error ? err.message : String(err);
      return {
        output: `\n${C.red}❌ ${agent} failed: ${msg}${C.reset}\n`,
        success: false,
      };
    }
  }

  private cmdCombo(args: string, argParts: string[]): CommandResult {
    if (!args || args.trim() === "" || args.trim() === "list") {
      return this.cmdComboList();
    }
    if (argParts[0] === "create") {
      return this.cmdComboCreate(argParts[1], argParts[2]);
    }
    if (argParts[0] === "test") {
      return this.cmdComboTest(argParts[1], argParts.slice(2).join(" "));
    }
    if (argParts[0] === "delete" || argParts[0] === "rm") {
      return this.cmdComboDelete(argParts[1]);
    }
    if (argParts[0] === "info") {
      return this.cmdComboInfo(argParts[1]);
    }

    return {
      output: [
        `${this.theme.error}Unknown combo subcommand: ${argParts[0]}${C.reset}`,
        `  Usage: ${C.cyan}/combo [list|create|test|delete|info]${C.reset}`,
      ].join("\n"),
      success: false,
    };
  }

  private cmdComboList(): CommandResult {
    const combos = Array.from(comboStore.values());
    if (combos.length === 0) {
      return {
        output: `\n${C.yellow}No combos configured.${C.reset} Use ${C.cyan}/combo create <name> <strategy>${C.reset} to create one.\n`,
        success: true,
      };
    }

    const header = ["Name", "Strategy", "Models", "Created"];
    const rows = combos.map(c => [
      `${C.bold}${c.name}${C.reset}`,
      C.cyan + c.strategy + C.reset,
      String(c.models.length),
      C.dim + new Date(c.createdAt).toLocaleDateString() + C.reset,
    ]);

    const table = makeTable(header, rows);

    const models = combos.flatMap(c => c.models.map(m => `    ${C.dim}•${C.reset} ${c.name} → ${m.provider}/${C.bold}${m.model}${C.reset}`));

    return {
      output: `\n${this.theme.header}${C.bold}🔗 Model Combos${C.reset}\n\n${table}\n\n  ${C.bold}Model chains:${C.reset}\n${models.join("\n")}\n`,
      success: true,
      metadata: { combos: combos.map(c => c.name) },
    };
  }

  private cmdComboCreate(name: string | undefined, strategy: string | undefined): CommandResult {
    if (!name || !strategy) {
      return {
        output: `${this.theme.error}Usage: ${C.cyan}/combo create <name> <strategy>${C.reset}\n  Strategies: fallback, round-robin, least-latency, cost-optimized, random`,
        success: false,
      };
    }

    const validStrategies = ["fallback", "round-robin", "least-latency", "cost-optimized", "random"];
    if (!validStrategies.includes(strategy)) {
      return {
        output: `${this.theme.error}Invalid strategy: ${strategy}${C.reset}\n  Valid: ${validStrategies.map(s => C.cyan + s + C.reset).join(", ")}`,
        success: false,
      };
    }

    if (comboStore.has(name)) {
      return {
        output: `${this.theme.warning}⚠ Combo "${name}" already exists. Use ${C.cyan}/combo delete ${name}${C.reset} first.${C.reset}`,
        success: false,
      };
    }

    comboStore.set(name, {
      name,
      strategy,
      models: [],
      createdAt: new Date().toISOString(),
    });

    return {
      output: `\n${C.green}✓ Combo "${name}" created with strategy "${strategy}"${C.reset}\n  ${C.dim}Add models via the provider pool, or use ${C.cyan}/combo test${C.reset}${C.dim} to run.${C.reset}\n`,
      success: true,
    };
  }

  private cmdComboTest(name: string | undefined, prompt: string | undefined): CommandResult {
    if (!name) {
      return {
        output: `${this.theme.error}Usage: ${C.cyan}/combo test <name> <prompt>${C.reset}`,
        success: false,
      };
    }

    const combo = comboStore.get(name);
    if (!combo) {
      return {
        output: `${this.theme.error}Combo "${name}" not found.${C.reset} Use ${C.cyan}/combo${C.reset} to list available combos.`,
        success: false,
      };
    }

    if (!prompt) prompt = "Hello, this is a test message.";

    const modelList = combo.models
      .sort((a, b) => a.priority - b.priority)
      .map(m => `    ${C.dim}${m.priority}.${C.reset} ${m.provider}/${C.bold}${m.model}${C.reset}`)
      .join("\n");

    return {
      output: [
        `\n${this.theme.info}${C.bold}🧪 Combo Test: ${name}${C.reset}`,
        `  ${C.dim}Strategy:${C.reset} ${C.cyan}${combo.strategy}${C.reset}`,
        `  ${C.dim}Prompt:${C.reset}   "${prompt}"`,
        `  ${C.dim}Models:${C.reset}`,
        modelList,
        `\n  ${C.yellow}⚠ Full test requires orchestrator with LLM backend.${C.reset}`,
        `  ${C.dim}Run ${C.cyan}/combo test ${name} <prompt>${C.reset}${C.dim} with LLM configured for live results.${C.reset}\n`,
      ].join("\n"),
      success: true,
      metadata: { combo: name, prompt },
    };
  }

  private cmdComboDelete(name: string | undefined): CommandResult {
    if (!name) {
      return { output: `${this.theme.error}Usage: ${C.cyan}/combo delete <name>${C.reset}`, success: false };
    }
    if (!comboStore.has(name)) {
      return { output: `${this.theme.error}Combo "${name}" not found.${C.reset}`, success: false };
    }
    comboStore.delete(name);
    return { output: `${C.green}✓ Combo "${name}" deleted.${C.reset}\n`, success: true };
  }

  private cmdComboInfo(name: string | undefined): CommandResult {
    if (!name) {
      return { output: `${this.theme.error}Usage: ${C.cyan}/combo info <name>${C.reset}`, success: false };
    }
    const combo = comboStore.get(name);
    if (!combo) {
      return { output: `${this.theme.error}Combo "${name}" not found.${C.reset}`, success: false };
    }

    const lines = [
      `\n${this.theme.header}${C.bold}🔗 Combo: ${name}${C.reset}`,
      `  ${C.dim}Strategy:${C.reset}  ${C.cyan}${combo.strategy}${C.reset}`,
      `  ${C.dim}Models:${C.reset}    ${combo.models.length}`,
      `  ${C.dim}Created:${C.reset}  ${new Date(combo.createdAt).toLocaleString()}`,
      "",
    ];

    if (combo.models.length > 0) {
      lines.push(`  ${C.bold}Model Chain:${C.reset}`);
      for (const m of combo.models.sort((a, b) => a.priority - b.priority)) {
        lines.push(`    ${C.dim}${m.priority}.${C.reset} ${m.provider}/${C.bold}${m.model}${C.reset}`);
      }
    }

    return { output: lines.join("\n") + "\n", success: true };
  }

  private cmdPool(args: string, argParts: string[]): CommandResult {
    if (!args || args.trim() === "" || args.trim() === "list") {
      return this.cmdPoolList();
    }
    if (argParts[0] === "add") {
      return this.cmdPoolAdd();
    }
    if (argParts[0] === "status") {
      return this.cmdPoolStatus();
    }

    return {
      output: `${this.theme.error}Unknown pool subcommand: ${argParts[0]}${C.reset}\n  Usage: ${C.cyan}/pool [list|add|status]${C.reset}`,
      success: false,
    };
  }

  private cmdPoolList(): CommandResult {
    // Collect configured API keys from env
    const providers = [
      { name: "OpenAI",      envKey: "OPENAI_API_KEY",       baseUrl: "api.openai.com" },
      { name: "Anthropic",   envKey: "ANTHROPIC_API_KEY",    baseUrl: "api.anthropic.com" },
      { name: "DeepSeek",    envKey: "DEEPSEEK_API_KEY",     baseUrl: "api.deepseek.com" },
      { name: "MiMo",        envKey: "MIMO_API_KEY",         baseUrl: "api.mimo.xiaomi.com" },
      { name: "QwenCloud",   envKey: "DASHSCOPE_API_KEY",    baseUrl: "dashscope-intl.aliyuncs.com" },
      { name: "Router9",     envKey: "ROUTER9_API_KEY",      baseUrl: "router9.aleca.my.id" },
      { name: "BOWO LLM",    envKey: "BOWO_LLM_API_KEY",     baseUrl: "custom" },
      { name: "Custom",      envKey: "CUSTOM_API_KEY",       baseUrl: "custom" },
    ];

    const header = ["Provider", "Status", "Key", "Endpoint"];
    const rows = providers.map(p => {
      const hasKey = !!process.env[p.envKey];
      const keyPreview = hasKey
        ? `${C.dim}${process.env[p.envKey]!.substring(0, 8)}...${C.reset}`
        : `${C.red}not set${C.reset}`;
      const status = hasKey
        ? `${C.green}● configured${C.reset}`
        : `${C.red}○ missing${C.reset}`;
      return [
        C.bold + p.name + C.reset,
        status,
        keyPreview,
        C.dim + p.baseUrl + C.reset,
      ];
    });

    const table = makeTable(header, rows);
    const configuredCount = providers.filter(p => !!process.env[p.envKey]).length;

    return {
      output: [
        `\n${this.theme.header}${C.bold}🔌 Provider Pool Status${C.reset}\n`,
        table,
        `\n  ${C.bold}${configuredCount}/${providers.length}${C.reset} providers configured`,
        `  ${C.dim}Strategy: round-robin • Cooldown: 5min • Auto-reenable: yes${C.reset}`,
        `  ${C.dim}Use ${C.cyan}/pool add${C.reset}${C.dim} to configure a new provider.${C.reset}\n`,
      ].join("\n"),
      success: true,
      metadata: { configured: configuredCount, total: providers.length },
    };
  }

  private cmdPoolAdd(): CommandResult {
    // In non-interactive mode (called from the REPL), provide instructions
    const lines = [
      `\n${this.theme.info}${C.bold}➕ Add Provider Key${C.reset}`,
      `  Configure API keys via environment variables or .env file:\n`,
      `  ${C.cyan}export OPENAI_API_KEY=sk-...${C.reset}`,
      `  ${C.cyan}export ANTHROPIC_API_KEY=sk-ant-...${C.reset}`,
      `  ${C.cyan}export DEEPSEEK_API_KEY=sk-...${C.reset}`,
      `  ${C.cyan}export MIMO_API_KEY=...${C.reset}`,
      `  ${C.cyan}export DASHSCOPE_API_KEY=...${C.reset}`,
      `  ${C.cyan}export ROUTER9_API_KEY=...${C.reset}`,
      `  ${C.cyan}export BOWO_LLM_API_KEY=...${C.reset}\n`,
      `  ${C.dim}Or add to ${C.bold}.env${C.reset}${C.dim} file in project root.${C.reset}`,
      `  ${C.dim}Then run ${C.cyan}/pool${C.reset}${C.dim} to verify.${C.reset}\n`,
    ];
    return { output: lines.join("\n"), success: true };
  }

  private cmdPoolStatus(): CommandResult {
    // Detailed status including LLM config
    const lines = [
      `\n${this.theme.header}${C.bold}📊 Pool Detailed Status${C.reset}\n`,
      `  ${C.bold}Rotation:${C.reset}    round-robin`,
      `  ${C.bold}Max Retries:${C.reset} 3`,
      `  ${C.bold}Cooldown:${C.reset}     5 minutes`,
      `  ${C.bold}Auto-reenable:${C.reset} yes`,
      `  ${C.bold}Health Check:${C.reset}  every 60s`,
    ];

    // Check if BOWO LLM is configured
    const llmProvider = process.env.BOWO_LLM_PROVIDER;
    const llmModel = process.env.BOWO_LLM_MODEL;
    const llmBaseUrl = process.env.BOWO_LLM_BASE_URL;

    if (llmProvider || llmModel || llmBaseUrl) {
      lines.push(`\n  ${C.bold}Active LLM Configuration:${C.reset}`);
      if (llmProvider) lines.push(`    Provider: ${C.cyan}${llmProvider}${C.reset}`);
      if (llmModel) lines.push(`    Model:    ${C.cyan}${llmModel}${C.reset}`);
      if (llmBaseUrl) lines.push(`    Base URL: ${C.dim}${llmBaseUrl}${C.reset}`);
    } else {
      lines.push(`\n  ${C.yellow}⚠ No BOWO_LLM_* environment variables set.${C.reset}`);
      lines.push(`  ${C.dim}LLM will use default provider detection.${C.reset}`);
    }

    lines.push("");
    return { output: lines.join("\n"), success: true };
  }

  private cmdHealth(): CommandResult {
    const checks: { name: string; status: boolean; detail: string }[] = [];

    // Check Node.js version
    const nodeVersion = process.version;
    const nodeOk = parseInt(nodeVersion.slice(1)) >= 22;
    checks.push({
      name: "Node.js",
      status: nodeOk,
      detail: `${nodeVersion} ${nodeOk ? "(>=22 ✓)" : "(>=22 required ✗)"}`,
    });

    // Check LLM availability
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasAnyKey = !!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY
      || !!process.env.DEEPSEEK_API_KEY || !!process.env.MIMO_API_KEY
      || !!process.env.ROUTER9_API_KEY || !!process.env.BOWO_LLM_API_KEY;
    checks.push({
      name: "LLM API Key",
      status: hasAnyKey,
      detail: hasAnyKey ? "At least one provider configured" : "No API keys found",
    });

    // Check orchestrator
    const orchOk = !!this.orchestrator;
    checks.push({
      name: "Orchestrator",
      status: orchOk,
      detail: orchOk ? "Initialized" : "Not initialized (standalone mode)",
    });

    // Check memory
    let memOk = false;
    let memDetail = "N/A";
    if (this.orchestrator) {
      try {
        const mem = this.orchestrator.getMemory();
        const summary = mem.getSummary();
        memOk = true;
        memDetail = `${summary.totalEntries} entries`;
      } catch {
        memDetail = "Error reading memory";
      }
    } else {
      memDetail = "Requires orchestrator";
    }
    checks.push({
      name: "Memory",
      status: memOk,
      detail: memDetail,
    });

    // Check output directory
    const outputDir = path.resolve("output");
    const outExists = fs.existsSync(outputDir);
    checks.push({
      name: "Output Dir",
      status: true, // not critical
      detail: outExists ? `${outputDir}` : "Will be created on first use",
    });

    // Check history persistence
    const histDir = path.join(os.homedir(), ".bowo");
    const histFile = path.join(histDir, "cli-history.json");
    const histExists = fs.existsSync(histFile);
    checks.push({
      name: "History File",
      status: true,
      detail: histExists ? `${histFile}` : "Will be created on first command",
    });

    // OS info
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const memPercent = Math.round((1 - freeMem / totalMem) * 100);

    // Build output
    const allOk = checks.every(c => c.status);
    const header = allOk
      ? `${C.green}${C.bold}✅ All Systems Operational${C.reset}`
      : `${C.yellow}${C.bold}⚠ Some Checks Failed${C.reset}`;

    const checkLines = checks.map(c => {
      const icon = c.status ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
      return `  ${icon} ${C.bold}${c.name.padEnd(16)}${C.reset} ${C.dim}${c.detail}${C.reset}`;
    });

    return {
      output: [
        `\n${this.theme.header}${C.bold}🏥 Health Checks${C.reset}`,
        `  ${header}`,
        "",
        ...checkLines,
        "",
        `  ${C.dim}Memory: ${memPercent}% used (${this.formatBytes(freeMem)} free)${C.reset}`,
        `  ${C.dim}Uptime: ${this.formatDuration(Date.now() - this.startTime)}${C.reset}\n`,
      ].join("\n"),
      success: allOk,
      metadata: { checks: checks.map(c => ({ name: c.name, ok: c.status })) },
    };
  }

  private cmdStats(): CommandResult {
    const lines = [
      `\n${this.theme.header}${C.bold}📊 System Statistics${C.reset}\n`,
      `  ${C.bold}Session${C.reset}`,
      `    Start:       ${new Date(this.startTime).toLocaleString()}`,
      `    Uptime:      ${this.formatDuration(Date.now() - this.startTime)}`,
      `    Commands:    ${this.history.getAll().length}`,
      `    Theme:       ${C.cyan}${this.config.theme}${C.reset}`,
      "",
      `  ${C.bold}System${C.reset}`,
      `    Node:        ${process.version}`,
      `    Platform:    ${process.platform} ${process.arch}`,
      `    Hostname:    ${os.hostname()}`,
      `    CPUs:        ${os.cpus().length}`,
      `    Free Memory: ${this.formatBytes(os.freemem())} / ${this.formatBytes(os.totalmem())}`,
      "",
      `  ${C.bold}Agents${C.reset}`,
    ];

    const agentNames = Object.keys(AGENT_EMOJI);
    for (const name of agentNames) {
      lines.push(`    ${AGENT_EMOJI[name]} ${name.padEnd(12)} ${C.green}●${C.reset} active`);
    }

    lines.push("");
    lines.push(`  ${C.bold}Combos${C.reset}  ${comboStore.size} configured`);
    lines.push("");

    if (this.orchestrator) {
      try {
        const status = this.orchestrator.getStatus();
        lines.push(`  ${C.bold}LLM${C.reset}`);
        lines.push(`    Model:       ${status.llm.available ? `${C.green}${status.llm.model}${C.reset}` : `${C.red}offline${C.reset}`}`);
        lines.push(`    Pipelines:   ${status.pipelines}`);
        lines.push(`    Memory:      ${status.memory.totalEntries} entries`);
        lines.push("");
      } catch { /* skip */ }
    }

    const historyEntries = this.history.getAll();
    if (historyEntries.length > 0) {
      const totalDuration = historyEntries.reduce((s, e) => s + e.duration, 0);
      const avgDuration = Math.round(totalDuration / historyEntries.length);
      lines.push(`  ${C.bold}Performance${C.reset}`);
      lines.push(`    Total cmds:  ${historyEntries.length}`);
      lines.push(`    Avg latency: ${avgDuration}ms`);
      lines.push(`    Total time:  ${this.formatDuration(totalDuration)}`);
      lines.push("");
    }

    return { output: lines.join("\n"), success: true };
  }

  private cmdHistory(query?: string): CommandResult {
    if (query && query.trim() !== "") {
      // Search mode
      const results = this.history.search(query);
      if (results.length === 0) {
        return {
          output: `${C.yellow}No history entries matching "${query}".${C.reset}\n`,
          success: true,
        };
      }

      const header = ["#", "Time", "Input", "Duration"];
      const rows = results.slice(-20).map((e, i) => [
        C.dim + String(i + 1) + C.reset,
        C.dim + new Date(e.timestamp).toLocaleTimeString() + C.reset,
        C.cyan + e.input.substring(0, 50) + (e.input.length > 50 ? "..." : "") + C.reset,
        C.dim + `${e.duration}ms` + C.reset,
      ]);

      return {
        output: `\n${this.theme.header}${C.bold}🔍 History Search: "${query}"${C.reset} ${C.dim}(${results.length} results)${C.reset}\n\n${makeTable(header, rows)}\n`,
        success: true,
      };
    }

    // List recent
    const entries = this.history.getRecent(20);
    if (entries.length === 0) {
      return {
        output: `${C.yellow}No command history yet.${C.reset}\n`,
        success: true,
      };
    }

    const header = ["#", "Time", "Input", "Result"];
    const rows = entries.map((e, i) => [
      C.dim + String(i + 1) + C.reset,
      C.dim + new Date(e.timestamp).toLocaleTimeString() + C.reset,
      C.cyan + e.input.substring(0, 45) + (e.input.length > 45 ? "..." : "") + C.reset,
      e.output.startsWith("ERROR")
        ? `${C.red}✗ error${C.reset}`
        : `${C.green}✓${C.reset} ${C.dim}${e.duration}ms${C.reset}`,
    ]);

    return {
      output: `\n${this.theme.header}${C.bold}📜 Command History${C.reset} ${C.dim}(last ${entries.length})${C.reset}\n\n${makeTable(header, rows)}\n  ${C.dim}Use ${C.cyan}/history <query>${C.reset}${C.dim} to search.${C.reset}\n`,
      success: true,
    };
  }

  private cmdClear(): CommandResult {
    // ANSI clear screen
    return { output: "\x1b[2J\x1b[H", success: true };
  }

  private cmdExit(): CommandResult {
    console.log(`\n${this.theme.accent}${C.bold}🤖 BOWO signing off! 👋${C.reset}\n`);
    process.exit(0);
  }

  private cmdTheme(args: string): CommandResult {
    const themeName = args.trim() as CLIConfig["theme"];
    if (!themeName || !THEMES[themeName]) {
      const valid = Object.keys(THEMES).join(", ");
      return {
        output: `${this.theme.error}Usage: ${C.cyan}/theme <name>${C.reset}\n  Valid themes: ${C.cyan}${valid}${C.reset}`,
        success: false,
      };
    }

    this.config.theme = themeName;
    this.config.prompt = THEMES[themeName].prompt;
    this.theme = THEMES[themeName];

    return {
      output: `${C.green}✓ Theme changed to "${themeName}"${C.reset}\n`,
      success: true,
    };
  }

  private cmdVersion(): CommandResult {
    const version = getVersion();
    const lines = [
      "",
      `${this.theme.header}${C.bold}╔══════════════════════════════════════╗${C.reset}`,
      `${this.theme.header}${C.bold}║   🤖 BOWO — Agent System v${version.padEnd(10)}   ║${C.reset}`,
      `${this.theme.header}${C.bold}╠══════════════════════════════════════╣${C.reset}`,
      `${this.theme.header}${C.bold}║  Backend Orchestrator for Workflow   ║${C.reset}`,
      `${this.theme.header}${C.bold}║         Optimization                 ║${C.reset}`,
      `${this.theme.header}${C.bold}╚══════════════════════════════════════╝${C.reset}`,
      "",
      `  ${C.dim}Version:${C.reset}    ${version}`,
      `  ${C.dim}Node:${C.reset}       ${process.version}`,
      `  ${C.dim}Platform:${C.reset}   ${process.platform}/${process.arch}`,
      `  ${C.dim}Module:${C.reset}     ES Modules (TypeScript)`,
      `  ${C.dim}License:${C.reset}    MIT`,
      "",
    ];
    return { output: lines.join("\n"), success: true, metadata: { version } };
  }

  // ─── Helpers ──────────────────────────────────────────

  private printBanner(): void {
    const version = getVersion();
    const banner = [
      "",
      `${C.magenta}${C.bold}╔════════════════════════════════════════════════════════╗${C.reset}`,
      `${C.magenta}${C.bold}║${C.reset}  ${C.cyan}${C.bold}🤖 BOWO Interactive CLI${C.reset}  ${C.dim}v${version}${C.reset}${C.magenta}${C.bold}                          ║${C.reset}`,
      `${C.magenta}${C.bold}║${C.reset}  ${C.dim}Backend Orchestrator for Workflow Optimization${C.reset}      ${C.magenta}${C.bold}║${C.reset}`,
      `${C.magenta}${C.bold}╠════════════════════════════════════════════════════════╣${C.reset}`,
      `${C.magenta}${C.bold}║${C.reset}  ${C.cyan}/help${C.reset} commands   ${C.cyan}/agents${C.reset} list   ${C.cyan}/combo${C.reset} chains   ${C.cyan}/pool${C.reset} keys  ${C.magenta}${C.bold}║${C.reset}`,
      `${C.magenta}${C.bold}║${C.reset}  ${C.cyan}/health${C.reset} checks   ${C.cyan}/stats${C.reset} info   ${C.cyan}/history${C.reset} log     ${C.cyan}/exit${C.reset} quit  ${C.magenta}${C.bold}║${C.reset}`,
      `${C.magenta}${C.bold}╚════════════════════════════════════════════════════════╝${C.reset}`,
      "",
    ];
    console.log(banner.join("\n"));
  }

  private printSystemSummary(): void {
    if (!this.orchestrator) return;
    try {
      const status = this.orchestrator.getStatus();
      const lines = [
        `  ${C.bold}System Summary${C.reset}`,
        `    Agents: ${C.cyan}${status.agents.length}${C.reset} (${status.agents.join(", ")})`,
        `    LLM:    ${status.llm.available ? `${C.green}🟢 ${status.llm.model}${C.reset}` : `${C.red}🔴 Offline (rule-based)${C.reset}`}`,
        `    Memory: ${status.memory.totalEntries} entries`,
        `    Combos: ${comboStore.size} configured`,
        "",
      ];
      console.log(lines.join("\n"));
    } catch { /* skip */ }
  }

  private printProgress(message: string): void {
    console.log(`${C.cyan}⏳${C.reset} ${C.dim}${message}${C.reset}`);
  }

  private printSuccess(message: string): void {
    console.log(`${C.green}✓${C.reset} ${message}`);
  }

  private printWarning(message: string): void {
    console.log(`${C.yellow}⚠${C.reset} ${message}`);
  }

  private printInfo(message: string): void {
    console.log(`${C.blue}ℹ${C.reset} ${message}`);
  }

  private formatBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainSec = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainSec}s`;
    const hours = Math.floor(minutes / 60);
    const remainMin = minutes % 60;
    return `${hours}h ${remainMin}m`;
  }
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Parse CLI args
  const args = process.argv.slice(2);
  let theme: CLIConfig["theme"] = "default";
  let prompt: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--theme" && args[i + 1]) {
      theme = args[++i] as CLIConfig["theme"];
    }
    if (args[i] === "--prompt" && args[i + 1]) {
      prompt = args[++i];
    }
  }

  const cli = new CLIInteractive({ theme, prompt });
  await cli.start();
}

main().catch((err) => {
  console.error(`\x1b[31m❌ Fatal error:\x1b[0m`, err);
  process.exit(1);
});

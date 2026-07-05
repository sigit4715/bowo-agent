/**
 * BOWO Plugin System — Dynamic Agent Loading
 *
 * Load custom agents from files without editing core.
 * Drop a .ts/.js file in plugins/ and it auto-registers.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult } from "./agents/base.js";
import type { BowoMemory } from "./memory.js";
import type { Communication } from "./communication.js";

// ─── Types ──────────────────────────────────────────────

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  agent: {
    name: string;
    role: string;
    emoji: string;
    priority: number;
    capabilities: string[];
  };
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  agentClass: new (memory: BowoMemory, comm: Communication) => BaseAgent;
}

// ─── Plugin Loader ──────────────────────────────────────

export class PluginLoader {
  private pluginsDir: string;
  private loaded: Map<string, LoadedPlugin> = new Map();

  constructor(pluginsDir: string = "plugins") {
    this.pluginsDir = path.resolve(pluginsDir);
    fs.mkdirSync(this.pluginsDir, { recursive: true });
  }

  /**
   * Scan plugins directory and load all valid plugins.
   */
  async loadAll(): Promise<LoadedPlugin[]> {
    const results: LoadedPlugin[] = [];

    if (!fs.existsSync(this.pluginsDir)) return results;

    const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pluginDir = path.join(this.pluginsDir, entry.name);
      const manifestPath = path.join(pluginDir, "manifest.json");
      const agentPath = path.join(pluginDir, "agent.ts");

      if (!fs.existsSync(manifestPath) || !fs.existsSync(agentPath)) {
        console.log(`  ⚠️  Skipping ${entry.name}: missing manifest.json or agent.ts`);
        continue;
      }

      try {
        const plugin = await this.loadPlugin(pluginDir);
        results.push(plugin);
        console.log(`  ✅ Loaded plugin: ${plugin.manifest.agent.emoji} ${plugin.manifest.name} v${plugin.manifest.version}`);
      } catch (err) {
        console.log(`  ❌ Failed to load ${entry.name}: ${err}`);
      }
    }

    return results;
  }

  /**
   * Load a single plugin from directory.
   */
  async loadPlugin(pluginDir: string): Promise<LoadedPlugin> {
    const manifestPath = path.join(pluginDir, "manifest.json");
    const agentPath = path.join(pluginDir, "agent.ts");

    // Read manifest
    const manifestRaw = fs.readFileSync(manifestPath, "utf-8");
    const manifest: PluginManifest = JSON.parse(manifestRaw);

    // Validate manifest
    if (!manifest.name || !manifest.agent?.name) {
      throw new Error("Invalid manifest: missing name or agent.name");
    }

    // Load agent module (use tsx/ts-node or compiled .js)
    const resolvedPath = pathToFileURL(agentPath).href;
    const mod = await import(resolvedPath);

    // Find the agent class (default export or named export matching agent name)
    let AgentClass: new (memory: BowoMemory, comm: Communication) => BaseAgent;

    if (mod.default && typeof mod.default === "function") {
      AgentClass = mod.default;
    } else if (mod[manifest.agent.name + "Agent"]) {
      AgentClass = mod[manifest.agent.name + "Agent"];
    } else {
      // Find first class export that extends BaseAgent
      const exports = Object.values(mod);
      const found = exports.find((exp) => typeof exp === "function" && exp.prototype instanceof BaseAgent);
      if (!found) {
        throw new Error("No valid agent class found in module");
      }
      AgentClass = found as new (memory: BowoMemory, comm: Communication) => BaseAgent;
    }

    this.loaded.set(manifest.name, { manifest, agentClass: AgentClass });

    return { manifest, agentClass: AgentClass };
  }

  /**
   * Get all loaded plugins.
   */
  getLoaded(): LoadedPlugin[] {
    return [...this.loaded.values()];
  }

  /**
   * Get a specific plugin by name.
   */
  get(name: string): LoadedPlugin | undefined {
    return this.loaded.get(name);
  }

  /**
   * Create a plugin template/scaffold.
   */
  static scaffold(name: string, pluginsDir: string = "plugins"): void {
    const pluginDir = path.join(pluginsDir, name);
    fs.mkdirSync(pluginDir, { recursive: true });

    const manifest: PluginManifest = {
      name,
      version: "1.0.0",
      description: `Custom ${name} agent plugin`,
      author: "Bowo",
      agent: {
        name,
        role: `${name} Specialist`,
        emoji: "🔧",
        priority: 5,
        capabilities: [name],
      },
    };

    fs.writeFileSync(
      path.join(pluginDir, "manifest.json"),
      JSON.stringify(manifest, null, 2)
    );

    fs.writeFileSync(
      path.join(pluginDir, "agent.ts"),
      `/**
 * Plugin: ${name}
 * Custom agent for BOWO framework.
 */

import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult } from "../../src/agents/base.js";
import type { BowoMemory } from "../../src/memory.js";
import type { Communication } from "../../src/communication.js";
import { MemoryType } from "../../src/memory.js";

const ${name.charAt(0).toUpperCase() + name.slice(1)}Config: AgentConfig = {
  name: "${name}",
  role: "${name} Specialist",
  description: "Custom ${name} agent",
  emoji: "🔧",
  priority: 5,
  enabled: true,
  systemPrompt: \`You are the ${name} agent. Do your thing.\`,
  capabilities: ["${name}"],
};

export class ${name.charAt(0).toUpperCase() + name.slice(1)}Agent extends BaseAgent {
  constructor(memory: BowoMemory, comm: Communication) {
    super(${name.charAt(0).toUpperCase() + name.slice(1)}Config, memory, comm);
  }

  async execute(task: TaskInput): Promise<TaskResult> {
    const start = Date.now();

    // Use LLM if available
    if (this.llm.isAvailable()) {
      const response = await this.askLLM(
        \`Execute the following task: \${task.description}\\n\\nContext: \${JSON.stringify(task.context)}\`
      );

      return this.success(
        { result: response },
        [{ name: "output.md", type: "document", content: response }],
        [],
        Date.now() - start
      );
    }

    // Offline fallback
    return this.success(
      { message: "[${name}] Offline mode — task received: " + task.description },
      [],
      ["Configure LLM to enable AI reasoning"],
      Date.now() - start
    );
  }
}
`
    );

    console.log(`✅ Plugin scaffold created: ${pluginDir}/`);
    console.log(`   📄 manifest.json`);
    console.log(`   📄 agent.ts`);
  }
}

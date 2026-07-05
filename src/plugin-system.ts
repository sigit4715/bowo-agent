/**
 * 🧩 Plugin System v2 — Hot-load plugins for BOWO
 *
 * Load, unload, and manage plugins at runtime without restart.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Types ──────────────────────────────────────────────

export type PluginType = "agent" | "middleware" | "transformer" | "notifier" | "tool" | "custom";

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  type: PluginType;
  entryPoint: string;
  dependencies?: string[];
  config?: Record<string, any>;
  hooks?: string[];
}

export interface PluginInstance {
  id: string;
  manifest: PluginManifest;
  enabled: boolean;
  loadedAt: string;
  instance: any;
  error?: string;
}

export interface PluginHook {
  name: string;
  description: string;
  execute: (...args: any[]) => Promise<any> | any;
}

export interface PluginSystemConfig {
  pluginsDir: string;
  autoLoad: boolean;
  maxPlugins: number;
  sandboxMode: boolean;
}

// ─── Plugin System ──────────────────────────────────────

export class PluginSystem {
  private config: PluginSystemConfig;
  private plugins: Map<string, PluginInstance> = new Map();
  private hooks: Map<string, PluginHook[]> = new Map();
  private storagePath: string;

  constructor(config?: Partial<PluginSystemConfig>) {
    this.config = {
      pluginsDir: path.resolve(process.cwd(), "plugins"),
      autoLoad: true,
      maxPlugins: 50,
      sandboxMode: false,
      ...config,
    };
    this.storagePath = path.resolve(this.config.pluginsDir, ".plugins-state.json");

    // Ensure plugins dir exists
    if (!fs.existsSync(this.config.pluginsDir)) {
      fs.mkdirSync(this.config.pluginsDir, { recursive: true });
    }
  }

  /**
   * Load all plugins from plugins directory
   */
  async loadAll(): Promise<void> {
    if (!this.config.autoLoad) return;

    const entries = fs.readdirSync(this.config.pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const manifestPath = path.join(this.config.pluginsDir, entry.name, "manifest.json");
        if (fs.existsSync(manifestPath)) {
          try {
            await this.loadPlugin(entry.name);
          } catch (err: any) {
            console.error(`Plugin ${entry.name} failed to load:`, err.message);
          }
        }
      }
    }
  }

  /**
   * Load a single plugin
   */
  async loadPlugin(name: string): Promise<PluginInstance> {
    if (this.plugins.size >= this.config.maxPlugins) {
      throw new Error("Max plugins reached");
    }

    const pluginDir = path.join(this.config.pluginsDir, name);
    const manifestPath = path.join(pluginDir, "manifest.json");

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Plugin ${name} not found`);
    }

    const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

    // Check dependencies
    if (manifest.dependencies) {
      for (const dep of manifest.dependencies) {
        if (!this.plugins.has(dep)) {
          throw new Error(`Missing dependency: ${dep}`);
        }
      }
    }

    // Load plugin entry point
    const entryPath = path.join(pluginDir, manifest.entryPoint);
    let instance: any;

    try {
      const mod = await import(entryPath);
      instance = mod.default ?? mod;
      if (typeof instance === "function") {
        instance = new instance(manifest.config ?? {});
      }
    } catch (err: any) {
      throw new Error(`Failed to load plugin ${name}: ${err.message}`);
    }

    const plugin: PluginInstance = {
      id: crypto.randomUUID(),
      manifest,
      enabled: true,
      loadedAt: new Date().toISOString(),
      instance,
    };

    this.plugins.set(name, plugin);

    // Register hooks
    if (manifest.hooks) {
      for (const hookName of manifest.hooks) {
        if (typeof instance[hookName] === "function") {
          this.registerHook(hookName, {
            name: hookName,
            description: `Plugin ${name} hook`,
            execute: instance[hookName].bind(instance),
          });
        }
      }
    }

    // Call onLoad if exists
    if (typeof instance.onLoad === "function") {
      await instance.onLoad();
    }

    this.persist();
    return plugin;
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(name: string): Promise<boolean> {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;

    // Call onUnload if exists
    if (typeof plugin.instance.onUnload === "function") {
      await plugin.instance.onUnload();
    }

    // Remove hooks
    for (const [hookName, hooks] of Array.from(this.hooks.entries())) {
      const filtered = hooks.filter((h) => h.description !== `Plugin ${name} hook`);
      if (filtered.length === 0) {
        this.hooks.delete(hookName);
      } else {
        this.hooks.set(hookName, filtered);
      }
    }

    this.plugins.delete(name);
    this.persist();
    return true;
  }

  /**
   * Enable a plugin
   */
  enablePlugin(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;
    plugin.enabled = true;
    this.persist();
    return true;
  }

  /**
   * Disable a plugin
   */
  disablePlugin(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;
    plugin.enabled = false;
    this.persist();
    return true;
  }

  /**
   * Get a plugin by name
   */
  getPlugin(name: string): PluginInstance | undefined {
    return this.plugins.get(name);
  }

  /**
   * List all loaded plugins
   */
  listPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get enabled plugins
   */
  getEnabledPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values()).filter((p) => p.enabled);
  }

  /**
   * Execute a hook across all enabled plugins
   */
  async executeHook(hookName: string, ...args: any[]): Promise<any[]> {
    const results: any[] = [];
    const hookList = this.hooks.get(hookName) ?? [];

    for (const hook of hookList) {
      try {
        const result = await hook.execute(...args);
        results.push(result);
      } catch (err: any) {
        results.push({ error: err.message });
      }
    }

    return results;
  }

  /**
   * Register a hook
   */
  registerHook(name: string, hook: PluginHook): void {
    if (!this.hooks.has(name)) {
      this.hooks.set(name, []);
    }
    this.hooks.get(name)!.push(hook);
  }

  /**
   * Get all registered hooks
   */
  getHooks(): string[] {
    return Array.from(this.hooks.keys());
  }

  /**
   * Install a plugin from a tarball or directory
   */
  async installPlugin(source: string): Promise<PluginInstance> {
    const isDir = fs.statSync(source).isDirectory();
    if (!isDir) {
      throw new Error("Only directory plugins supported");
    }

    const manifestPath = path.join(source, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error("No manifest.json found");
    }

    const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const targetDir = path.join(this.config.pluginsDir, manifest.name);

    // Copy to plugins dir
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const files = fs.readdirSync(source);
    for (const file of files) {
      if (file === ".plugins-state.json") continue;
      fs.copyFileSync(path.join(source, file), path.join(targetDir, file));
    }

    return this.loadPlugin(manifest.name);
  }

  /**
   * Export a plugin as a directory path
   */
  exportPlugin(name: string): string | null {
    const plugin = this.plugins.get(name);
    if (!plugin) return null;
    return path.join(this.config.pluginsDir, name);
  }

  /**
   * Get stats
   */
  getStats(): {
    totalPlugins: number;
    enabledPlugins: number;
    pluginsByType: Record<string, number>;
    totalHooks: number;
  } {
    const plugins = Array.from(this.plugins.values());
    const byType: Record<string, number> = {};

    for (const p of plugins) {
      byType[p.manifest.type] = (byType[p.manifest.type] ?? 0) + 1;
    }

    return {
      totalPlugins: plugins.length,
      enabledPlugins: plugins.filter((p) => p.enabled).length,
      pluginsByType: byType,
      totalHooks: Array.from(this.hooks.values()).reduce((s, h) => s + h.length, 0),
    };
  }

  /**
   * Persist plugin state
   */
  private persist(): void {
    const state = Array.from(this.plugins.values()).map((p) => ({
      name: p.manifest.name,
      enabled: p.enabled,
    }));
    fs.writeFileSync(this.storagePath, JSON.stringify(state, null, 2));
  }

  /**
   * Load persisted state
   */
  private loadState(): void {
    if (fs.existsSync(this.storagePath)) {
      try {
        JSON.parse(fs.readFileSync(this.storagePath, "utf-8"));
      } catch {
        // ignore
      }
    }
  }
}

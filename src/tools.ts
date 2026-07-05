/**
 * 🛠 BOWO Tools — File I/O, Terminal, and LLM Execution
 *
 * These tools are available to all agents for real execution.
 * Each tool has safety limits and error handling.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync, spawn } from "node:child_process";

// ─── Types ──────────────────────────────────────────────

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
}

export interface FileContent {
  path: string;
  content: string;
  size: number;
  modified: string;
}

// ─── File I/O Tools ─────────────────────────────────────

export class FileTools {
  private workDir: string;

  constructor(workDir: string = process.cwd()) {
    this.workDir = workDir;
  }

  /**
   * Read a file.
   */
  readFile(filePath: string): ToolResult {
    const start = Date.now();
    try {
      const fullPath = path.resolve(this.workDir, filePath);
      const content = fs.readFileSync(fullPath, "utf-8");
      const stats = fs.statSync(fullPath);
      return {
        success: true,
        output: content,
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        output: "",
        error: `Failed to read ${filePath}: ${err.message}`,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Write a file (creates directories automatically).
   */
  writeFile(filePath: string, content: string): ToolResult {
    const start = Date.now();
    try {
      const fullPath = path.resolve(this.workDir, filePath);
      const dir = path.dirname(fullPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, content, "utf-8");
      return {
        success: true,
        output: `✅ Written ${filePath} (${content.length} bytes)`,
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        output: "",
        error: `Failed to write ${filePath}: ${err.message}`,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * List files in a directory.
   */
  listDir(dirPath: string = ".", pattern?: string): ToolResult {
    const start = Date.now();
    try {
      const fullPath = path.resolve(this.workDir, dirPath);
      const items = fs.readdirSync(fullPath, { withFileTypes: true });
      let lines = items.map((item) => {
        const icon = item.isDirectory() ? "📁" : "📄";
        return `${icon} ${item.name}`;
      });

      if (pattern) {
        const regex = new RegExp(pattern, "i");
        lines = lines.filter((line) => regex.test(line));
      }

      return {
        success: true,
        output: lines.join("\n") || "(empty directory)",
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        output: "",
        error: `Failed to list ${dirPath}: ${err.message}`,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Search for files by name pattern.
   */
  findFiles(pattern: string, dir: string = "."): ToolResult {
    const start = Date.now();
    try {
      const fullPath = path.resolve(this.workDir, dir);
      const results: string[] = [];

      const walk = (currentDir: string) => {
        const items = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const item of items) {
          const itemPath = path.join(currentDir, item.name);
          if (item.isDirectory() && !item.name.startsWith(".") && item.name !== "node_modules") {
            walk(itemPath);
          } else if (item.isFile() && new RegExp(pattern, "i").test(item.name)) {
            results.push(path.relative(this.workDir, itemPath));
          }
        }
      };

      walk(fullPath);
      return {
        success: true,
        output: results.join("\n") || "No files found",
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        output: "",
        error: `Failed to find files: ${err.message}`,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Search content inside files (grep-like).
   */
  grep(pattern: string, dir: string = ".", filePattern?: string): ToolResult {
    const start = Date.now();
    try {
      const fullPath = path.resolve(this.workDir, dir);
      const results: string[] = [];
      const regex = new RegExp(pattern, "i");

      const walk = (currentDir: string) => {
        const items = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const item of items) {
          const itemPath = path.join(currentDir, item.name);
          if (item.isDirectory() && !item.name.startsWith(".") && item.name !== "node_modules") {
            walk(itemPath);
          } else if (item.isFile()) {
            if (filePattern && !new RegExp(filePattern, "i").test(item.name)) continue;
            try {
              const content = fs.readFileSync(itemPath, "utf-8");
              const lines = content.split("\n");
              lines.forEach((line, idx) => {
                if (regex.test(line)) {
                  const relPath = path.relative(this.workDir, itemPath);
                  results.push(`${relPath}:${idx + 1}: ${line.trim()}`);
                }
              });
            } catch {
              // skip binary files
            }
          }
        }
      };

      walk(fullPath);
      return {
        success: true,
        output: results.slice(0, 50).join("\n") || "No matches found",
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        output: "",
        error: `Grep failed: ${err.message}`,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Delete a file.
   */
  deleteFile(filePath: string): ToolResult {
    const start = Date.now();
    try {
      const fullPath = path.resolve(this.workDir, filePath);
      fs.unlinkSync(fullPath);
      return {
        success: true,
        output: `🗑 Deleted ${filePath}`,
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        output: "",
        error: `Failed to delete ${filePath}: ${err.message}`,
        duration: Date.now() - start,
      };
    }
  }
}

// ─── Terminal Tools ─────────────────────────────────────

export class TerminalTools {
  private workDir: string;
  private timeout: number;

  constructor(workDir: string = process.cwd(), timeout: number = 30_000) {
    this.workDir = workDir;
    this.timeout = timeout;
  }

  /**
   * Execute a shell command (foreground).
   */
  exec(command: string, options: { timeout?: number; cwd?: string } = {}): ToolResult {
    const start = Date.now();
    try {
      const output = execSync(command, {
        cwd: options.cwd ?? this.workDir,
        encoding: "utf-8",
        timeout: options.timeout ?? this.timeout,
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 1024 * 1024, // 1MB
      });
      return {
        success: true,
        output: output.trim(),
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        output: err.stdout?.toString() ?? "",
        error: err.stderr?.toString() ?? err.message,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Run npm commands.
   */
  npm(args: string, cwd?: string): ToolResult {
    return this.exec(`npm ${args}`, { cwd, timeout: 60_000 });
  }

  /**
   * Run git commands.
   */
  git(args: string, cwd?: string): ToolResult {
    return this.exec(`git ${args}`, { cwd });
  }

  /**
   * Check if a command exists.
   */
  commandExists(cmd: string): boolean {
    try {
      execSync(`which ${cmd}`, { encoding: "utf-8", stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get system info.
   */
  getSystemInfo(): ToolResult {
    const start = Date.now();
    const info = {
      node: this.exec("node --version").output,
      npm: this.exec("npm --version").output,
      git: this.exec("git --version").output,
      os: this.exec("uname -s").output,
      arch: this.exec("uname -m").output,
      cwd: this.workDir,
    };
    return {
      success: true,
      output: JSON.stringify(info, null, 2),
      duration: Date.now() - start,
    };
  }
}

// ─── LLM Execution Tools ────────────────────────────────

export class LLMTools {
  private llm: any; // LLMClient instance

  constructor(llm: any) {
    this.llm = llm;
  }

  /**
   * Ask LLM to reason about a task.
   */
  async reason(task: string, context?: string): Promise<ToolResult> {
    const start = Date.now();
    try {
      const systemPrompt = `You are an expert software engineer. Analyze the task and provide a detailed, actionable plan.
${context ? `\nContext:\n${context}` : ""}

Respond with:
1. Analysis of the task
2. Step-by-step plan
3. Expected artifacts
4. Potential risks`;

      const response = await this.llm.prompt(systemPrompt, task);
      return {
        success: true,
        output: response.content,
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        output: "",
        error: `LLM reasoning failed: ${err.message}`,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Ask LLM to generate code.
   */
  async generateCode(task: string, language: string = "typescript", context?: string): Promise<ToolResult> {
    const start = Date.now();
    try {
      const systemPrompt = `You are an expert ${language} developer. Generate production-quality code.
${context ? `\nExisting code context:\n${context}` : ""}

Requirements:
- Clean, well-structured code
- Proper error handling
- TypeScript types where applicable
- Comments for complex logic`;

      const response = await this.llm.prompt(systemPrompt, task);
      return {
        success: true,
        output: response.content,
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        output: "",
        error: `LLM code generation failed: ${err.message}`,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Ask LLM to review code.
   */
  async reviewCode(code: string, criteria?: string): Promise<ToolResult> {
    const start = Date.now();
    try {
      const systemPrompt = `You are an expert code reviewer. Review the following code for:
${criteria || "- Bugs and errors\n- Security vulnerabilities\n- Performance issues\n- Code style and best practices\n- Missing error handling"}

Provide:
1. Issues found (with severity: critical/high/medium/low)
2. Suggestions for improvement
3. Overall assessment`;

      const response = await this.llm.prompt(systemPrompt, `Review this code:\n\n${code}`);
      return {
        success: true,
        output: response.content,
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        output: "",
        error: `LLM code review failed: ${err.message}`,
        duration: Date.now() - start,
      };
    }
  }

  /**
   * Ask LLM to fix a bug.
   */
  async fixBug(error: string, code?: string, context?: string): Promise<ToolResult> {
    const start = Date.now();
    try {
      const systemPrompt = `You are an expert debugger. Analyze the error and provide a fix.

Error: ${error}
${code ? `\nCode:\n${code}` : ""}
${context ? `\nContext:\n${context}` : ""}

Provide:
1. Root cause analysis
2. The fix (complete code)
3. Explanation of what was wrong
4. How to prevent it in the future`;

      const response = await this.llm.prompt(systemPrompt, "Fix this bug");
      return {
        success: true,
        output: response.content,
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        output: "",
        error: `LLM bug fix failed: ${err.message}`,
        duration: Date.now() - start,
      };
    }
  }
}

// ─── Tool Registry ──────────────────────────────────────

export interface AgentTools {
  file: FileTools;
  terminal: TerminalTools;
  llm: LLMTools | null;
}

/**
 * Create a tools instance for an agent.
 */
export function createTools(
  workDir: string,
  llm?: any
): AgentTools {
  return {
    file: new FileTools(workDir),
    terminal: new TerminalTools(workDir),
    llm: llm ? new LLMTools(llm) : null,
  };
}

import { execSync } from 'node:child_process';

export class GitIntegration {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  private exec(command: string): string {
    try {
      const result = execSync(command, {
        cwd: this.cwd,
        encoding: 'utf-8',
        timeout: 30_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return result.trim();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Git command failed: ${command} — ${message}`);
    }
  }

  private execSafe(command: string): string {
    try {
      return this.exec(command);
    } catch {
      return '';
    }
  }

  async init(): Promise<string> {
    return this.exec('git init');
  }

  async status(): Promise<string> {
    return this.exec('git status --porcelain');
  }

  async addAll(): Promise<string> {
    return this.exec('git add -A');
  }

  async commit(message: string): Promise<string> {
    const escaped = message.replace(/"/g, '\\"');
    return this.exec(`git commit -m "${escaped}"`);
  }

  async createBranch(name: string): Promise<string> {
    const escaped = name.replace(/"/g, '\\"');
    return this.exec(`git branch "${escaped}"`);
  }

  async checkout(branch: string): Promise<string> {
    const escaped = branch.replace(/"/g, '\\"');
    return this.exec(`git checkout "${escaped}"`);
  }

  async push(remote: string = 'origin'): Promise<string> {
    return this.exec(`git push ${remote}`);
  }

  async pull(): Promise<string> {
    return this.exec('git pull');
  }

  async diff(): Promise<string> {
    return this.exec('git diff');
  }

  async log(n: number = 10): Promise<string> {
    return this.exec(`git log --oneline -n ${n}`);
  }

  async getRemotes(): Promise<string[]> {
    const output = this.execSafe('git remote -v');
    if (!output) return [];
    const remotes = new Set<string>();
    for (const line of output.split('\n')) {
      const name = line.split(/\s+/)[0];
      if (name) remotes.add(name);
    }
    return [...remotes];
  }
}

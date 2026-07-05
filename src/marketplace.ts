/**
 * BOWO Agent Marketplace
 *
 * Share, download, and install agent configurations.
 * Zero external dependencies — uses node:crypto for IDs and node:fs for persistence.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AgentConfig {
  systemPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string[];
  customInstructions?: string;
}

export interface AgentPackage {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: 'coding' | 'research' | 'creative' | 'devops' | 'security' | 'custom';
  tags: string[];
  config: AgentConfig;
  downloads: number;
  rating: number;
  createdAt: string;
  updatedAt: string;
  homepage?: string;
  license?: string;
}

export interface MarketplaceSearch {
  query?: string;
  category?: string;
  tags?: string[];
  sortBy?: 'downloads' | 'rating' | 'newest' | 'name';
  limit?: number;
  offset?: number;
}

export interface MarketplaceStats {
  totalPackages: number;
  totalDownloads: number;
  topCategories: Record<string, number>;
  topAuthors: Array<{ author: string; packages: number }>;
}

export interface PublishData {
  name: string;
  description: string;
  author: string;
  category: string;
  tags: string[];
  config: AgentConfig;
  version?: string;
  homepage?: string;
  license?: string;
}

// ─── Starter Packages ───────────────────────────────────────────────────────

function buildStarterPackages(): AgentPackage[] {
  const now = new Date().toISOString();

  const starters: Array<{
    id: string;
    name: string;
    description: string;
    author: string;
    category: AgentPackage['category'];
    tags: string[];
    downloads: number;
    rating: number;
    homepage?: string;
    license?: string;
    config: AgentConfig;
  }> = [
    {
      id: 'express-api',
      name: 'Express API Generator',
      description: 'Generates production-ready Express.js REST APIs with middleware, validation, error handling, and TypeScript support.',
      author: 'bowo-team',
      category: 'coding',
      tags: ['express', 'api', 'typescript', 'rest', 'node'],
      downloads: 1247,
      rating: 4.8,
      homepage: 'https://github.com/bowo/agents/express-api',
      license: 'MIT',
      config: {
        systemPrompt: `You are an Express.js API generator. When given a project description or requirements, you generate a complete, production-ready Express.js API. Follow these conventions:
- Use TypeScript for all files.
- Use async/await for all route handlers.
- Include input validation (Zod schemas).
- Include proper error handling middleware.
- Generate OpenAPI/Swagger documentation comments.
- Use environment variables for configuration.
- Follow RESTful conventions strictly.
- Include health-check and readiness endpoints.
- Generate a Dockerfile and docker-compose.yml.
- Include ESLint and Prettier config.`,
        model: 'claude-sonnet-4-20250514',
        temperature: 0.3,
        maxTokens: 4096,
        tools: ['file_system', 'terminal', 'http_client'],
        customInstructions: 'Always generate complete, runnable code. Never use placeholders or TODOs.',
      },
    },
    {
      id: 'react-app',
      name: 'React Application Generator',
      description: 'Generates React applications with modern tooling — Vite, TypeScript, Tailwind, and component architecture.',
      author: 'bowo-team',
      category: 'coding',
      tags: ['react', 'frontend', 'vite', 'typescript', 'tailwind'],
      downloads: 982,
      rating: 4.7,
      homepage: 'https://github.com/bowo/agents/react-app',
      license: 'MIT',
      config: {
        systemPrompt: `You are a React application generator. When given a project description, generate a complete React application. Follow these conventions:
- Use Vite as the build tool.
- Use TypeScript for all components and utilities.
- Use Tailwind CSS for styling.
- Use React Router for navigation.
- Generate component files with proper props typing.
- Use hooks for state management and side effects.
- Include proper error boundaries.
- Generate unit tests with Vitest and React Testing Library.
- Follow atomic design principles (atoms, molecules, organisms, pages).
- Include responsive layouts by default.`,
        model: 'claude-sonnet-4-20250514',
        temperature: 0.3,
        maxTokens: 4096,
        tools: ['file_system', 'terminal', 'browser'],
        customInstructions: 'Always generate complete, runnable code with proper imports and exports.',
      },
    },
    {
      id: 'docker-deploy',
      name: 'Docker Deployment Agent',
      description: 'Creates Dockerfiles, docker-compose configs, CI/CD pipelines, and deployment manifests for any application.',
      author: 'bowo-team',
      category: 'devops',
      tags: ['docker', 'deployment', 'ci-cd', 'kubernetes', 'compose'],
      downloads: 834,
      rating: 4.6,
      homepage: 'https://github.com/bowo/agents/docker-deploy',
      license: 'MIT',
      config: {
        systemPrompt: `You are a Docker deployment specialist. When given an application or codebase, you create complete Docker deployment configurations. You generate:
- Optimized multi-stage Dockerfiles (minimal final image).
- docker-compose.yml with all services, networks, and volumes.
- .dockerignore files.
- Health check configurations.
- Environment variable management (.env.example).
- GitHub Actions or GitLab CI/CD pipelines.
- Kubernetes manifests (Deployment, Service, Ingress) when requested.
- Helm charts for complex deployments.
Follow security best practices: non-root user, minimal base images, secret management.`,
        model: 'claude-sonnet-4-20250514',
        temperature: 0.2,
        maxTokens: 4096,
        tools: ['file_system', 'terminal'],
        customInstructions: 'Always use multi-stage builds. Never hardcode secrets in Dockerfiles.',
      },
    },
    {
      id: 'code-review',
      name: 'Code Review Agent',
      description: 'Performs thorough code reviews with actionable feedback on quality, security, performance, and best practices.',
      author: 'bowo-team',
      category: 'coding',
      tags: ['review', 'quality', 'best-practices', 'refactoring'],
      downloads: 1543,
      rating: 4.9,
      homepage: 'https://github.com/bowo/agents/code-review',
      license: 'MIT',
      config: {
        systemPrompt: `You are an expert code reviewer. Analyze code with attention to:
1. Correctness — logic errors, edge cases, off-by-one errors.
2. Security — injection, XSS, CSRF, auth flaws, secret leaks.
3. Performance — unnecessary allocations, N+1 queries, missing indexes.
4. Maintainability — naming, complexity, duplication, SRP violations.
5. Testing — coverage gaps, test quality, missing edge cases.
6. Style — language idioms, convention adherence, readability.
7. Documentation — missing or outdated comments, API docs.

For each issue found, provide:
- Severity: critical / warning / suggestion
- Location: file and line reference
- Explanation: what is wrong and why
- Fix: concrete code suggestion or direction
Group findings by severity. Be direct and specific — no generic advice.`,
        model: 'claude-sonnet-4-20250514',
        temperature: 0.2,
        maxTokens: 4096,
        tools: ['file_system', 'terminal', 'browser'],
        customInstructions: 'Focus on actionable feedback. Prioritize critical security and correctness issues.',
      },
    },
    {
      id: 'doc-writer',
      name: 'Documentation Writer',
      description: 'Generates comprehensive documentation — READMEs, API docs, architecture guides, and inline code comments.',
      author: 'bowo-team',
      category: 'creative',
      tags: ['documentation', 'readme', 'api-docs', 'technical-writing'],
      downloads: 671,
      rating: 4.5,
      homepage: 'https://github.com/bowo/agents/doc-writer',
      license: 'MIT',
      config: {
        systemPrompt: `You are a technical documentation writer. Generate clear, comprehensive documentation:
1. README.md — project overview, quickstart, installation, usage examples, configuration.
2. API documentation — endpoints, parameters, response schemas, error codes, examples.
3. Architecture guides — system overview, component diagrams, data flow, decisions.
4. Contributing guides — setup, conventions, PR process, code review.
5. Changelogs — organized by version, categorized changes.
6. Inline JSDoc/TSDoc comments for all public APIs.

Writing style: clear, concise, example-driven. Use markdown with proper formatting, code blocks, and tables. Always include practical examples.`,
        model: 'claude-sonnet-4-20250514',
        temperature: 0.4,
        maxTokens: 4096,
        tools: ['file_system', 'browser'],
        customInstructions: 'Always write in clear, accessible English. Include runnable code examples.',
      },
    },
    {
      id: 'test-writer',
      name: 'Test Writer Agent',
      description: 'Generates comprehensive test suites — unit, integration, and e2e tests with high coverage and meaningful assertions.',
      author: 'bowo-team',
      category: 'coding',
      tags: ['testing', 'unit-tests', 'integration', 'e2e', 'coverage'],
      downloads: 892,
      rating: 4.7,
      homepage: 'https://github.com/bowo/agents/test-writer',
      license: 'MIT',
      config: {
        systemPrompt: `You are a test engineering specialist. Generate comprehensive test suites:
1. Unit tests — test individual functions/methods in isolation with mocks.
2. Integration tests — test component interactions, API contracts, database operations.
3. End-to-end tests — test complete user workflows through the application.
4. Snapshot tests — for UI components and serialized outputs.
5. Property-based tests — for algorithms and data transformations.

Testing conventions:
- Use the project's existing test framework (detect or ask).
- Follow Arrange-Act-Assert pattern.
- Use descriptive test names that document behavior.
- Test both happy paths and error/edge cases.
- Aim for high meaningful coverage, not just line coverage.
- Include setup/teardown helpers for shared fixtures.
- Mock external dependencies (network, filesystem, time).`,
        model: 'claude-sonnet-4-20250514',
        temperature: 0.2,
        maxTokens: 4096,
        tools: ['file_system', 'terminal'],
        customInstructions: 'Detect and use the existing test framework. Never skip edge case coverage.',
      },
    },
    {
      id: 'security-audit',
      name: 'Security Audit Agent',
      description: 'Performs security audits with vulnerability analysis, OWASP compliance checks, and remediation guidance.',
      author: 'bowo-team',
      category: 'security',
      tags: ['security', 'audit', 'owasp', 'vulnerability', 'hardening'],
      downloads: 756,
      rating: 4.8,
      homepage: 'https://github.com/bowo/agents/security-audit',
      license: 'MIT',
      config: {
        systemPrompt: `You are a security audit specialist. Analyze code and configurations for vulnerabilities:
1. OWASP Top 10 — injection, broken auth, sensitive data exposure, XXE, broken access control, misconfig, XSS, insecure deserialization, vulnerable components, insufficient logging.
2. Secret management — hardcoded keys, tokens, passwords, connection strings.
3. Dependency audit — known CVEs, outdated packages, license compliance.
4. Authentication — session handling, token validation, MFA, password policies.
5. Authorization — RBAC/ABAC, privilege escalation, IDOR, path traversal.
6. Data protection — encryption at rest/transit, PII handling, data retention.
7. Infrastructure — exposed ports, default credentials, debug modes, CORS policy.

For each finding provide: severity (Critical/High/Medium/Low), CWE ID, description, affected location, and remediation with code examples.`,
        model: 'claude-sonnet-4-20250514',
        temperature: 0.1,
        maxTokens: 4096,
        tools: ['file_system', 'terminal', 'http_client'],
        customInstructions: 'Be thorough and conservative. Flag anything potentially suspicious.',
      },
    },
    {
      id: 'db-migration',
      name: 'Database Migration Agent',
      description: 'Generates database migration scripts, schema changes, and data transformations with rollback support.',
      author: 'bowo-team',
      category: 'devops',
      tags: ['database', 'migration', 'schema', 'sql', 'orm'],
      downloads: 534,
      rating: 4.4,
      homepage: 'https://github.com/bowo/agents/db-migration',
      license: 'MIT',
      config: {
        systemPrompt: `You are a database migration specialist. Generate safe, reversible migration scripts:
1. Schema migrations — CREATE/ALTER/DROP tables, columns, indexes, constraints.
2. Data migrations — insert, update, transform, merge, deduplicate.
3. Rollback scripts — every migration must include a down/reverse operation.
4. Seed data — reference data and development fixtures.
5. Performance — analyze query plans, suggest indexes, partition strategies.

Conventions:
- Use raw SQL when possible, ORMs only if project already uses one.
- Always wrap migrations in transactions.
- Support PostgreSQL, MySQL, SQLite, and MongoDB where applicable.
- Include explicit column types (no ambiguous types).
- Handle foreign key constraints properly.
- Generate migration files with sequential numbering.
- Include pre-migration backup instructions for data migrations.`,
        model: 'claude-sonnet-4-20250514',
        temperature: 0.2,
        maxTokens: 4096,
        tools: ['file_system', 'terminal'],
        customInstructions: 'Every migration MUST include a rollback. Never run destructive operations without confirmation.',
      },
    },
  ];

  return starters.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    author: s.author,
    version: '1.0.0',
    category: s.category,
    tags: s.tags,
    config: s.config,
    downloads: s.downloads,
    rating: s.rating,
    createdAt: now,
    updatedAt: now,
    homepage: s.homepage,
    license: s.license,
  }));
}

// ─── Marketplace ────────────────────────────────────────────────────────────

export class Marketplace {
  private packages: Map<string, AgentPackage> = new Map();
  private installed: Set<string> = new Set();
  private storagePath: string;

  constructor(storagePath?: string) {
    this.storagePath = storagePath ?? '~/.bowo/marketplace.json';
    this.loadData();
  }

  // ── Publish ──────────────────────────────────────────────────────────────

  publishPackage(data: PublishData): AgentPackage {
    const id = this.slugify(data.name);
    const now = new Date().toISOString();

    const existing = this.packages.get(id);

    const pkg: AgentPackage = {
      id,
      name: data.name,
      description: data.description,
      author: data.author,
      version: data.version ?? (existing ? this.bumpVersion(existing.version) : '1.0.0'),
      category: this.validateCategory(data.category),
      tags: data.tags.map((t) => t.toLowerCase().trim()),
      config: { ...data.config },
      downloads: existing?.downloads ?? 0,
      rating: existing?.rating ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      homepage: data.homepage,
      license: data.license,
    };

    this.packages.set(id, pkg);
    this.save();
    return { ...pkg, config: { ...pkg.config } };
  }

  // ── Uninstall ────────────────────────────────────────────────────────────

  uninstallPackage(id: string): boolean {
    if (!this.packages.has(id)) return false;
    this.installed.delete(id);
    this.save();
    return true;
  }

  // ── Get ──────────────────────────────────────────────────────────────────

  getPackage(id: string): AgentPackage | undefined {
    const pkg = this.packages.get(id);
    if (!pkg) return undefined;
    return { ...pkg, config: { ...pkg.config } };
  }

  // ── Search ───────────────────────────────────────────────────────────────

  searchPackages(query: MarketplaceSearch): AgentPackage[] {
    let results = Array.from(this.packages.values());

    // Filter by text query
    if (query.query) {
      const q = query.query.toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.author.toLowerCase().includes(q) ||
          p.tags.some((t) => t.includes(q))
      );
    }

    // Filter by category
    if (query.category) {
      const cat = query.category.toLowerCase();
      results = results.filter((p) => p.category === cat);
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      const lowerTags = query.tags.map((t) => t.toLowerCase());
      results = results.filter((p) => lowerTags.some((t) => p.tags.includes(t)));
    }

    // Sort
    const sortBy = query.sortBy ?? 'downloads';
    results.sort((a, b) => {
      switch (sortBy) {
        case 'downloads':
          return b.downloads - a.downloads;
        case 'rating':
          return b.rating - a.rating;
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

    // Paginate
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    results = results.slice(offset, offset + limit);

    return results.map((p) => ({ ...p, config: { ...p.config } }));
  }

  // ── List ─────────────────────────────────────────────────────────────────

  listPackages(options?: { category?: string; limit?: number; offset?: number }): AgentPackage[] {
    let results = Array.from(this.packages.values());

    if (options?.category) {
      results = results.filter((p) => p.category === options.category);
    }

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    results = results.slice(offset, offset + limit);

    return results.map((p) => ({ ...p, config: { ...p.config } }));
  }

  // ── Installed ────────────────────────────────────────────────────────────

  getInstalledPackages(): AgentPackage[] {
    return Array.from(this.installed)
      .map((id) => this.packages.get(id))
      .filter((p): p is AgentPackage => p !== undefined)
      .map((p) => ({ ...p, config: { ...p.config } }));
  }

  // ── Install ──────────────────────────────────────────────────────────────

  installPackage(id: string): boolean {
    const pkg = this.packages.get(id);
    if (!pkg) return false;
    pkg.downloads += 1;
    this.installed.add(id);
    this.save();
    return true;
  }

  // ── Rate ─────────────────────────────────────────────────────────────────

  ratePackage(id: string, rating: number): void {
    const pkg = this.packages.get(id);
    if (!pkg) return;
    const clamped = Math.max(1, Math.min(5, Math.round(rating * 10) / 10));
    // Weighted average: blend new rating with existing
    pkg.rating = Math.round(((pkg.rating + clamped) / 2) * 100) / 100;
    this.save();
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  getStats(): MarketplaceStats {
    const allPkgs = Array.from(this.packages.values());

    const totalDownloads = allPkgs.reduce((sum, p) => sum + p.downloads, 0);

    const topCategories: Record<string, number> = {};
    for (const p of allPkgs) {
      topCategories[p.category] = (topCategories[p.category] ?? 0) + 1;
    }

    const authorCounts = new Map<string, number>();
    for (const p of allPkgs) {
      authorCounts.set(p.author, (authorCounts.get(p.author) ?? 0) + 1);
    }
    const topAuthors = Array.from(authorCounts.entries())
      .map(([author, packages]) => ({ author, packages }))
      .sort((a, b) => b.packages - a.packages)
      .slice(0, 10);

    return {
      totalPackages: allPkgs.length,
      totalDownloads,
      topCategories,
      topAuthors,
    };
  }

  // ── Export / Import ──────────────────────────────────────────────────────

  exportPackage(id: string): string {
    const pkg = this.packages.get(id);
    if (!pkg) throw new Error(`Package not found: ${id}`);
    return JSON.stringify({ ...pkg, config: { ...pkg.config } }, null, 2);
  }

  importPackage(json: string): AgentPackage {
    const data = JSON.parse(json) as AgentPackage;

    // Validate required fields
    if (!data.id || !data.name || !data.author || !data.config?.systemPrompt) {
      throw new Error('Invalid package: missing required fields (id, name, author, config.systemPrompt)');
    }

    // Validate category
    data.category = this.validateCategory(data.category);

    // Regenerate ID to avoid collisions if name differs
    const id = this.slugify(data.name);
    data.id = id;
    data.updatedAt = new Date().toISOString();

    this.packages.set(id, data);
    this.save();
    return { ...data, config: { ...data.config } };
  }

  // ── Categories & Tags ────────────────────────────────────────────────────

  getCategories(): string[] {
    return Array.from(new Set(Array.from(this.packages.values()).map((p) => p.category))).sort();
  }

  getTags(): string[] {
    const tags = new Set<string>();
    for (const p of Array.from(this.packages.values())) {
      for (const t of p.tags) {
        tags.add(t);
      }
    }
    return Array.from(tags).sort();
  }

  getTopPackages(limit?: number): AgentPackage[] {
    const all = Array.from(this.packages.values());
    all.sort((a, b) => b.downloads - a.downloads);
    return all.slice(0, limit ?? 10).map((p) => ({ ...p, config: { ...p.config } }));
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private validateCategory(category: string): AgentPackage['category'] {
    const valid: AgentPackage['category'][] = ['coding', 'research', 'creative', 'devops', 'security', 'custom'];
    const lower = category.toLowerCase() as AgentPackage['category'];
    return valid.includes(lower) ? lower : 'custom';
  }

  private bumpVersion(version: string): string {
    const parts = version.split('.');
    if (parts.length !== 3) return '1.0.1';
    const [major, minor, patch] = parts.map(Number);
    return `${major}.${minor}.${(patch ?? 0) + 1}`;
  }

  private save(): void {
    try {
      const dir = dirname(this.storagePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const data = {
        packages: Array.from(this.packages.entries()),
        installed: Array.from(this.installed),
        savedAt: new Date().toISOString(),
      };
      writeFileSync(this.storagePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Silently fail on write errors — non-fatal
    }
  }

  private loadData(): void {
    // Always start with starter packages
    const starters = buildStarterPackages();
    for (const s of starters) {
      this.packages.set(s.id, s);
    }

    // Try to load persisted data and merge
    try {
      if (existsSync(this.storagePath)) {
        const raw = readFileSync(this.storagePath, 'utf-8');
        const data = JSON.parse(raw);

        if (Array.isArray(data.packages)) {
          for (const [id, pkg] of data.packages) {
            // User packages override starters if they exist
            this.packages.set(id, pkg);
          }
        }

        if (Array.isArray(data.installed)) {
          for (const id of data.installed) {
            this.installed.add(id);
          }
        }
      }
    } catch {
      // Corrupt or missing file — use starters only
    }
  }
}

// ─── Default instance ───────────────────────────────────────────────────────

export const marketplace = new Marketplace();

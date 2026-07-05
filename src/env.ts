/**
 * BOWO Agent — Environment Validation
 * Validates required environment variables for LLM providers, Hermes CLI, etc.
 */

/** Describes a single required env var entry. */
export interface EnvVarDef {
  /** Environment variable name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Whether this var is mandatory (true) or optional (false) */
  required: boolean;
  /** If set, only valid when the var matches one of these values */
  allowedValues?: string[];
  /** Regex the value must match */
  pattern?: RegExp;
}

/** Validation result for a single variable. */
export interface EnvCheckResult {
  name: string;
  description: string;
  required: boolean;
  present: boolean;
  valid: boolean;
  error?: string;
  warning?: string;
}

/**
 * Default environment variable definitions for the BOWO agent system.
 */
const DEFAULT_ENV_VARS: EnvVarDef[] = [
  // ── LLM Provider Keys ──────────────────────────────────────────────
  {
    name: "OPENAI_API_KEY",
    description: "OpenAI API key for GPT models",
    required: false,
    pattern: /^sk-/,
  },
  {
    name: "ANTHROPIC_API_KEY",
    description: "Anthropic API key for Claude models",
    required: false,
    pattern: /^sk-ant-/,
  },
  {
    name: "GROQ_API_KEY",
    description: "Groq API key for fast inference",
    required: false,
    pattern: /^gsk_/,
  },
  {
    name: "GOOGLE_API_KEY",
    description: "Google Gemini / PaLM API key",
    required: false,
  },
  {
    name: "MISTRAL_API_KEY",
    description: "Mistral AI API key",
    required: false,
  },
  // ── Hermes Configuration ────────────────────────────────────────────
  {
    name: "HERMES_PATH",
    description: "Path to the hermes CLI binary",
    required: false,
    pattern: /\S/,
  },
  {
    name: "HERMES_PROFILE",
    description: "Hermes profile to use (default: default)",
    required: false,
  },
  // ── Application Settings ────────────────────────────────────────────
  {
    name: "BOWO_PORT",
    description: "Port the BOWO agent listens on",
    required: false,
    pattern: /^\d+$/,
  },
  {
    name: "BOWO_LOG_LEVEL",
    description: "Log level: debug, info, warn, error",
    required: false,
    allowedValues: ["debug", "info", "warn", "error"],
  },
  {
    name: "BOWO_OUTPUT_DIR",
    description: "Directory for BOWO output files",
    required: false,
  },
  {
    name: "BOWO_CONFIG_DIR",
    description: "Directory for BOWO configuration files",
    required: false,
  },
];

/**
 * Provider detection — maps env-var patterns to provider names.
 */
const PROVIDER_MAP: Array<{ envVar: string; provider: string }> = [
  { envVar: "OPENAI_API_KEY", provider: "openai" },
  { envVar: "ANTHROPIC_API_KEY", provider: "anthropic" },
  { envVar: "GROQ_API_KEY", provider: "groq" },
  { envVar: "GOOGLE_API_KEY", provider: "google" },
  { envVar: "MISTRAL_API_KEY", provider: "mistral" },
];

// ────────────────────────────────────────────────────────────────────────

export class EnvValidator {
  private envVars: EnvVarDef[];
  private results: EnvCheckResult[] = [];
  private validated = false;

  /**
   * @param overrides  Optional additional / replacement env-var definitions.
   *                  Merged with the defaults; duplicate names replace the default entry.
   */
  constructor(overrides?: EnvVarDef[]) {
    const merged = new Map<string, EnvVarDef>(
      DEFAULT_ENV_VARS.map((v) => [v.name, v]),
    );
    if (overrides) {
      for (const v of overrides) {
        merged.set(v.name, v);
      }
    }
    this.envVars = Array.from(merged.values());
  }

  // ── Core ─────────────────────────────────────────────────────────────

  /**
   * Validate every configured env-var definition against `process.env`.
   * Must be called before getErrors / getWarnings / getValidProviders / isReady.
   * Returns the full result list for convenience.
   */
  validate(): EnvCheckResult[] {
    this.results = this.envVars.map((def) => {
      const value = process.env[def.name];
      const present = value !== undefined && value.length > 0;

      if (!present) {
        return {
          ...def,
          present: false,
          valid: false,
          error: def.required
            ? `Required environment variable "${def.name}" is not set`
            : undefined,
          warning: def.required
            ? undefined
            : `Optional environment variable "${def.name}" is not set — ${def.description.toLowerCase()}`,
        };
      }

      // allowed-values check
      if (def.allowedValues && !def.allowedValues.includes(value!)) {
        return {
          ...def,
          present: true,
          valid: false,
          error: `"${def.name}" value "${value}" is not in allowed values: [${def.allowedValues.join(", ")}]`,
        };
      }

      // pattern check
      if (def.pattern && !def.pattern.test(value!)) {
        return {
          ...def,
          present: true,
          valid: false,
          error: `"${def.name}" value does not match expected pattern`,
        };
      }

      return { ...def, present: true, valid: true };
    });

    this.validated = true;
    return this.results;
  }

  // ── Queries ──────────────────────────────────────────────────────────

  /** All validation errors (missing required vars, bad values, etc.). */
  getErrors(): string[] {
    this.ensureValidated();
    return this.results
      .filter((r) => r.error)
      .map((r) => r.error!);
  }

  /** All warnings (missing optional vars that might limit functionality). */
  getWarnings(): string[] {
    this.ensureValidated();
    return this.results
      .filter((r) => r.warning)
      .map((r) => r.warning!);
  }

  /** Names of providers whose API keys are present and valid. */
  getValidProviders(): string[] {
    this.ensureValidated();
    const valid = new Set(
      this.results.filter((r) => r.valid && r.present).map((r) => r.name),
    );
    return PROVIDER_MAP
      .filter((p) => valid.has(p.envVar))
      .map((p) => p.provider);
  }

  /**
   * Whether the system is ready to run — no errors from required vars.
   * Optional missing vars produce warnings, not errors.
   */
  isReady(): boolean {
    this.ensureValidated();
    return this.results.every((r) => r.error === undefined);
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  /** Pretty-print the validation summary. */
  summary(): string {
    this.ensureValidated();
    const lines: string[] = ["═══ BOWO Environment Validation ═══", ""];

    for (const r of this.results) {
      const icon = !r.present && r.required ? "✗" : !r.present ? "○" : r.valid ? "✓" : "✗";
      const status = !r.present && r.required ? "MISSING (required)" : !r.present ? "not set (optional)" : r.valid ? "OK" : "INVALID";
      lines.push(`  ${icon} ${r.name.padEnd(25)} ${status}`);
      if (r.error) lines.push(`    ⚠  ${r.error}`);
      if (r.warning) lines.push(`    ⚠  ${r.warning}`);
    }

    lines.push("");
    lines.push(`  Providers: ${this.getValidProviders().join(", ") || "(none detected)"}`);
    lines.push(`  Ready: ${this.isReady() ? "YES" : "NO"}`);
    lines.push("══════════════════════════════════════");
    return lines.join("\n");
  }

  private ensureValidated(): void {
    if (!this.validated) {
      throw new Error("EnvValidator: call validate() before querying results");
    }
  }
}

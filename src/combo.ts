/**
 * BOWO Combo/Fallback System
 *
 * Defines model chains with configurable fallback strategies.
 * Inspired by 9Router's combo feature: if the primary model fails,
 * it tries the next, and so on.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ComboStrategy =
  | 'fallback'
  | 'round-robin'
  | 'least-latency'
  | 'cost-optimized'
  | 'random';

export interface ModelEntry {
  /** Unique internal id (auto-generated) */
  id: string;
  /** Provider name (e.g. 'openai', 'anthropic', 'qwencloud') */
  provider: string;
  /** Model identifier (e.g. 'gpt-4o', 'claude-sonnet-4-20250514') */
  model: string;
  /** Base URL override for this provider/model */
  baseUrl?: string;
  /** API key override for this provider/model */
  apiKey?: string;
  /** Priority order (lower = tried first). Used by 'fallback' strategy. */
  priority: number;
  /** Max retries per invocation (default set by addModel) */
  maxRetries: number;
  /** Request timeout in ms (default set by addModel) */
  timeout: number;
  /** Weight for round-robin / weighted random selection */
  weight: number;
  /** Cost per 1M tokens (input) — used by cost-optimized strategy */
  costPer1MInput?: number;
  /** Cost per 1M tokens (output) — used by cost-optimized strategy */
  costPer1MOutput?: number;
}

export interface ComboResult {
  /** The model entry that succeeded */
  model: ModelEntry;
  /** The response text */
  response: string;
  /** Wall-clock latency in milliseconds */
  latencyMs: number;
  /** Estimated token count consumed */
  tokens: number;
  /** Estimated cost in USD */
  cost: number;
  /** Which attempt (1-based) succeeded */
  attempt: number;
  /** Provider:model labels for any models that were tried and failed */
  fallbacks: string[];
}

export interface ComboStats {
  totalAttempts: number;
  successByModel: Map<string, number>;
  avgLatencyByModel: Map<string, number>;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function modelKey(provider: string, model: string): string {
  return `${provider}/${model}`;
}

function sortByPriority(entries: ModelEntry[]): ModelEntry[] {
  return [...entries].sort((a, b) => a.priority - b.priority);
}

function sortByCost(entries: ModelEntry[]): ModelEntry[] {
  return [...entries].sort((a, b) => {
    const costA = (a.costPer1MInput ?? 10) + (a.costPer1MOutput ?? 10);
    const costB = (b.costPer1MInput ?? 10) + (b.costPer1MOutput ?? 10);
    return costA - costB;
  });
}

function sortByLatency(entries: ModelEntry[], stats: ComboStats): ModelEntry[] {
  return [...entries].sort((a, b) => {
    const keyA = modelKey(a.provider, a.model);
    const keyB = modelKey(b.provider, b.model);
    const latA = stats.avgLatencyByModel.get(keyA) ?? Infinity;
    const latB = stats.avgLatencyByModel.get(keyB) ?? Infinity;
    return latA - latB;
  });
}

function weightedRandomPick(entries: ModelEntry[]): ModelEntry {
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  let r = Math.random() * totalWeight;
  for (const entry of entries) {
    r -= entry.weight;
    if (r <= 0) return entry;
  }
  return entries[entries.length - 1];
}

// ─── ModelCombo ──────────────────────────────────────────────────────────────

export class ModelCombo {
  readonly name: string;
  private strategy: ComboStrategy;
  private models: ModelEntry[] = [];
  private roundRobinIndex = 0;

  // Stats tracking
  private stats: ComboStats = {
    totalAttempts: 0,
    successByModel: new Map(),
    avgLatencyByModel: new Map(),
  };

  // Latency accumulator: modelKey -> { total, count }
  private latencyAccum: Map<string, { total: number; count: number }> = new Map();

  // Failed model cooldowns: modelKey -> expiry timestamp
  private cooldowns: Map<string, number> = new Map();

  constructor(name: string, strategy: ComboStrategy = 'fallback') {
    this.name = name;
    this.strategy = strategy;
  }

  /** Add a model to this combo chain. Fills in defaults for maxRetries/timeout/weight. */
  addModel(
    entry: Omit<ModelEntry, 'maxRetries' | 'timeout' | 'weight' | 'id'> & Partial<Pick<ModelEntry, 'maxRetries' | 'timeout' | 'weight'>>,
  ): void {
    const modelEntry: ModelEntry = {
      id: crypto.randomUUID(),
      provider: entry.provider,
      model: entry.model,
      baseUrl: entry.baseUrl,
      apiKey: entry.apiKey,
      priority: entry.priority ?? this.models.length,
      maxRetries: entry.maxRetries ?? 2,
      timeout: entry.timeout ?? 30_000,
      weight: entry.weight ?? 1,
      costPer1MInput: entry.costPer1MInput,
      costPer1MOutput: entry.costPer1MOutput,
    };
    this.models.push(modelEntry);
  }

  /** Remove a model by provider+model key. */
  removeModel(provider: string, model: string): void {
    this.models = this.models.filter(
      (m) => !(m.provider === provider && m.model === model),
    );
  }

  /** Get the ordered model list based on the current strategy. */
  getModelChain(): ModelEntry[] {
    return this.resolveOrder();
  }

  /** Get stats for this combo. */
  getStats(): ComboStats {
    return {
      totalAttempts: this.stats.totalAttempts,
      successByModel: new Map(this.stats.successByModel),
      avgLatencyByModel: new Map(this.stats.avgLatencyByModel),
    };
  }

  /** Reset all accumulated stats. */
  reset(): void {
    this.stats = {
      totalAttempts: 0,
      successByModel: new Map(),
      avgLatencyByModel: new Map(),
    };
    this.latencyAccum = new Map();
    this.cooldowns = new Map();
    this.roundRobinIndex = 0;
  }

  /**
   * Execute a prompt against the model chain with fallback.
   *
   * The actual LLM call is delegated to an internal `_callModel` method
   * which subclasses or test harnesses can override.
   */
  async execute(
    prompt: string,
    options?: { preferredProvider?: string; maxTokens?: number },
  ): Promise<ComboResult> {
    const order = this.resolveOrder(options?.preferredProvider);
    if (order.length === 0) {
      throw new Error(`Combo "${this.name}": no models configured`);
    }

    const fallbacks: string[] = [];
    let lastError: Error | undefined;

    for (let i = 0; i < order.length; i++) {
      const entry = order[i];

      // Check cooldown — skip models that recently failed
      const cooldownExpiry = this.cooldowns.get(modelKey(entry.provider, entry.model));
      if (cooldownExpiry && Date.now() < cooldownExpiry) {
        fallbacks.push(`${entry.provider}/${entry.model} [cooldown]`);
        continue;
      }

      const key = modelKey(entry.provider, entry.model);
      let attempt = 0;

      while (attempt <= entry.maxRetries) {
        this.stats.totalAttempts++;
        attempt++;

        const start = Date.now();
        try {
          const response = await this.callModel(prompt, entry, options?.maxTokens);
          const latencyMs = Date.now() - start;

          // Record success
          this.recordSuccess(key, latencyMs);

          // Parse token estimate from response metadata if available
          const tokens = response.tokens ?? this.estimateTokens(prompt, response.text);
          const cost = this.estimateCost(entry, response.text);

          return {
            model: entry,
            response: response.text,
            latencyMs,
            tokens,
            cost,
            attempt,
            fallbacks,
          };
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          // Record failure for stats (negative latency sentinel)
          if (attempt > entry.maxRetries) {
            // Model exhausted retries — put on cooldown
            this.cooldowns.set(key, Date.now() + 60_000);
          }
          // If not last retry of this model, wait before retrying
          if (attempt <= entry.maxRetries) {
            await this.delay(Math.min(1000 * attempt, 5000));
          }
        }
      }

      // All retries exhausted for this model — record fallback
      fallbacks.push(`${entry.provider}/${entry.model}`);
    }

    throw new Error(
      `Combo "${this.name}": all ${order.length} models failed. ` +
        `Last error: ${lastError?.message ?? 'unknown'}. ` +
        `Tried: [${fallbacks.join(', ')}]`,
    );
  }

  // ─── Strategy resolution ────────────────────────────────────────────────

  private resolveOrder(preferredProvider?: string): ModelEntry[] {
    const available = [...this.models];
    if (available.length === 0) return [];

    // If a preferred provider is set, boost the first model from that provider
    let ordered: ModelEntry[];

    switch (this.strategy) {
      case 'fallback':
        ordered = sortByPriority(available);
        break;

      case 'round-robin': {
        // Stable sort by priority, then rotate
        ordered = sortByPriority(available);
        const idx = this.roundRobinIndex % ordered.length;
        this.roundRobinIndex++;
        ordered = [...ordered.slice(idx), ...ordered.slice(0, idx)];
        break;
      }

      case 'least-latency':
        ordered = sortByLatency(available, this.stats);
        break;

      case 'cost-optimized':
        ordered = sortByCost(available);
        break;

      case 'random':
        ordered = this.shuffleWeighted(available);
        break;

      default:
        ordered = sortByPriority(available);
    }

    // If preferred provider is set, move its model(s) to front
    if (preferredProvider) {
      const preferred = ordered.filter((m) => m.provider === preferredProvider);
      const rest = ordered.filter((m) => m.provider !== preferredProvider);
      ordered = [...preferred, ...rest];
    }

    return ordered;
  }

  private shuffleWeighted(entries: ModelEntry[]): ModelEntry[] {
    // Weighted random shuffle — return all entries in random weighted order
    const pool = [...entries];
    const result: ModelEntry[] = [];
    while (pool.length > 0) {
      const pick = weightedRandomPick(pool);
      result.push(pick);
      pool.splice(pool.indexOf(pick), 1);
    }
    return result;
  }

  // ─── LLM call (overrideable) ────────────────────────────────────────────

  /**
   * Internal LLM call. Returns { text, tokens? }.
   * Override this method or monkey-patch for testing/custom providers.
   */
  protected async callModel(
    prompt: string,
    entry: ModelEntry,
    maxTokens?: number,
  ): Promise<{ text: string; tokens?: number }> {
    // Default: simple HTTP call to an OpenAI-compatible endpoint
    const baseUrl = entry.baseUrl ?? 'https://api.openai.com/v1';
    const apiKey = entry.apiKey ?? process.env.OPENAI_API_KEY ?? '';

    const body: Record<string, unknown> = {
      model: entry.model,
      messages: [{ role: 'user', content: prompt }],
    };
    if (maxTokens) {
      body.max_tokens = maxTokens;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), entry.timeout);

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => 'no body');
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };

      const content = data.choices?.[0]?.message?.content ?? '';
      const tokens = data.usage?.total_tokens;

      return { text: content, tokens };
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── Stats / Cost helpers ───────────────────────────────────────────────

  private recordSuccess(key: string, latencyMs: number): void {
    this.stats.successByModel.set(
      key,
      (this.stats.successByModel.get(key) ?? 0) + 1,
    );

    const acc = this.latencyAccum.get(key) ?? { total: 0, count: 0 };
    acc.total += latencyMs;
    acc.count += 1;
    this.latencyAccum.set(key, acc);
    this.stats.avgLatencyByModel.set(key, Math.round(acc.total / acc.count));
  }

  private estimateTokens(prompt: string, response: string): number {
    // Rough heuristic: ~4 chars per token for English
    return Math.ceil((prompt.length + response.length) / 4);
  }

  private estimateCost(entry: ModelEntry, responseText: string): number {
    const inputCost = entry.costPer1MInput ?? 0;
    const outputCost = entry.costPer1MOutput ?? 0;
    const outputTokens = Math.ceil(responseText.length / 4);
    // Assume input is roughly equal to output for cost estimation
    return (
      ((inputCost + outputCost) / 1_000_000) * outputTokens
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ─── Built-in Model Curations ────────────────────────────────────────────────

interface CuratedModel {
  provider: string;
  model: string;
  baseUrl?: string;
  priority: number;
  costPer1MInput: number;
  costPer1MOutput: number;
}

export const CURATIONS: Record<string, CuratedModel[]> = {
  // ─── QwenCloud (via Router9) ──────────────────────
  qwencloud: [
    { provider: 'qwencloud', model: 'qwen3.7-max', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', priority: 1, costPer1MInput: 0.20, costPer1MOutput: 0.60 },
    { provider: 'qwencloud', model: 'qwen3.7-plus', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', priority: 2, costPer1MInput: 0.16, costPer1MOutput: 0.48 },
    { provider: 'qwencloud', model: 'qwen3-coder-next', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', priority: 3, costPer1MInput: 0.08, costPer1MOutput: 0.24 },
    { provider: 'qwencloud', model: 'qwen3-coder-plus', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', priority: 4, costPer1MInput: 0.06, costPer1MOutput: 0.18 },
    { provider: 'qwencloud', model: 'kimi-k2.7-code', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', priority: 5, costPer1MInput: 0.08, costPer1MOutput: 0.24 },
    { provider: 'qwencloud', model: 'deepseek-v4-pro', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', priority: 6, costPer1MInput: 0.14, costPer1MOutput: 0.28 },
    { provider: 'qwencloud', model: 'deepseek-v4-flash', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', priority: 7, costPer1MInput: 0.02, costPer1MOutput: 0.06 },
    { provider: 'qwencloud', model: 'qwq-plus', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', priority: 8, costPer1MInput: 0.06, costPer1MOutput: 0.18 },
    { provider: 'qwencloud', model: 'qwen3.6-plus', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', priority: 9, costPer1MInput: 0.12, costPer1MOutput: 0.36 },
    { provider: 'qwencloud', model: 'glm-5.2', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', priority: 10, costPer1MInput: 0.10, costPer1MOutput: 0.30 },
  ],

  // ─── MiMo (via Router9) ──────────────────────────
  mimo: [
    { provider: 'mimo', model: 'mimo-v2.5-pro', baseUrl: 'https://api.mimo.xiaomi.com/v1', priority: 1, costPer1MInput: 0.00, costPer1MOutput: 0.00 },
    { provider: 'mimo', model: 'mimo-v2.5', baseUrl: 'https://api.mimo.xiaomi.com/v1', priority: 2, costPer1MInput: 0.00, costPer1MOutput: 0.00 },
    { provider: 'mimo', model: 'mimo-v2-flash', baseUrl: 'https://api.mimo.xiaomi.com/v1', priority: 3, costPer1MInput: 0.00, costPer1MOutput: 0.00 },
    { provider: 'mimo', model: 'mimo-v2-omni', baseUrl: 'https://api.mimo.xiaomi.com/v1', priority: 4, costPer1MInput: 0.00, costPer1MOutput: 0.00 },
  ],

  // ─── CX / GPT (via Router9) ──────────────────────
  cx: [
    { provider: 'cx', model: 'gpt-5.5', baseUrl: 'https://router9.aleca.my.id/v1', priority: 1, costPer1MInput: 2.50, costPer1MOutput: 10.00 },
    { provider: 'cx', model: 'gpt-5.4', baseUrl: 'https://router9.aleca.my.id/v1', priority: 2, costPer1MInput: 2.00, costPer1MOutput: 8.00 },
    { provider: 'cx', model: 'gpt-5.4-mini', baseUrl: 'https://router9.aleca.my.id/v1', priority: 3, costPer1MInput: 0.15, costPer1MOutput: 0.60 },
    { provider: 'cx', model: 'gpt-5.3-codex-xhigh', baseUrl: 'https://router9.aleca.my.id/v1', priority: 4, costPer1MInput: 1.50, costPer1MOutput: 6.00 },
    { provider: 'cx', model: 'gpt-5.5-review', baseUrl: 'https://router9.aleca.my.id/v1', priority: 5, costPer1MInput: 2.50, costPer1MOutput: 10.00 },
  ],

  // ─── AgentRouter / Claude (via Router9) ───────────
  agentrouter: [
    { provider: 'agentrouter', model: 'claude-opus-4-8', baseUrl: 'https://agentrouter.org/v1', priority: 1, costPer1MInput: 15.00, costPer1MOutput: 75.00 },
    { provider: 'agentrouter', model: 'claude-opus-4-7', baseUrl: 'https://agentrouter.org/v1', priority: 2, costPer1MInput: 15.00, costPer1MOutput: 75.00 },
    { provider: 'agentrouter', model: 'claude-opus-4-6', baseUrl: 'https://agentrouter.org/v1', priority: 3, costPer1MInput: 15.00, costPer1MOutput: 75.00 },
    { provider: 'agentrouter', model: 'glm-5.2', baseUrl: 'https://agentrouter.org/v1', priority: 4, costPer1MInput: 0.10, costPer1MOutput: 0.30 },
  ],

  // ─── DeepSeek (Direct API) ────────────────────────
  deepseek: [
    { provider: 'deepseek', model: 'deepseek-v4-pro', baseUrl: 'https://api.deepseek.com/v1', priority: 1, costPer1MInput: 0.14, costPer1MOutput: 0.28 },
    { provider: 'deepseek', model: 'deepseek-v4-flash', baseUrl: 'https://api.deepseek.com/v1', priority: 2, costPer1MInput: 0.02, costPer1MOutput: 0.06 },
    { provider: 'deepseek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', priority: 3, costPer1MInput: 0.14, costPer1MOutput: 0.28 },
    { provider: 'deepseek', model: 'deepseek-reasoner', baseUrl: 'https://api.deepseek.com/v1', priority: 4, costPer1MInput: 0.55, costPer1MOutput: 2.19 },
  ],

  // ─── OpenAI (Direct API) ──────────────────────────
  openai: [
    { provider: 'openai', model: 'gpt-5.5', baseUrl: 'https://api.openai.com/v1', priority: 1, costPer1MInput: 2.50, costPer1MOutput: 10.00 },
    { provider: 'openai', model: 'gpt-5.4', baseUrl: 'https://api.openai.com/v1', priority: 2, costPer1MInput: 2.00, costPer1MOutput: 8.00 },
    { provider: 'openai', model: 'gpt-5.4-mini', baseUrl: 'https://api.openai.com/v1', priority: 3, costPer1MInput: 0.15, costPer1MOutput: 0.60 },
    { provider: 'openai', model: 'o3', baseUrl: 'https://api.openai.com/v1', priority: 4, costPer1MInput: 1.10, costPer1MOutput: 4.40 },
    { provider: 'openai', model: 'o4-mini', baseUrl: 'https://api.openai.com/v1', priority: 5, costPer1MInput: 0.50, costPer1MOutput: 2.00 },
  ],

  // ─── Anthropic (Direct API) ───────────────────────
  anthropic: [
    { provider: 'anthropic', model: 'claude-opus-4-20250514', baseUrl: 'https://api.anthropic.com/v1', priority: 1, costPer1MInput: 15.00, costPer1MOutput: 75.00 },
    { provider: 'anthropic', model: 'claude-sonnet-4-20250514', baseUrl: 'https://api.anthropic.com/v1', priority: 2, costPer1MInput: 3.00, costPer1MOutput: 15.00 },
    { provider: 'anthropic', model: 'claude-3-5-haiku-20241022', baseUrl: 'https://api.anthropic.com/v1', priority: 3, costPer1MInput: 0.80, costPer1MOutput: 4.00 },
  ],

  // ─── Router9 Combo (hermes-auto) ──────────────────
  'router9-hermes': [
    { provider: 'mimo', model: 'mimo-v2.5-pro', baseUrl: 'https://router9.aleca.my.id/v1', priority: 1, costPer1MInput: 0.00, costPer1MOutput: 0.00 },
    { provider: 'cx', model: 'gpt-5.4-mini', baseUrl: 'https://router9.aleca.my.id/v1', priority: 2, costPer1MInput: 0.15, costPer1MOutput: 0.60 },
    { provider: 'mimo', model: 'mimo-v2-flash', baseUrl: 'https://router9.aleca.my.id/v1', priority: 3, costPer1MInput: 0.00, costPer1MOutput: 0.00 },
    { provider: 'qwencloud', model: 'qwen3.7-plus', baseUrl: 'https://router9.aleca.my.id/v1', priority: 4, costPer1MInput: 0.16, costPer1MOutput: 0.48 },
    { provider: 'cx', model: 'gpt-5.5', baseUrl: 'https://router9.aleca.my.id/v1', priority: 5, costPer1MInput: 2.50, costPer1MOutput: 10.00 },
    { provider: 'agentrouter', model: 'claude-opus-4-8', baseUrl: 'https://router9.aleca.my.id/v1', priority: 6, costPer1MInput: 15.00, costPer1MOutput: 75.00 },
  ],
};

/**
 * Create a pre-populated ModelCombo from a built-in curation.
 *
 * @param name    Combo name
 * @param provider  Key in CURATIONS (e.g. 'deepseek')
 * @param strategy  Fallback strategy (default: 'fallback')
 */
export function createCuratedCombo(
  name: string,
  provider: string,
  strategy: ComboStrategy = 'fallback',
): ModelCombo {
  const curated = CURATIONS[provider];
  if (!curated) {
    throw new Error(
      `Unknown curated provider "${provider}". Available: ${Object.keys(CURATIONS).join(', ')}`,
    );
  }

  const combo = new ModelCombo(name, strategy);
  for (const m of curated) {
    combo.addModel({
      provider: m.provider,
      model: m.model,
      baseUrl: m.baseUrl,
      priority: m.priority,
      costPer1MInput: m.costPer1MInput,
      costPer1MOutput: m.costPer1MOutput,
    });
  }
  return combo;
}

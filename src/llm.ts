/**
 * 🧠 BOWO LLM — Multi-Provider LLM Integration Layer
 *
 * Support multiple LLM providers with easy registration.
 * Built-in: OpenAI, OpenRouter, Anthropic, DeepSeek, Groq, Ollama
 * Custom: Register your own provider in seconds.
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources";

// ─── Types ──────────────────────────────────────────────

export interface LLMConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokens: { prompt: number; completion: number; total: number };
  finishReason: string;
}

export interface ProviderDefinition {
  name: string;
  displayName: string;
  baseUrl: string;
  apiKeyEnv: string;
  defaultModel: string;
  models: string[];
}

// ─── Built-in Provider Registry ─────────────────────────

const BUILTIN_PROVIDERS: Record<string, ProviderDefinition> = {
  openai: {
    name: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1", "o1-mini", "o3-mini"],
  },
  openrouter: {
    name: "openrouter",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    defaultModel: "anthropic/claude-3-haiku",
    models: [
      "anthropic/claude-3-haiku", "anthropic/claude-3-sonnet", "anthropic/claude-3-opus",
      "openai/gpt-4o", "openai/gpt-4o-mini",
      "google/gemini-pro-1.5", "google/gemini-flash-1.5",
      "deepseek/deepseek-chat", "meta-llama/llama-3.1-8b-instruct",
      "mistralai/mistral-7b-instruct",
    ],
  },
  anthropic: {
    name: "anthropic",
    displayName: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    defaultModel: "claude-3-haiku-20240307",
    models: ["claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307", "claude-3.5-sonnet-20241022"],
  },
  deepseek: {
    name: "deepseek",
    displayName: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
  },
  groq: {
    name: "groq",
    displayName: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
    defaultModel: "llama-3.1-8b-instant",
    models: ["llama-3.1-8b-instant", "llama-3.1-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"],
  },
  ollama: {
    name: "ollama",
    displayName: "Ollama (Local)",
    baseUrl: "http://localhost:11434/v1",
    apiKeyEnv: "",
    defaultModel: "llama3.1",
    models: ["llama3.1", "codellama", "mistral", "phi3", "gemma2"],
  },
  lmstudio: {
    name: "lmstudio",
    displayName: "LM Studio (Local)",
    baseUrl: "http://localhost:1234/v1",
    apiKeyEnv: "",
    defaultModel: "local-model",
    models: ["local-model"],
  },
  together: {
    name: "together",
    displayName: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    apiKeyEnv: "TOGETHER_API_KEY",
    defaultModel: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    models: [
      "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
      "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      "mistralai/Mixtral-8x7B-Instruct-v0.1",
      "deepseek-ai/DeepSeek-V2-Chat",
    ],
  },
  fireworks: {
    name: "fireworks",
    displayName: "Fireworks AI",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    apiKeyEnv: "FIREWORKS_API_KEY",
    defaultModel: "accounts/fireworks/models/llama-v3p1-8b-instruct",
    models: [
      "accounts/fireworks/models/llama-v3p1-8b-instruct",
      "accounts/fireworks/models/llama-v3p1-70b-instruct",
      "accounts/fireworks/models/mixtral-8x7b-instruct",
    ],
  },
  xai: {
    name: "xai",
    displayName: "xAI (Grok)",
    baseUrl: "https://api.x.ai/v1",
    apiKeyEnv: "XAI_API_KEY",
    defaultModel: "grok-2",
    models: ["grok-2", "grok-2-mini"],
  },
  google: {
    name: "google",
    displayName: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKeyEnv: "GOOGLE_API_KEY",
    defaultModel: "gemini-1.5-flash",
    models: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
  },
};

// ─── Custom Provider Registry ───────────────────────────

const customProviders: Map<string, ProviderDefinition> = new Map();

// ─── LLM Client ─────────────────────────────────────────

export class LLMClient {
  private client: OpenAI;
  private config: LLMConfig;
  private providerDef: ProviderDefinition;

  constructor(config?: Partial<LLMConfig>) {
    // Resolve provider
    const providerName = config?.provider ?? process.env.BOWO_LLM_PROVIDER ?? "openai";
    this.providerDef = resolveProvider(providerName);

    // Resolve API key from provider-specific env var
    const apiKeyFromEnv = this.providerDef.apiKeyEnv
      ? process.env[this.providerDef.apiKeyEnv]
      : undefined;

    this.config = {
      provider: providerName,
      model: config?.model ?? process.env.BOWO_LLM_MODEL ?? this.providerDef.defaultModel,
      apiKey: config?.apiKey ?? process.env.BOWO_LLM_API_KEY ?? apiKeyFromEnv ?? "",
      baseUrl: config?.baseUrl ?? process.env.BOWO_LLM_BASE_URL ?? this.providerDef.baseUrl,
      temperature: config?.temperature ?? 0.7,
      maxTokens: config?.maxTokens ?? 4096,
    };

    this.client = new OpenAI({
      apiKey: this.config.apiKey || "sk-placeholder",
      baseURL: this.config.baseUrl,
    });
  }

  /**
   * Send a chat completion request.
   */
  async chat(
    messages: ChatCompletionMessageParam[],
    options: { temperature?: number; maxTokens?: number; system?: string } = {}
  ): Promise<LLMResponse> {
    const msgs: ChatCompletionMessageParam[] = [];

    if (options.system) {
      msgs.push({ role: "system", content: options.system });
    }

    msgs.push(...messages);

    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages: msgs,
      temperature: options.temperature ?? this.config.temperature,
      max_tokens: options.maxTokens ?? this.config.maxTokens,
    });

    const choice = response.choices[0];

    return {
      content: choice.message.content ?? "",
      model: response.model,
      tokens: {
        prompt: response.usage?.prompt_tokens ?? 0,
        completion: response.usage?.completion_tokens ?? 0,
        total: response.usage?.total_tokens ?? 0,
      },
      finishReason: choice.finish_reason ?? "stop",
    };
  }

  /**
   * Simple prompt → response (system + user).
   */
  async prompt(
    systemPrompt: string,
    userMessage: string,
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<LLMResponse> {
    return this.chat(
      [{ role: "user", content: userMessage }],
      { system: systemPrompt, ...options }
    );
  }

  /**
   * Generate structured JSON output.
   */
  async json<T = unknown>(
    systemPrompt: string,
    userMessage: string,
    options: { temperature?: number } = {}
  ): Promise<T> {
    const response = await this.prompt(
      systemPrompt + "\n\nYou MUST respond with valid JSON only. No markdown, no explanation, just JSON.",
      userMessage,
      { temperature: options.temperature ?? 0.3, maxTokens: 4096 }
    );

    let content = response.content.trim();

    // Remove markdown code blocks if present
    if (content.startsWith("```")) {
      content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    return JSON.parse(content) as T;
  }

  /**
   * Check if LLM is configured and available.
   */
  isAvailable(): boolean {
    return Boolean(this.config.apiKey) || this.config.provider === "ollama" || this.config.provider === "lmstudio";
  }

  /**
   * Get current config (redacted).
   */
  getConfig(): Omit<LLMConfig, "apiKey"> & { apiKey: string } {
    return {
      ...this.config,
      apiKey: this.config.apiKey ? `${this.config.apiKey.slice(0, 8)}...` : "(not set)",
    };
  }

  /**
   * Get provider definition.
   */
  getProvider(): ProviderDefinition {
    return this.providerDef;
  }
}

// ─── Provider Resolution ────────────────────────────────

function resolveProvider(name: string): ProviderDefinition {
  // Check built-in first
  if (BUILTIN_PROVIDERS[name]) {
    return BUILTIN_PROVIDERS[name];
  }

  // Check custom
  if (customProviders.has(name)) {
    return customProviders.get(name)!;
  }

  // Fallback: treat as OpenAI-compatible with custom baseUrl
  console.warn(`⚠️ Unknown provider "${name}", treating as OpenAI-compatible`);
  return {
    name,
    displayName: name,
    baseUrl: process.env.BOWO_LLM_BASE_URL ?? "https://api.openai.com/v1",
    apiKeyEnv: "",
    defaultModel: "gpt-4o-mini",
    models: [],
  };
}

// ─── Public API ─────────────────────────────────────────

/**
 * Register a custom LLM provider.
 *
 * @example
 * registerProvider({
 *   name: "my-llm",
 *   displayName: "My Custom LLM",
 *   baseUrl: "https://my-llm.example.com/v1",
 *   apiKeyEnv: "MY_LLM_API_KEY",
 *   defaultModel: "my-model-v1",
 *   models: ["my-model-v1", "my-model-v2"],
 * });
 */
export function registerProvider(def: ProviderDefinition): void {
  customProviders.set(def.name, def);
  console.log(`✅ Registered provider: ${def.displayName} (${def.name})`);
}

/**
 * Get all available providers (built-in + custom).
 */
export function getProviders(): ProviderDefinition[] {
  return [
    ...Object.values(BUILTIN_PROVIDERS),
    ...Array.from(customProviders.values()),
  ];
}

/**
 * Get provider names.
 */
export function getProviderNames(): string[] {
  return [
    ...Object.keys(BUILTIN_PROVIDERS),
    ...Array.from(customProviders.keys()),
  ];
}

/**
 * Auto-detect provider from environment variables.
 */
export function detectProvider(): string {
  if (process.env.BOWO_LLM_PROVIDER) return process.env.BOWO_LLM_PROVIDER;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.XAI_API_KEY) return "xai";
  if (process.env.GOOGLE_API_KEY) return "google";
  if (process.env.TOGETHER_API_KEY) return "together";
  if (process.env.FIREWORKS_API_KEY) return "fireworks";
  return "openai";
}

// ─── Singleton ──────────────────────────────────────────

let _instance: LLMClient | null = null;

export function getLLM(config?: Partial<LLMConfig>): LLMClient {
  if (!_instance) {
    _instance = new LLMClient(config);
  }
  return _instance;
}

export function resetLLM(): void {
  _instance = null;
}

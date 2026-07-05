/**
 * BOWO i18n — Multi-Language Internationalization
 *
 * Provides translation maps for Indonesian, English, and Chinese.
 * Covers agent output messages, CLI prompts, and dashboard text.
 */

// ─── Types ──────────────────────────────────────────────

export type Language = "id" | "en" | "zh";

export interface TranslationEntry {
  en: string;
  id: string;
  zh: string;
}

export type TranslationMap = Record<string, TranslationEntry>;

export interface I18nConfig {
  defaultLanguage: Language;
  fallbackLanguage: Language;
}

// ─── Translation Maps ───────────────────────────────────

/**
 * General / shared messages used across the system.
 */
export const generalMessages: TranslationMap = {
  "app.title": {
    en: "BOWO — Agent System",
    id: "BOWO — Sistem Agen",
    zh: "BOWO — 智能体系统",
  },
  "app.subtitle": {
    en: "Backend Orchestrator for Workflow Optimization",
    id: "Orkestrator Backend untuk Optimasi Alur Kerja",
    zh: "工作流优化的后端编排器",
  },
  "app.version": {
    en: "Version",
    id: "Versi",
    zh: "版本",
  },
  "app.startup": {
    en: "System initializing…",
    id: "Sistem sedang memulai…",
    zh: "系统初始化中…",
  },
  "app.shutdown": {
    en: "System shutting down",
    id: "Sistem sedang dimatikan",
    zh: "系统关闭中",
  },
  "app.error.fatal": {
    en: "Fatal error",
    id: "Kesalahan fatal",
    zh: "致命错误",
  },
  "app.error.unknown": {
    en: "An unknown error occurred",
    id: "Terjadi kesalahan yang tidak diketahui",
    zh: "发生未知错误",
  },
  "app.yes": {
    en: "Yes",
    id: "Ya",
    zh: "是",
  },
  "app.no": {
    en: "No",
    id: "Tidak",
    zh: "否",
  },
  "app.confirm": {
    en: "Confirm",
    id: "Konfirmasi",
    zh: "确认",
  },
  "app.cancel": {
    en: "Cancel",
    id: "Batal",
    zh: "取消",
  },
  "app.retry": {
    en: "Retry",
    id: "Coba lagi",
    zh: "重试",
  },
  "app.progress": {
    en: "Progress",
    id: "Kemajuan",
    zh: "进度",
  },
  "app.complete": {
    en: "Completed",
    id: "Selesai",
    zh: "已完成",
  },
  "app.loading": {
    en: "Loading…",
    id: "Memuat…",
    zh: "加载中…",
  },
  "app.saving": {
    en: "Saving…",
    id: "Menyimpan…",
    zh: "保存中…",
  },
};

/**
 * Pipeline and workflow messages.
 */
export const pipelineMessages: TranslationMap = {
  "pipeline.start": {
    en: 'Pipeline "{name}" started ({id})',
    id: 'Pipeline "{name}" dimulai ({id})',
    zh: '流水线 "{name}" 已启动 ({id})',
  },
  "pipeline.complete": {
    en: 'Pipeline "{name}" completed in {duration}ms',
    id: 'Pipeline "{name}" selesai dalam {duration}ms',
    zh: '流水线 "{name}" 在 {duration}ms 内完成',
  },
  "pipeline.failed": {
    en: 'Pipeline "{name}" failed',
    id: 'Pipeline "{name}" gagal',
    zh: '流水线 "{name}" 失败',
  },
  "pipeline.paused": {
    en: 'Pipeline "{name}" paused',
    id: 'Pipeline "{name}" dijeda',
    zh: '流水线 "{name}" 已暂停',
  },
  "pipeline.resume": {
    en: "Resuming pipeline…",
    id: "Melanjutkan pipeline…",
    zh: "恢复流水线中…",
  },
  "pipeline.step.start": {
    en: "Step: {agent}",
    id: "Langkah: {agent}",
    zh: "步骤: {agent}",
  },
  "pipeline.step.complete": {
    en: "Step {agent} completed ({duration}ms)",
    id: "Langkah {agent} selesai ({duration}ms)",
    zh: "步骤 {agent} 已完成 ({duration}ms)",
  },
  "pipeline.step.failed": {
    en: "Step {agent} failed",
    id: "Langkah {agent} gagal",
    zh: "步骤 {agent} 失败",
  },
  "pipeline.step.skipped": {
    en: "Step {agent} skipped (disabled)",
    id: "Langkah {agent} dilewati (dinonaktifkan)",
    zh: "步骤 {agent} 已跳过 (已禁用)",
  },
  "pipeline.step.tokens": {
    en: "Tokens used: {count}",
    id: "Token digunakan: {count}",
    zh: "已使用 token: {count}",
  },
  "pipeline.artifacts.count": {
    en: "{count} artifact(s) produced",
    id: "{count} artefak dihasilkan",
    zh: "生成了 {count} 个工件",
  },
};

/**
 * Agent-specific messages.
 */
export const agentMessages: TranslationMap = {
  "agent.planner.name": {
    en: "Planner",
    id: "Perencana",
    zh: "规划师",
  },
  "agent.architect.name": {
    en: "Architect",
    id: "Arsitek",
    zh: "架构师",
  },
  "agent.backend.name": {
    en: "Backend Dev",
    id: "Pengembang Backend",
    zh: "后端开发",
  },
  "agent.frontend.name": {
    en: "Frontend Dev",
    id: "Pengembang Frontend",
    zh: "前端开发",
  },
  "agent.qa.name": {
    en: "QA Engineer",
    id: "Insinyur QA",
    zh: "QA 工程师",
  },
  "agent.debug.name": {
    en: "Debugger",
    id: "Pencari Bug",
    zh: "调试员",
  },
  "agent.security.name": {
    en: "Security",
    id: "Keamanan",
    zh: "安全专家",
  },
  "agent.devops.name": {
    en: "DevOps",
    id: "DevOps",
    zh: "DevOps",
  },
  "agent.reporter.name": {
    en: "Reporter",
    id: "Pelapor",
    zh: "报告员",
  },
  "agent.starting": {
    en: "{agent} is working…",
    id: "{agent} sedang bekerja…",
    zh: "{agent} 正在工作…",
  },
  "agent.finished": {
    en: "{agent} finished",
    id: "{agent} selesai",
    zh: "{agent} 已完成",
  },
  "agent.error": {
    en: "{agent} encountered an error: {error}",
    id: "{agent} mengalami kesalahan: {error}",
    zh: "{agent} 遇到错误: {error}",
  },
};

/**
 * CLI messages (prompts, status, help).
 */
export const cliMessages: TranslationMap = {
  "cli.help.task": {
    en: "Specify the task to execute",
    id: "Tentukan tugas yang akan dijalankan",
    zh: "指定要执行的任务",
  },
  "cli.help.agents": {
    en: "Comma-separated list of agents to use",
    id: "Daftar koma yang dipisahkan dari agen yang akan digunakan",
    zh: "逗号分隔的要使用的智能体列表",
  },
  "cli.help.model": {
    en: "LLM model to use",
    id: "Model LLM yang akan digunakan",
    zh: "要使用的 LLM 模型",
  },
  "cli.help.provider": {
    en: "LLM provider (openai, openrouter, etc.)",
    id: "Penyedia LLM (openai, openrouter, dll.)",
    zh: "LLM 提供商 (openai, openrouter 等)",
  },
  "cli.task.received": {
    en: 'Task received: "{task}"',
    id: 'Tugas diterima: "{task}"',
    zh: '收到任务: "{task}"',
  },
  "cli.agents.selected": {
    en: "Selected agents: {agents}",
    id: "Agen yang dipilih: {agents}",
    zh: "已选择的智能体: {agents}",
  },
  "cli.status.agents": {
    en: "Agents available: {count}",
    id: "Agen tersedia: {count}",
    zh: "可用智能体: {count}",
  },
  "cli.status.memory": {
    en: "Memory entries: {count}",
    id: "Entri memori: {count}",
    zh: "内存条目: {count}",
  },
  "cli.status.llm.online": {
    en: "LLM: Connected ({model})",
    id: "LLM: Terhubung ({model})",
    zh: "LLM: 已连接 ({model})",
  },
  "cli.status.llm.offline": {
    en: "LLM: Offline (rule-based mode)",
    id: "LLM: Offline (mode berbasis aturan)",
    zh: "LLM: 离线 (基于规则模式)",
  },
  "cli.summary.title": {
    en: "EXECUTION SUMMARY",
    id: "RINGKASAN EKSEKUSI",
    zh: "执行摘要",
  },
  "cli.summary.pipeline": {
    en: "Pipeline ID",
    id: "ID Pipeline",
    zh: "流水线 ID",
  },
  "cli.summary.status": {
    en: "Status",
    id: "Status",
    zh: "状态",
  },
  "cli.summary.artifacts": {
    en: "Artifacts",
    id: "Artefak",
    zh: "工件",
  },
  "cli.summary.duration": {
    en: "Duration",
    id: "Durasi",
    zh: "耗时",
  },
  "cli.summary.tokens": {
    en: "Total tokens",
    id: "Total token",
    zh: "总 token",
  },
  "cli.signoff": {
    en: "BOWO signing off. See you next mission!",
    id: "BOWO menutup sesi. Sampai misi berikutnya!",
    zh: "BOWO 退出。下次任务见！",
  },
};

/**
 * Dashboard / monitoring messages.
 */
export const dashboardMessages: TranslationMap = {
  "dashboard.title": {
    en: "BOWO Dashboard",
    id: "Dasbor BOWO",
    zh: "BOWO 仪表盘",
  },
  "dashboard.metrics.successRate": {
    en: "Success Rate",
    id: "Tingkat Keberhasilan",
    zh: "成功率",
  },
  "dashboard.metrics.avgDuration": {
    en: "Average Duration",
    id: "Durasi Rata-rata",
    zh: "平均耗时",
  },
  "dashboard.metrics.totalTokens": {
    en: "Total Tokens Used",
    id: "Total Token Digunakan",
    zh: "已使用总 token",
  },
  "dashboard.metrics.totalPipelines": {
    en: "Total Pipelines",
    id: "Total Pipeline",
    zh: "流水线总数",
  },
  "dashboard.metrics.totalArtifacts": {
    en: "Total Artifacts",
    id: "Total Artefak",
    zh: "工件总数",
  },
  "dashboard.metrics.agentPerformance": {
    en: "Agent Performance",
    id: "Performa Agen",
    zh: "智能体性能",
  },
  "dashboard.metrics.recentRuns": {
    en: "Recent Pipeline Runs",
    id: "Jalur Pipeline Terkini",
    zh: "最近流水线运行",
  },
  "dashboard.section.overview": {
    en: "Overview",
    id: "Ringkasan",
    zh: "概览",
  },
  "dashboard.section.agents": {
    en: "Agents",
    id: "Agen",
    zh: "智能体",
  },
  "dashboard.section.history": {
    en: "History",
    id: "Riwayat",
    zh: "历史记录",
  },
  "dashboard.section.sessions": {
    en: "Sessions",
    id: "Sesi",
    zh: "会话",
  },
  "dashboard.chart.pipelineFlow": {
    en: "Pipeline Execution Flow",
    id: "Alur Eksekusi Pipeline",
    zh: "流水线执行流程",
  },
  "dashboard.chart.tokenUsage": {
    en: "Token Usage Over Time",
    id: "Penggunaan Token dari Waktu ke Waktu",
    zh: "Token 使用趋势",
  },
  "dashboard.chart.agentLoad": {
    en: "Agent Task Distribution",
    id: "Distribusi Tugas Agen",
    zh: "智能体任务分布",
  },
  "dashboard.lastUpdated": {
    en: "Last updated",
    id: "Terakhir diperbarui",
    zh: "最后更新",
  },
  "dashboard.noData": {
    en: "No data available yet",
    id: "Belum ada data yang tersedia",
    zh: "暂无数据",
  },
};

// ─── Message Registry ───────────────────────────────────

const allMessages: TranslationMap = {
  ...generalMessages,
  ...pipelineMessages,
  ...agentMessages,
  ...cliMessages,
  ...dashboardMessages,
};

// ─── I18n Class ─────────────────────────────────────────

export class BowoI18n {
  private language: Language;
  private fallback: Language;
  private customMessages: TranslationMap;

  constructor(config: Partial<I18nConfig> = {}) {
    this.language = config.defaultLanguage ?? "en";
    this.fallback = config.fallbackLanguage ?? "en";
    this.customMessages = {};
  }

  /**
   * Get a translated message by key.
   * Supports interpolation: {variable} placeholders are replaced with values.
   */
  t(key: string, params?: Record<string, string | number>): string {
    const entry = this.customMessages[key] ?? allMessages[key];

    if (!entry) {
      // Key not found — return the key itself as a fallback
      return key;
    }

    let text = entry[this.language] ?? entry[this.fallback] ?? key;

    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(paramValue));
      }
    }

    return text;
  }

  /**
   * Set the active language.
   */
  setLanguage(lang: Language): void {
    this.language = lang;
  }

  /**
   * Get the current active language.
   */
  getLanguage(): Language {
    return this.language;
  }

  /**
   * Register custom translation entries that override defaults.
   */
  registerMessages(messages: TranslationMap): void {
    Object.assign(this.customMessages, messages);
  }

  /**
   * Get all available translation keys.
   */
  getKeys(): string[] {
    const allKeys = new Set([
      ...Object.keys(allMessages),
      ...Object.keys(this.customMessages),
    ]);
    return [...allKeys].sort();
  }

  /**
   * Check if a key exists.
   */
  hasKey(key: string): boolean {
    return key in allMessages || key in this.customMessages;
  }

  /**
   * Get a full translation entry for a key (all languages).
   */
  getEntry(key: string): TranslationEntry | null {
    return this.customMessages[key] ?? allMessages[key] ?? null;
  }

  /**
   * Export all messages for a given language (useful for static analysis).
   */
  exportLanguage(lang: Language): Record<string, string> {
    const result: Record<string, string> = {};
    const keys = this.getKeys();

    for (const key of keys) {
      const entry = this.customMessages[key] ?? allMessages[key];
      if (entry) {
        result[key] = entry[lang] ?? entry[this.fallback] ?? key;
      }
    }

    return result;
  }

  /**
   * Auto-detect language from environment variable BOWO_LANG,
   * falling back to the configured default.
   */
  static fromEnv(): BowoI18n {
    const envLang = (process.env.BOWO_LANG ?? "en").toLowerCase();
    const validLang: Language = ["en", "id", "zh"].includes(envLang)
      ? (envLang as Language)
      : "en";

    return new BowoI18n({ defaultLanguage: validLang });
  }
}

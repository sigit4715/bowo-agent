/**
 * BOWO Logger — Structured Logger with In-Memory Buffer
 *
 * Outputs formatted log lines and retains the last 1000 entries
 * for programmatic access via getLogs().
 *
 * Format: [2026-07-05T12:00:00Z] [INFO] [orchestrator] Message { data }
 */

// ─── Types ──────────────────────────────────────────────

export interface LogEntry {
  timestamp: string;
  level: string;
  name: string;
  message: string;
  data?: any;
}

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: LogLevel[] = ["debug", "info", "warn", "error"];

// ─── Logger ─────────────────────────────────────────────

export class Logger {
  private name: string;
  private level: LogLevel;
  private logs: LogEntry[] = [];
  private static MAX_ENTRIES = 1000;

  constructor(name: string, level: LogLevel = "info") {
    this.name = name;
    this.level = level;
  }

  /**
   * Log a debug message.
   */
  debug(msg: string, data?: any): void {
    this.log("debug", msg, data);
  }

  /**
   * Log an info message.
   */
  info(msg: string, data?: any): void {
    this.log("info", msg, data);
  }

  /**
   * Log a warning message.
   */
  warn(msg: string, data?: any): void {
    this.log("warn", msg, data);
  }

  /**
   * Log an error message.
   */
  error(msg: string, data?: any): void {
    this.log("error", msg, data);
  }

  /**
   * Create a child logger that inherits the parent's level
   * and shares the same log buffer.
   */
  child(name: string): Logger {
    const childLogger = new Logger(name, this.level);
    // Share the same buffer reference so getLogs() on parent includes child entries
    (childLogger as any).logs = this.logs;
    return childLogger;
  }

  /**
   * Change the minimum log level at runtime.
   */
  setLevel(level: string): void {
    if (LEVEL_ORDER.includes(level as LogLevel)) {
      this.level = level as LogLevel;
    }
  }

  /**
   * Return all buffered log entries (up to 1000).
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  // ── Private ───────────────────────────────────────────

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(this.level);
  }

  private log(level: LogLevel, message: string, data?: any): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      name: this.name,
      message,
      data,
    };

    // Append and trim to max entries
    this.logs.push(entry);
    if (this.logs.length > Logger.MAX_ENTRIES) {
      this.logs = this.logs.slice(this.logs.length - Logger.MAX_ENTRIES);
    }

    // Console output in structured format
    const dataStr = data !== undefined ? ` ${JSON.stringify(data)}` : "";
    console.log(`[${entry.timestamp}] [${entry.level}] [${this.name}] ${message}${dataStr}`);
  }
}

// ─── Prometheus-compatible metrics for BOWO Agent ──────────────────────────────
// Zero external dependencies. ES modules.

// ─── Types ────────────────────────────────────────────────────────────────────

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface MetricDefinition {
  name: string;
  help: string;
  type: MetricType;
  labels?: string[];
}

export interface MetricValue {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp?: number;
}

export interface HistogramBucket {
  le: number;
  count: number;
}

// ─── Internal storage helpers ─────────────────────────────────────────────────

interface CounterStore {
  values: Map<string, number>; // key = serialised labels → cumulative value
}

interface GaugeStore {
  values: Map<string, number>;
}

interface HistogramStore {
  buckets: Map<string, Map<number, number>>; // key → {le → count}
  sum: Map<string, number>;
  count: Map<string, number>;
}

interface SummaryStore {
  quantiles: Map<string, number[]>; // key → observed values (raw list)
  sum: Map<string, number>;
  count: Map<string, number>;
}

const DEFAULT_HISTOGRAM_BOUNDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100,
];

const DEFAULT_SUMMARY_QUANTILES = [0.5, 0.9, 0.95, 0.99];

// ─── MetricsCollector ─────────────────────────────────────────────────────────

export class MetricsCollector {
  private definitions: Map<string, MetricDefinition> = new Map();
  private counters: Map<string, CounterStore> = new Map();
  private gauges: Map<string, GaugeStore> = new Map();
  private histograms: Map<string, HistogramStore> = new Map();
  private summaries: Map<string, SummaryStore> = new Map();
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  // ── Registration ──────────────────────────────────────────────────────────

  register(def: MetricDefinition): void {
    this.definitions.set(def.name, def);

    // Initialise the appropriate store
    switch (def.type) {
      case 'counter':
        if (!this.counters.has(def.name)) {
          this.counters.set(def.name, { values: new Map() });
        }
        break;
      case 'gauge':
        if (!this.gauges.has(def.name)) {
          this.gauges.set(def.name, { values: new Map() });
        }
        break;
      case 'histogram':
        if (!this.histograms.has(def.name)) {
          this.histograms.set(def.name, {
            buckets: new Map(),
            sum: new Map(),
            count: new Map(),
          });
        }
        break;
      case 'summary':
        if (!this.summaries.has(def.name)) {
          this.summaries.set(def.name, {
            quantiles: new Map(),
            sum: new Map(),
            count: new Map(),
          });
        }
        break;
    }
  }

  // ── Counter ───────────────────────────────────────────────────────────────

  counter(name: string, labels?: Record<string, string>): void {
    this.counterInc(name, 1, labels);
  }

  counterInc(name: string, value: number, labels?: Record<string, string>): void {
    const store = this.counters.get(name);
    if (!store) throw new Error(`Unregistered counter metric: ${name}`);
    const key = this.serialiseLabels(labels);
    const prev = store.values.get(key) ?? 0;
    store.values.set(key, prev + value);
  }

  // ── Gauge ─────────────────────────────────────────────────────────────────

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const store = this.gauges.get(name);
    if (!store) throw new Error(`Unregistered gauge metric: ${name}`);
    const key = this.serialiseLabels(labels);
    store.values.set(key, value);
  }

  gaugeInc(name: string, value: number, labels?: Record<string, string>): void {
    const store = this.gauges.get(name);
    if (!store) throw new Error(`Unregistered gauge metric: ${name}`);
    const key = this.serialiseLabels(labels);
    const prev = store.values.get(key) ?? 0;
    store.values.set(key, prev + value);
  }

  gaugeDec(name: string, value: number, labels?: Record<string, string>): void {
    this.gaugeInc(name, -value, labels);
  }

  // ── Histogram ─────────────────────────────────────────────────────────────

  histogram(name: string, value: number, labels?: Record<string, string>): void {
    const store = this.histograms.get(name);
    if (!store) throw new Error(`Unregistered histogram metric: ${name}`);
    const key = this.serialiseLabels(labels);

    // Ensure bucket map exists
    if (!store.buckets.has(key)) {
      const bucketMap = new Map<number, number>();
      for (const le of DEFAULT_HISTOGRAM_BOUNDS) {
        bucketMap.set(le, 0);
      }
      bucketMap.set(Infinity, 0);
      store.buckets.set(key, bucketMap);
    }

    // Increment appropriate buckets
    const bucketMap = store.buckets.get(key)!;
    for (const le of DEFAULT_HISTOGRAM_BOUNDS) {
      if (value <= le) {
        bucketMap.set(le, (bucketMap.get(le) ?? 0) + 1);
      }
    }
    bucketMap.set(Infinity, (bucketMap.get(Infinity) ?? 0) + 1);

    // Update sum and count
    store.sum.set(key, (store.sum.get(key) ?? 0) + value);
    store.count.set(key, (store.count.get(key) ?? 0) + 1);
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  summary(name: string, value: number, labels?: Record<string, string>): void {
    const store = this.summaries.get(name);
    if (!store) throw new Error(`Unregistered summary metric: ${name}`);
    const key = this.serialiseLabels(labels);

    if (!store.quantiles.has(key)) {
      store.quantiles.set(key, []);
    }
    store.quantiles.get(key)!.push(value);
    store.sum.set(key, (store.sum.get(key) ?? 0) + value);
    store.count.set(key, (store.count.get(key) ?? 0) + 1);
  }

  // ── Export ────────────────────────────────────────────────────────────────

  getMetrics(): string {
    const lines: string[] = [];
    const timestamp = Date.now();

    for (const [name, def] of Array.from(this.definitions)) {
      // HELP & TYPE headers
      lines.push(`# HELP ${name} ${def.help}`);
      lines.push(`# TYPE ${name} ${def.type}`);

      switch (def.type) {
        case 'counter':
          this.exportCounter(name, def, lines);
          break;
        case 'gauge':
          this.exportGauge(name, def, lines);
          break;
        case 'histogram':
          this.exportHistogram(name, def, lines, timestamp);
          break;
        case 'summary':
          this.exportSummary(name, def, lines, timestamp);
          break;
      }

      lines.push(''); // blank line between metrics
    }

    return lines.join('\n');
  }

  // ── Get single metric ─────────────────────────────────────────────────────

  getMetric(name: string): MetricValue[] {
    const def = this.definitions.get(name);
    if (!def) throw new Error(`Unknown metric: ${name}`);

    const results: MetricValue[] = [];

    switch (def.type) {
      case 'counter': {
        const store = this.counters.get(name);
        if (store) {
          for (const [key, value] of Array.from(store.values)) {
            results.push({ name, value, labels: this.deserialiseLabels(key) });
          }
        }
        break;
      }
      case 'gauge': {
        const store = this.gauges.get(name);
        if (store) {
          for (const [key, value] of Array.from(store.values)) {
            results.push({ name, value, labels: this.deserialiseLabels(key) });
          }
        }
        break;
      }
      case 'histogram': {
        const store = this.histograms.get(name);
        if (store) {
          for (const [key, count] of Array.from(store.count)) {
            const sum = store.sum.get(key) ?? 0;
            results.push({ name, value: sum, labels: this.deserialiseLabels(key), timestamp: count });
          }
        }
        break;
      }
      case 'summary': {
        const store = this.summaries.get(name);
        if (store) {
          for (const [key, count] of Array.from(store.count)) {
            const sum = store.sum.get(key) ?? 0;
            results.push({ name, value: sum, labels: this.deserialiseLabels(key), timestamp: count });
          }
        }
        break;
      }
    }

    return results;
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.summaries.clear();

    // Re-initialise stores for registered metrics
    for (const [, def] of Array.from(this.definitions)) {
      switch (def.type) {
        case 'counter':
          this.counters.set(def.name, { values: new Map() });
          break;
        case 'gauge':
          this.gauges.set(def.name, { values: new Map() });
          break;
        case 'histogram':
          this.histograms.set(def.name, {
            buckets: new Map(),
            sum: new Map(),
            count: new Map(),
          });
          break;
        case 'summary':
          this.summaries.set(def.name, {
            quantiles: new Map(),
            sum: new Map(),
            count: new Map(),
          });
          break;
      }
    }

    this.startTime = Date.now();
  }

  getRegisteredMetrics(): MetricDefinition[] {
    return Array.from(this.definitions.values());
  }

  // ── Private: serialise labels to a stable string key ──────────────────────

  private serialiseLabels(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return '';
    const sorted = Object.keys(labels).sort().map((k) => `${k}="${labels[k]}"`);
    return `{${sorted.join(',')}}`;
  }

  private deserialiseLabels(key: string): Record<string, string> | undefined {
    if (!key) return undefined;
    // strip outer braces
    const inner = key.slice(1, -1);
    const result: Record<string, string> = {};
    // parse key="value" pairs
    const parts = inner.split(/,(?=[^"]*(?:"[^"]*"[^"]*)*$)/);
    for (const part of parts) {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      const k = part.slice(0, eqIdx).trim();
      let v = part.slice(eqIdx + 1).trim();
      // strip surrounding quotes
      if (v.startsWith('"') && v.endsWith('"')) {
        v = v.slice(1, -1);
      }
      result[k] = v;
    }
    return result;
  }

  // ── Private: Prometheus text export helpers ────────────────────────────────

  private exportCounter(
    name: string,
    def: MetricDefinition,
    lines: string[],
  ): void {
    const store = this.counters.get(name);
    if (!store) return;
    for (const [key, value] of Array.from(store.values)) {
      const labelStr = this.formatLabelString(key, def.labels);
      lines.push(`${name}${labelStr} ${this.formatValue(value)}`);
    }
  }

  private exportGauge(
    name: string,
    def: MetricDefinition,
    lines: string[],
  ): void {
    const store = this.gauges.get(name);
    if (!store) return;
    for (const [key, value] of Array.from(store.values)) {
      const labelStr = this.formatLabelString(key, def.labels);
      lines.push(`${name}${labelStr} ${this.formatValue(value)}`);
    }
  }

  private exportHistogram(
    name: string,
    def: MetricDefinition,
    lines: string[],
    _timestamp: number,
  ): void {
    const store = this.histograms.get(name);
    if (!store) return;

    for (const [key, bucketMap] of Array.from(store.buckets)) {
      const labels = this.deserialiseLabels(key);
      const labelDefs = def.labels ?? [];

      // Emit individual buckets
      for (const le of Array.from([...DEFAULT_HISTOGRAM_BOUNDS, Infinity])) {
        const count = bucketMap.get(le) ?? 0;
        const bucketLabels = { ...labels, le: le === Infinity ? '+Inf' : String(le) };
        const labelStr = this.buildLabelString(bucketLabels, labelDefs);
        lines.push(`${name}_bucket${labelStr} ${count}`);
      }

      // Emit _sum
      const sum = store.sum.get(key) ?? 0;
      const sumLabels = this.formatLabelString(key, def.labels);
      lines.push(`${name}_sum${sumLabels} ${this.formatValue(sum)}`);

      // Emit _count
      const count = store.count.get(key) ?? 0;
      lines.push(`${name}_count${sumLabels} ${count}`);
    }
  }

  private exportSummary(
    name: string,
    def: MetricDefinition,
    lines: string[],
    _timestamp: number,
  ): void {
    const store = this.summaries.get(name);
    if (!store) return;

    for (const [key, values] of Array.from(store.quantiles)) {
      const sorted = [...values].sort((a, b) => a - b);
      const labels = this.deserialiseLabels(key);
      const labelDefs = def.labels ?? [];

      // Emit quantiles
      for (const q of DEFAULT_SUMMARY_QUANTILES) {
        const idx = Math.ceil(q * sorted.length) - 1;
        const val = sorted[Math.max(0, idx)] ?? 0;
        const qLabels = { ...labels, quantile: String(q) };
        const labelStr = this.buildLabelString(qLabels, labelDefs);
        lines.push(`${name}${labelStr} ${this.formatValue(val)}`);
      }

      // Emit _sum
      const sum = store.sum.get(key) ?? 0;
      const sumLabels = this.formatLabelString(key, def.labels);
      lines.push(`${name}_sum${sumLabels} ${this.formatValue(sum)}`);

      // Emit _count
      const count = store.count.get(key) ?? 0;
      lines.push(`${name}_count${sumLabels} ${count}`);
    }
  }

  // ── Private: label formatting ──────────────────────────────────────────────

  private formatLabelString(key: string, labelDefs?: string[]): string {
    if (!key) return '';
    // Already in {k="v",...} format — return as-is
    return key;
  }

  private buildLabelString(
    labels: Record<string, string>,
    labelDefs?: string[],
  ): string {
    const keys = Object.keys(labels).sort();
    if (keys.length === 0) return '';
    const pairs = keys.map((k) => `${k}="${this.escapeLabelValue(labels[k])}"`);
    return `{${pairs.join(',')}}`;
  }

  private escapeLabelValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  private formatValue(value: number): string {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Infinity) return '+Inf';
    if (value === -Infinity) return '-Inf';
    // Use exponential notation for very large or very small numbers
    if (Math.abs(value) > 1e18 || (Math.abs(value) < 1e-12 && value !== 0)) {
      return value.toExponential();
    }
    // Avoid trailing zeros issues — use enough precision
    return Number.isInteger(value) ? String(value) : String(value);
  }
}

// ─── Built-in metric definitions ──────────────────────────────────────────────

const BUILTIN_DEFINITIONS: MetricDefinition[] = [
  {
    name: 'bowo_agent_executions_total',
    help: 'Total number of agent executions',
    type: 'counter',
    labels: ['agent', 'status'],
  },
  {
    name: 'bowo_agent_duration_seconds',
    help: 'Agent execution duration in seconds',
    type: 'histogram',
    labels: ['agent'],
  },
  {
    name: 'bowo_agent_tokens_total',
    help: 'Total tokens consumed by agents',
    type: 'counter',
    labels: ['agent'],
  },
  {
    name: 'bowo_combo_attempts_total',
    help: 'Total model combo attempts',
    type: 'counter',
    labels: ['combo', 'model', 'status'],
  },
  {
    name: 'bowo_combo_fallbacks_total',
    help: 'Total model combo fallbacks',
    type: 'counter',
    labels: ['combo'],
  },
  {
    name: 'bowo_pool_rotations_total',
    help: 'Total provider pool rotations',
    type: 'counter',
    labels: ['provider'],
  },
  {
    name: 'bowo_pool_keys_active',
    help: 'Number of active keys per provider',
    type: 'gauge',
    labels: ['provider'],
  },
  {
    name: 'bowo_pool_requests_total',
    help: 'Total requests sent to provider pool',
    type: 'counter',
    labels: ['provider'],
  },
  {
    name: 'bowo_pool_tokens_total',
    help: 'Total tokens consumed from provider pool',
    type: 'counter',
    labels: ['provider'],
  },
  {
    name: 'bowo_health_checks_total',
    help: 'Total health checks performed',
    type: 'counter',
    labels: ['provider', 'status'],
  },
  {
    name: 'bowo_cache_hits_total',
    help: 'Total cache hits',
    type: 'counter',
  },
  {
    name: 'bowo_cache_misses_total',
    help: 'Total cache misses',
    type: 'counter',
  },
  {
    name: 'bowo_users_active',
    help: 'Number of currently active users',
    type: 'gauge',
  },
  {
    name: 'bowo_system_uptime_seconds',
    help: 'System uptime in seconds',
    type: 'gauge',
  },
  {
    name: 'bowo_system_memory_bytes',
    help: 'System memory usage in bytes',
    type: 'gauge',
  },
];

// ─── Helper functions ─────────────────────────────────────────────────────────

export function createDefaultCollector(): MetricsCollector {
  const collector = new MetricsCollector();
  for (const def of BUILTIN_DEFINITIONS) {
    collector.register(def);
  }
  return collector;
}

export function metricsMiddleware(
  collector: MetricsCollector,
): (req: any, res: any, next: any) => void {
  return function bowoMetricsMiddleware(req: any, res: any, next: any): void {
    const start = Date.now();

    // Capture the original end method
    const originalEnd = res.end;
    res.end = function (this: any, ...args: any[]): any {
      const duration = (Date.now() - start) / 1000;
      const method = req.method || 'UNKNOWN';
      const route = req.route?.path ?? req.path ?? 'unknown';
      const status = String(res.statusCode ?? 500);

      // Track request count and duration via internal counter
      const counterKey = `${method} ${route}`;
      collector.counterInc('bowo_agent_executions_total', 1, {
        agent: counterKey,
        status,
      });
      collector.histogram('bowo_agent_duration_seconds', duration, {
        agent: counterKey,
      });

      // Track active users — increment on each request
      collector.gaugeInc('bowo_users_active', 1);

      // Return the original end
      return originalEnd.apply(this, args);
    };

    next();
  };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) {
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

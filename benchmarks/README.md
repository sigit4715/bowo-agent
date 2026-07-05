# 🐾 BOWO Benchmark Suite

Performance measurement suite for BOWO's core subsystems. Measures throughput, latency, and scaling behavior of the pipeline engine, agent framework, memory, caching, checkpointing, and database layers.

## What is Benchmarked

| Category | Benchmark | What it measures |
|---|---|---|
| **Pipeline** | Sequential (5 steps) | Workflow engine running 5 agents in series |
| **Pipeline** | DAG Parallel (5 nodes, 3 waves) | DAGExecutor with parallel node execution |
| **Agent** | Without LLM | Mock agent execution path (no network) |
| **Agent** | LLM path (unavailable) | LLM tool overhead when provider is not configured |
| **Memory** | Write | `BowoMemory.store()` per-call throughput |
| **Memory** | Read (query) | `BOWOmemory.query()` with type+agent filter |
| **Checkpoint** | Save | `CheckpointManager.save()` JSON file I/O |
| **Checkpoint** | Load | `CheckpointManager.load()` JSON file I/O |
| **Cache** | Hit (get) | In-memory `CacheManager.get()` on populated cache |
| **Cache** | Miss (get missing) | In-memory `CacheManager.get()` on empty keys |
| **Database** | Insert | Single `CollectionHandle.insert()` (full disk write) |
| **Database** | Find (filter) | `CollectionHandle.find()` with eq filter |
| **Database** | Update | `CollectionHandle.update()` by ID |
| **Database** | InsertMany (batch 100) | Bulk `CollectionHandle.insertMany()` |

## How to Run

```bash
# From the bowo-agent root directory
npx tsx benchmarks/run.ts

# Or with explicit path
npx tsx ./benchmarks/run.ts
```

**Requirements:**
- Node.js ≥ 22
- `tsx` installed (`npm install -D tsx`)
- Project dependencies installed (`npm install`)

The benchmarks run with **200 operations per test** by default. To change, edit the `OPS` constant at the top of `main()` in `run.ts`.

## Output

### Console

A formatted table is printed to stdout:

```
──────────────────────────────────────────────────────────┬───────────────┬──────────┬────────────┬─────────────┬──────────────
Benchmark                                                 │   Ops │   Total ms │   Avg µs │     Ops/s │       Notes
──────────────────────────────────────────────────────────┼───────────────┼──────────┼────────────┼─────────────┼──────────────
Pipeline — Sequential (5 steps)                           │     200 │    4821.30 │   24106.5 │      41.48 │   5 agents
Pipeline — DAG Parallel (5 nodes, 3 waves)               │     200 │    2203.15 │   11015.8 │      90.78 │ parallel waves
...
──────────────────────────────────────────────────────────┴───────────────┴──────────┴────────────┴─────────────┴──────────────
```

### JSON Results

After each run, `benchmarks/results.json` is written with:

```json
{
  "meta": {
    "timestamp": "2025-01-15T12:00:00.000Z",
    "opsPerBenchmark": 200,
    "nodeVersion": "v22.12.0",
    "platform": "linux",
    "arch": "x64"
  },
  "results": [
    {
      "name": "Pipeline — Sequential (5 steps)",
      "ops": 200,
      "totalMs": 4821.30,
      "avgMs": 24.11,
      "opsPerSec": 41.48,
      "extra": "5 agents"
    }
  ]
}
```

## Expected Results

Results vary by hardware, but here are typical reference points:

| Benchmark | Expected Range | Notes |
|---|---|---|
| Pipeline Sequential | 15–50 ops/s | 5 mock agents per pipeline run |
| Pipeline DAG | 60–150 ops/s | Parallel execution reduces wall time |
| Agent (no LLM) | 200–800 ops/s | Pure overhead of agent framework |
| Memory Write | 30–100 ops/s | Each write persists to disk (JSON) |
| Memory Read | 100–500 ops/s | In-memory filter + slice |
| Checkpoint Save | 50–200 ops/s | JSON.stringify + fs.writeFileSync |
| Checkpoint Load | 100–400 ops/s | fs.readFileSync + JSON.parse |
| Cache Hit | 500K–2M ops/s | Pure in-memory Map lookup |
| Cache Miss | 500K–2M ops/s | Map miss + expiration check |
| Database Insert | 20–80 ops/s | Full file read/write per insert |
| Database Find | 20–80 ops/s | Full file read + filter per query |
| Database Update | 20–80 ops/s | Full file read + write + rebuild indexes |

> ⚠️ Cache benchmarks will always be dramatically faster (1000x+) than disk-based operations because `CacheManager` is entirely in-memory while `BowoMemory`, `CheckpointManager`, and `DatabaseManager` all persist to JSON files.

## Performance Tips

### Disk I/O Bound Operations (Memory, Checkpoints, Database)

These are the bottlenecks in most BOWO pipelines:

1. **Batch writes** — Use `insertMany()` instead of repeated `insert()` calls. Each insert triggers a full file rewrite.

2. **Reduce checkpoint frequency** — Checkpoint on meaningful steps only (e.g., after agent completion), not on every intermediate state.

3. **Use indexes** — Call `collection.createIndex('field')` on fields you filter by. The `eq` operator auto-uses indexes.

4. **Consider in-memory mode** — For hot-path memory queries within a single pipeline, cache results locally instead of re-querying the JSON store.

5. **SSD storage** — All persistence is file-based. NVMe SSDs give 10–50x improvement over HDD for small-file I/O patterns.

### Pipeline Optimization

1. **Prefer DAG over sequential** — `DAGExecutor` runs independent nodes in parallel via `Promise.allSettled()`. A 3-wave DAG can be ~3x faster than a sequential pipeline with the same total work.

2. **Flatten dependency chains** — The more waves in your DAG, the less parallelism you get. Group independent work into the same wave.

3. **Keep agent execution fast** — Each agent adds latency. Avoid LLM calls for deterministic operations (validation, formatting, file moves).

### Cache Optimization

1. **Set appropriate TTLs** — Default 300s is fine for most use cases. Lower for frequently changing data, higher for stable config.

2. **Use `getOrSet()`** — Avoids double-lookup patterns and race conditions.

3. **Call `destroy()` when done** — The cleanup interval prevents the process from exiting cleanly in short-lived scripts.

### General

1. **Run on a quiet system** — Background disk I/O and CPU contention skew results.

2. **Multiple runs** — Run the benchmark 3–5 times and compare. First runs may be slower due to filesystem cache warming.

3. **Profile, don't guess** — Use `NODE_DEBUG=ts` or Chrome DevTools `--inspect` to identify actual bottlenecks before optimizing.

## Architecture

```
benchmarks/
├── run.ts          # Benchmark runner (all benchmarks + table output)
├── results.json    # Last run results (auto-generated)
└── README.md       # This file
```

The runner imports directly from `../src/` — no build step required. Each benchmark uses isolated temporary directories that are cleaned up after execution.

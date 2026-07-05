/**
 * BOWO DAG — Directed Acyclic Graph Workflow Engine
 *
 * Replaces simple sequential pipelines with a graph-based execution system
 * inspired by LangGraph. Supports:
 *   - Dependency-driven execution ordering
 *   - Parallel execution of independent nodes
 *   - Conditional node execution
 *   - Dynamic resolution of ready nodes
 *   - Event emission for monitoring
 */

import { EventEmitter } from "node:events";
import { MemoryType, type BowoMemory } from "./memory.js";

// ─── Types ──────────────────────────────────────────────

/** A single node in the DAG. */
export interface DAGNode {
  /** Unique node identifier. */
  id: string;
  /** Name of the agent to execute at this node. */
  agentName: string;
  /** IDs of nodes that must complete before this one runs. */
  dependsOn: string[];
  /** Optional predicate — if it returns false the node is skipped. */
  condition?: (context: Record<string, unknown>) => boolean;
}

/** A complete DAG graph definition. */
export interface DAGGraph {
  /** Unique graph identifier. */
  id: string;
  /** Human-readable graph name. */
  name: string;
  /** All nodes in the graph. */
  nodes: DAGNode[];
}

/** Per-node result stored inside DAGResult. */
export interface DAGNodeResult {
  /** Final status of the node execution. */
  status: "completed" | "failed" | "skipped";
  /** Wall-clock duration in milliseconds. */
  duration: number;
  /** Artifacts produced by the agent (if any). */
  artifacts: unknown[];
}

/** Aggregate result returned after graph execution. */
export interface DAGResult {
  graphId: string;
  status: "completed" | "failed" | "partial";
  nodeResults: Map<string, DAGNodeResult>;
  totalDuration: number;
}

// ─── DAGExecutor ────────────────────────────────────────

/**
 * Executes a DAG graph by resolving dependencies, running ready nodes in
 * parallel where possible, and collecting results.
 *
 * @event node:start    { nodeId, agentName }
 * @event node:complete { nodeId, agentName, duration, status }
 * @event node:error    { nodeId, agentName, error }
 * @event graph:complete { graphId, status, totalDuration }
 */
export class DAGExecutor extends EventEmitter {
  private agents: Map<string, { execute(input: any): Promise<any> }>;
  private memory: BowoMemory;

  constructor(
    agents: Map<string, { execute(input: any): Promise<any> }>,
    memory: BowoMemory
  ) {
    super();
    this.agents = agents;
    this.memory = memory;
  }

  // ── Public API ──────────────────────────────────────

  /**
   * Execute a full DAG graph.
   *
   * 1. Validate the graph (cycle detection, missing agents).
   * 2. Loop: find ready nodes → run in parallel → record results → repeat.
   * 3. Stop when no more nodes can run (all done, all failed, or deadlocked).
   */
  async execute(
    graph: DAGGraph,
    initialContext: Record<string, unknown> = {}
  ): Promise<DAGResult> {
    const graphStart = performance.now();
    const nodeResults = new Map<string, DAGNodeResult>();
    const completed = new Set<string>();
    const failed = new Set<string>();
    const skipped = new Set<string>();
    const allNodeIds = new Set(graph.nodes.map((n) => n.id));

    // Deep-clone context so mutations don't leak to the caller.
    const context: Record<string, unknown> = structuredClone(initialContext);

    // ── Validate graph ──
    this.validateGraph(graph, allNodeIds);

    // ── Main execution loop ──
    let safety = 0;
    const maxIterations = allNodeIds.size + 1;

    while (safety < maxIterations) {
      safety++;

      const ready = this.resolveReadyNodes(graph, completed, context);

      // Filter through conditions
      const runnable: DAGNode[] = [];
      for (const node of ready) {
        if (this.shouldRunNode(node, context)) {
          runnable.push(node);
        } else {
          // Condition failed — mark as skipped
          skipped.add(node.id);
          nodeResults.set(node.id, {
            status: "skipped",
            duration: 0,
            artifacts: [],
          });
          completed.add(node.id); // treat as resolved so dependents can proceed
          this.emit("node:complete", {
            nodeId: node.id,
            agentName: node.agentName,
            duration: 0,
            status: "skipped",
          });
        }
      }

      if (runnable.length === 0) {
        // Nothing more we can do — either everything finished or we're stuck.
        break;
      }

      // Execute all ready nodes in parallel.
      const settled = await Promise.allSettled(
        runnable.map((node) => this.executeNode(node, context))
      );

      for (let i = 0; i < runnable.length; i++) {
        const node = runnable[i];
        const result = settled[i];

        if (result.status === "fulfilled") {
          const nr = result.value;
          nodeResults.set(node.id, nr);
          if (nr.status === "completed") {
            completed.add(node.id);
          } else {
            failed.add(node.id);
            completed.add(node.id); // still mark resolved so graph doesn't deadlock
          }
        } else {
          // Promise rejection (shouldn't happen because we catch inside
          // executeNode, but guard anyway).
          const err =
            result.reason instanceof Error
              ? result.reason
              : new Error(String(result.reason));
          nodeResults.set(node.id, {
            status: "failed",
            duration: 0,
            artifacts: [],
          });
          failed.add(node.id);
          completed.add(node.id);
          this.emit("node:error", {
            nodeId: node.id,
            agentName: node.agentName,
            error: err.message,
          });
        }
      }
    }

    // ── Determine overall status ──
    let status: DAGResult["status"];
    const totalExpected = allNodeIds.size;
    const totalDone = completed.size;

    if (failed.size > 0 && totalDone === totalExpected) {
      status = "partial";
    } else if (totalDone === totalExpected && failed.size === 0) {
      status = "completed";
    } else if (totalDone === totalExpected) {
      status = "partial";
    } else {
      // Deadlock or early exit
      status = failed.size > 0 ? "partial" : "failed";
    }

    const totalDuration = performance.now() - graphStart;

    const dagResult: DAGResult = {
      graphId: graph.id,
      status,
      nodeResults,
      totalDuration,
    };

    // ── Persist to memory ──
    this.memory.store(
      MemoryType.RESULT,
      "dag-executor",
      {
        graphId: graph.id,
        graphName: graph.name,
        status,
        totalDuration: Math.round(totalDuration),
        nodesCompleted: completed.size - failed.size,
        nodesFailed: failed.size,
        nodesSkipped: skipped.size,
        totalNodes: totalExpected,
      },
      {
        tags: ["dag", "graph-complete", graph.id],
        metadata: { graphId: graph.id },
      }
    );

    // Store per-node results
    for (const [nodeId, nr] of nodeResults) {
      this.memory.store(
        MemoryType.RESULT,
        nr.status === "failed" ? "dag-executor" : `dag:${nodeId}`,
        { ...nr, nodeId },
        {
          tags: ["dag", "node-result", nodeId],
          metadata: { graphId: graph.id, nodeId },
        }
      );
    }

    this.emit("graph:complete", {
      graphId: graph.id,
      status,
      totalDuration: Math.round(totalDuration),
    });

    return dagResult;
  }

  // ── Private Helpers ─────────────────────────────────

  /**
   * Return nodes whose `dependsOn` are all in the `completed` set and that
   * haven't themselves been completed yet.
   */
  private resolveReadyNodes(
    graph: DAGGraph,
    completed: Set<string>,
    _context: Record<string, unknown>
  ): DAGNode[] {
    return graph.nodes.filter((node) => {
      if (completed.has(node.id)) return false;
      return node.dependsOn.every((dep) => completed.has(dep));
    });
  }

  /**
   * Check whether a node should run based on its optional condition function.
   * If no condition is defined the node always runs.
   */
  private shouldRunNode(
    node: DAGNode,
    context: Record<string, unknown>
  ): boolean {
    if (!node.condition) return true;
    try {
      return node.condition(context);
    } catch {
      // If the condition throws, treat it as "don't run"
      return false;
    }
  }

  /**
   * Execute a single node: emit start, run the agent, store result, emit end.
   */
  private async executeNode(
    node: DAGNode,
    context: Record<string, unknown>
  ): Promise<DAGNodeResult> {
    const agent = this.agents.get(node.agentName);
    if (!agent) {
      const err = new Error(
        `Agent "${node.agentName}" not found for node "${node.id}"`
      );
      this.emit("node:error", {
        nodeId: node.id,
        agentName: node.agentName,
        error: err.message,
      });
      throw err;
    }

    this.emit("node:start", { nodeId: node.id, agentName: node.agentName });

    const start = performance.now();

    try {
      const result = await agent.execute({
        taskId: `${node.id}-${Date.now()}`,
        goal: `Execute DAG node: ${node.id}`,
        context: { ...context, dagNodeId: node.id },
      });

      const duration = performance.now() - start;

      // Merge agent output into context so downstream nodes can access it.
      if (result && typeof result === "object") {
        context[node.id] = {
          status: result.status,
          summary: result.summary,
          artifacts: result.artifacts,
        };
      }

      const nodeResult: DAGNodeResult = {
        status: result?.status === "failed" ? "failed" : "completed",
        duration: Math.round(duration),
        artifacts: result?.artifacts ?? [],
      };

      this.emit("node:complete", {
        nodeId: node.id,
        agentName: node.agentName,
        duration: nodeResult.duration,
        status: nodeResult.status,
      });

      return nodeResult;
    } catch (err: unknown) {
      const duration = performance.now() - start;
      const message = err instanceof Error ? err.message : String(err);

      this.emit("node:error", {
        nodeId: node.id,
        agentName: node.agentName,
        error: message,
      });

      return {
        status: "failed",
        duration: Math.round(duration),
        artifacts: [],
      };
    }
  }

  // ── Validation ──────────────────────────────────────

  /**
   * Validate a DAG graph before execution:
   * - All dependsOn references point to existing nodes
   * - No cycles exist (topological sort / DFS detection)
   * - All referenced agents are registered
   */
  private validateGraph(
    graph: DAGGraph,
    allNodeIds: Set<string>
  ): void {
    // Check for dangling dependencies
    for (const node of graph.nodes) {
      for (const dep of node.dependsOn) {
        if (!allNodeIds.has(dep)) {
          throw new Error(
            `Node "${node.id}" depends on unknown node "${dep}"`
          );
        }
      }
    }

    // Check for cycles via DFS
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const adjacency = new Map<string, string[]>();

    for (const node of graph.nodes) {
      adjacency.set(node.id, node.dependsOn);
    }

    const hasCycle = (nodeId: string): boolean => {
      if (inStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      inStack.add(nodeId);

      for (const dep of adjacency.get(nodeId) ?? []) {
        if (hasCycle(dep)) return true;
      }

      inStack.delete(nodeId);
      return false;
    };

    for (const node of graph.nodes) {
      if (hasCycle(node.id)) {
        throw new Error(
          `Cycle detected in DAG graph "${graph.name}" involving node "${node.id}"`
        );
      }
    }

    // Check that all referenced agents exist
    for (const node of graph.nodes) {
      if (!this.agents.has(node.agentName)) {
        throw new Error(
          `Node "${node.id}" references unknown agent "${node.agentName}"`
        );
      }
    }
  }
}

// ─── Builder Helpers ────────────────────────────────────

/**
 * Build a sequential (linear) graph where each step depends on the previous.
 *
 * ```ts
 * buildSequentialGraph("build", [
 *   { agentName: "architect" },
 *   { agentName: "coder" },
 *   { agentName: "reviewer" },
 * ]);
 * ```
 * produces: architect → coder → reviewer
 */
export function buildSequentialGraph(
  name: string,
  steps: { agentName: string; condition?: (ctx: Record<string, unknown>) => boolean }[]
): DAGGraph {
  const id = `dag-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  const nodes: DAGNode[] = steps.map((step, i) => ({
    id: `step-${i}-${step.agentName}`,
    agentName: step.agentName,
    dependsOn: i === 0 ? [] : [`step-${i - 1}-${steps[i - 1].agentName}`],
    condition: step.condition,
  }));

  return { id, name, nodes };
}

/**
 * Build a parallel graph where each group runs concurrently, and each group
 * depends on all nodes in the previous group completing.
 *
 * ```ts
 * buildParallelGraph("analyze", [
 *   [{ agentName: "frontend-analyzer" }, { agentName: "backend-analyzer" }],
 *   [{ agentName: "summarizer" }],
 * ]);
 * ```
 * produces: { frontend, backend } → summarizer
 */
export function buildParallelGraph(
  name: string,
  groups: { agentName: string; condition?: (ctx: Record<string, unknown>) => boolean }[][]
): DAGGraph {
  const id = `dag-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  const nodes: DAGNode[] = [];

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    for (let s = 0; s < group.length; s++) {
      const step = group[s];
      const nodeId = `group-${g}-step-${s}-${step.agentName}`;

      let dependsOn: string[] = [];
      if (g > 0) {
        // Depend on every node in the previous group
        const prevGroup = groups[g - 1];
        dependsOn = prevGroup.map(
          (_prev, ps) =>
            `group-${g - 1}-step-${ps}-${prevGroup[ps].agentName}`
        );
      }

      nodes.push({
        id: nodeId,
        agentName: step.agentName,
        dependsOn,
        condition: step.condition,
      });
    }
  }

  return { id, name, nodes };
}

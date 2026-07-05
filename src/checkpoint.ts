/**
 * 🔖 BOWO Checkpoint Manager
 *
 * Pipeline checkpointing system inspired by LangGraph checkpointing.
 * Persists pipeline state as JSON files so workflows can resume
 * after interruption or failure.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// ─── Types ──

export interface Checkpoint {
  id: string;
  pipelineId: string;
  stepIndex: number;
  status: string;
  context: any;
  nodeResults: any;
  timestamp: string;
}

// ─── CheckpointManager ──

export class CheckpointManager {
  private outputDir: string;

  constructor(outputDir?: string) {
    this.outputDir = outputDir ?? "output/checkpoints";
    // Ensure output directory exists
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  /** Save a checkpoint to a JSON file. */
  save(checkpoint: Checkpoint): void {
    const filePath = this.filePath(checkpoint.id);
    fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), "utf-8");
  }

  /** Load a checkpoint by its ID. Returns null if not found. */
  load(checkpointId: string): Checkpoint | null {
    const filePath = this.filePath(checkpointId);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Checkpoint;
  }

  /** List all checkpoints belonging to a pipeline, sorted ascending by stepIndex. */
  listByPipeline(pipelineId: string): Checkpoint[] {
    if (!fs.existsSync(this.outputDir)) return [];

    const files = fs.readdirSync(this.outputDir).filter((f) => f.endsWith(".json"));
    const checkpoints: Checkpoint[] = [];

    for (const file of files) {
      const raw = fs.readFileSync(path.join(this.outputDir, file), "utf-8");
      const cp = JSON.parse(raw) as Checkpoint;
      if (cp.pipelineId === pipelineId) {
        checkpoints.push(cp);
      }
    }

    return checkpoints.sort((a, b) => a.stepIndex - b.stepIndex);
  }

  /** Get the most recent checkpoint for a pipeline (highest stepIndex). */
  getLatest(pipelineId: string): Checkpoint | null {
    const all = this.listByPipeline(pipelineId);
    return all.length > 0 ? all[all.length - 1] : null;
  }

  /** Delete a checkpoint file by ID. */
  delete(checkpointId: string): void {
    const filePath = this.filePath(checkpointId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Auto-create and save a checkpoint for the given pipeline step.
   * Generates an ID and timestamp automatically.
   */
  autoSave(
    pipelineId: string,
    stepIndex: number,
    context: any,
    nodeResults: any,
  ): Checkpoint {
    const checkpoint: Checkpoint = {
      id: crypto.randomUUID(),
      pipelineId,
      stepIndex,
      status: "saved",
      context,
      nodeResults,
      timestamp: new Date().toISOString(),
    };
    this.save(checkpoint);
    return checkpoint;
  }

  // ─── Internal ──

  private filePath(checkpointId: string): string {
    return path.join(this.outputDir, `${checkpointId}.json`);
  }
}

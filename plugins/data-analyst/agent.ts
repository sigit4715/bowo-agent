/**
 * Plugin: data-analyst
 * Custom agent for BOWO framework.
 */

import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult } from "../../src/agents/base.js";
import type { BowoMemory } from "../../src/memory.js";
import type { Communication } from "../../src/communication.js";
import { MemoryType } from "../../src/memory.js";

const Data-analystConfig: AgentConfig = {
  name: "data-analyst",
  role: "data-analyst Specialist",
  description: "Custom data-analyst agent",
  emoji: "🔧",
  priority: 5,
  enabled: true,
  systemPrompt: `You are the data-analyst agent. Do your thing.`,
  capabilities: ["data-analyst"],
};

export class Data-analystAgent extends BaseAgent {
  constructor(memory: BowoMemory, comm: Communication) {
    super(Data-analystConfig, memory, comm);
  }

  async execute(task: TaskInput): Promise<TaskResult> {
    const start = Date.now();

    // Use LLM if available
    if (this.llm.isAvailable()) {
      const response = await this.askLLM(
        `Execute the following task: ${task.description}\n\nContext: ${JSON.stringify(task.context)}`
      );

      return this.success(
        { result: response },
        [{ name: "output.md", type: "document", content: response }],
        [],
        Date.now() - start
      );
    }

    // Offline fallback
    return this.success(
      { message: "[data-analyst] Offline mode — task received: " + task.description },
      [],
      ["Configure LLM to enable AI reasoning"],
      Date.now() - start
    );
  }
}

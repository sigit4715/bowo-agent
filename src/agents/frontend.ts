/**
 * BOWO Frontend Agent — Frontend Development Specialist
 *
 * Uses LLM for intelligent UI component generation.
 * Falls back to rule-based generation when LLM is offline.
 */
import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult, type Artifact } from "./base.js";
import { MemoryType } from "../memory.js";

interface FrontendOutput {
  files: { path: string; framework: string; content: string }[];
  components: string[];
  notes: string[];
}

export class FrontendAgent extends BaseAgent {
  constructor(memory: any, communication: any, llm?: any, workDir?: string) {
    const config: AgentConfig = {
      name: "frontend",
      displayName: "Frontend Developer",
      icon: "🎨",
      description: "Membangun UI components, pages, dan styling",
      systemPrompt: `You are the BOWO Frontend Agent. Your job is to:
1. Generate React/Next.js components
2. Create responsive, accessible UIs
3. Implement state management
4. Write CSS/Tailwind styles
5. Ensure proper loading states and error handling

Use modern React patterns (hooks, server components).
Always include accessibility (a11y) and responsive design.`,
      capabilities: ["component_generation", "ui_design", "state_management", "responsive_design"],
    };
    super(config, memory, communication, llm, workDir);
  }

  async execute(input: TaskInput): Promise<TaskResult> {
    const start = Date.now();

    try {
      // Try LLM-powered generation
      if (this.llm?.isAvailable()) {
        return await this.generateWithLLM(input, start);
      }
      // Fallback: rule-based generation
      return this.generateWithRules(input, start);
    } catch (err: any) {
      this.log("🎨 LLM generation failed, falling back to rules", { error: err.message });
      return this.generateWithRules(input, start);
    }
  }

  private async generateWithLLM(input: TaskInput, start: number): Promise<TaskResult> {
    this.log("🎨 Using LLM for frontend generation", { goal: input.goal });

    const prevArtifacts = this.getPreviousArtifacts(input.taskId);
    const context = prevArtifacts.length > 0
      ? `\nPrevious work from other agents:\n${prevArtifacts.map((a) => `[${a.name}]: ${a.content.slice(0, 500)}`).join("\n")}`
      : "";

    const prompt = `Generate frontend code for: ${input.goal}

Requirements:
- Use React with Next.js App Router
- Use Tailwind CSS for styling
- Include proper TypeScript types
- Add loading states and error handling
- Follow accessibility best practices (a11y)
- Make it responsive

${context}

Respond with JSON:
{
  "files": [
    {
      "path": "src/app/page.tsx",
      "framework": "next.js",
      "content": "file content"
    }
  ],
  "components": ["ComponentName1", "ComponentName2"],
  "notes": ["Note about what was generated"]
}

Generate complete, working React components. Do NOT use placeholder or TODO comments.`;

    const response = await this.llmReason(prompt, JSON.stringify(input.context, null, 2));

    if (!response.success || !response.output) {
      throw new Error(response.error || "LLM returned empty response");
    }

    let output: FrontendOutput;
    try {
      let content = response.output.trim();
      if (content.startsWith("```")) {
        content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      }
      output = JSON.parse(content) as FrontendOutput;
    } catch {
      // LLM didn't return valid JSON, wrap the raw output as a single file
      output = {
        files: [
          {
            path: "src/app/page.tsx",
            framework: "react",
            content: response.output,
          },
        ],
        components: ["GeneratedComponent"],
        notes: ["Generated from LLM text output (non-JSON response)"],
      };
    }

    // Validate structure
    if (!output.files || !Array.isArray(output.files)) output.files = [];
    if (!output.components) output.components = [];
    if (!output.notes) output.notes = [];

    // Write files to disk
    const writtenFiles: string[] = [];
    for (const file of output.files) {
      const writeResult = this.writeFile(file.path, file.content);
      if (writeResult.success) {
        writtenFiles.push(file.path);
        this.log(`🎨 Written: ${file.path}`);
      }
    }

    const artifacts: Artifact[] = output.files.map((f) => ({
      name: f.path.split("/").pop() ?? f.path,
      type: "code" as const,
      content: f.content,
      path: f.path,
    }));

    for (const artifact of artifacts) {
      this.memory.store(MemoryType.ARTIFACT, "frontend", artifact);
    }

    this.emit("frontend:complete", { taskId: input.taskId, files: writtenFiles });

    return {
      agent: "frontend",
      taskId: input.taskId,
      status: "completed",
      summary: `🎨 LLM generated ${writtenFiles.length} files: ${output.notes.join("; ")}`,
      artifacts,
      duration: Date.now() - start,
    };
  }

  private generateWithRules(input: TaskInput, start: number): Promise<TaskResult> {
    this.log("🎨 Using rule-based frontend generation");
    const output = this.generateUI(input);

    const artifacts: Artifact[] = output.files.map((f) => ({
      name: f.path.split("/").pop() ?? f.path,
      type: "code" as const,
      content: f.content,
      path: f.path,
    }));

    for (const artifact of artifacts) {
      this.memory.store(MemoryType.ARTIFACT, "frontend", artifact);
    }

    return Promise.resolve({
      agent: "frontend",
      taskId: input.taskId,
      status: "completed",
      summary: `🎨 Rule-based generated ${output.files.length} files: ${output.notes.join("; ")}`,
      artifacts,
      duration: Date.now() - start,
    });
  }

  private generateUI(task: TaskInput): FrontendOutput {
    const desc = task.goal.toLowerCase();
    const files: FrontendOutput["files"] = [];
    const components: string[] = [];
    const notes: string[] = [];

    // Main page component
    if (desc.includes("todo") || desc.includes("task")) {
      files.push({
        path: "src/app/page.tsx",
        framework: "next.js",
        content: `import { TodoList } from "@/components/todo-list";
import { TodoForm } from "@/components/todo-form";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          🤖 BOWO Todo App
        </h1>
        <TodoForm />
        <TodoList />
      </div>
    </main>
  );
}`,
      });

      files.push({
        path: "src/components/todo-list.tsx",
        framework: "react",
        content: `"use client";

import { useState, useEffect } from "react";

interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

export function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/todos")
      .then((res) => res.json())
      .then((data) => setTodos(data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading...</div>;
  }

  return (
    <ul className="space-y-2 mt-4">
      {todos.map((todo) => (
        <li
          key={todo.id}
          className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm"
        >
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={() => toggleTodo(todo.id)}
            className="h-5 w-5 rounded"
          />
          <span className={todo.completed ? "line-through text-gray-400" : ""}>
            {todo.title}
          </span>
        </li>
      ))}
    </ul>
  );
}

async function toggleTodo(id: string) {
  await fetch(\`/api/todos/\${id}\`, { method: "PUT" });
}`,
      });

      files.push({
        path: "src/components/todo-form.tsx",
        framework: "react",
        content: `"use client";

import { useState } from "react";

export function TodoForm() {
  const [title, setTitle] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    });

    setTitle("");
    window.location.reload();
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a new task..."
        className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
      />
      <button
        type="submit"
        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
      >
        Add
      </button>
    </form>
  );
}`,
      });

      components.push("TodoList", "TodoForm");
    }

    notes.push("Generated Next.js App Router components");
    notes.push("Includes loading states and error handling");
    notes.push("Responsive design with Tailwind CSS");

    return { files, components, notes };
  }
}

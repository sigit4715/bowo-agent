import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export interface FeedbackEntry {
  id: string;
  taskId: string;
  agent: string;
  rating: number;        // 1-5
  comment?: string;
  timestamp: string;
}

export interface AgentPerformance {
  agent: string;
  totalTasks: number;
  averageRating: number;
  ratingDistribution: Record<number, number>;
  recentFeedback: FeedbackEntry[];
}

export interface Recommendation {
  agent: string;
  type: 'strength' | 'improvement';
  description: string;
  basedOn: string[];
}

const LEARNING_DIR = join(process.cwd(), 'output', 'learning');
const FEEDBACK_FILE = join(LEARNING_DIR, 'feedback.json');

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export class AgentLearner {
  private feedback: FeedbackEntry[] = [];

  constructor() {
    ensureDir(LEARNING_DIR);
    this.loadFeedback();
  }

  private loadFeedback(): void {
    if (existsSync(FEEDBACK_FILE)) {
      try {
        const raw = readFileSync(FEEDBACK_FILE, 'utf-8');
        this.feedback = JSON.parse(raw);
      } catch {
        this.feedback = [];
      }
    }
  }

  private saveFeedback(): void {
    writeFileSync(FEEDBACK_FILE, JSON.stringify(this.feedback, null, 2), 'utf-8');
  }

  async recordFeedback(
    taskId: string,
    agent: string,
    rating: number,
    comment?: string,
  ): Promise<FeedbackEntry> {
    const entry: FeedbackEntry = {
      id: randomUUID(),
      taskId,
      agent,
      rating: Math.max(1, Math.min(5, Math.round(rating))),
      comment,
      timestamp: new Date().toISOString(),
    };

    this.feedback.push(entry);
    this.saveFeedback();
    return entry;
  }

  async getAgentPerformance(agent: string): Promise<AgentPerformance> {
    const entries = this.feedback.filter((f) => f.agent === agent);

    if (entries.length === 0) {
      return {
        agent,
        totalTasks: 0,
        averageRating: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        recentFeedback: [],
      };
    }

    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const entry of entries) {
      sum += entry.rating;
      ratingDistribution[entry.rating] = (ratingDistribution[entry.rating] ?? 0) + 1;
    }

    const sorted = [...entries].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return {
      agent,
      totalTasks: entries.length,
      averageRating: sum / entries.length,
      ratingDistribution,
      recentFeedback: sorted.slice(0, 10),
    };
  }

  async getRecommendations(agent: string): Promise<Recommendation[]> {
    const perf = await this.getAgentPerformance(agent);
    const recommendations: Recommendation[] = [];

    if (perf.totalTasks === 0) {
      return [{
        agent,
        type: 'improvement',
        description: 'No feedback recorded yet. Run more tasks to get recommendations.',
        basedOn: [],
      }];
    }

    // Strength: high average rating
    if (perf.averageRating >= 4) {
      const highRatedComments = this.feedback
        .filter((f) => f.agent === agent && f.rating >= 4 && f.comment)
        .map((f) => f.comment!);
      recommendations.push({
        agent,
        type: 'strength',
        description: `Consistently high performance with average rating of ${perf.averageRating.toFixed(1)}/5`,
        basedOn: highRatedComments.slice(0, 3),
      });
    }

    // Improvement: low average rating
    if (perf.averageRating < 3 && perf.totalTasks >= 2) {
      const lowRatedComments = this.feedback
        .filter((f) => f.agent === agent && f.rating <= 2 && f.comment)
        .map((f) => f.comment!);
      recommendations.push({
        agent,
        type: 'improvement',
        description: `Performance needs improvement: average rating is ${perf.averageRating.toFixed(1)}/5`,
        basedOn: lowRatedComments.slice(0, 3),
      });
    }

    // Improvement: lots of low ratings
    const lowCount = (perf.ratingDistribution[1] ?? 0) + (perf.ratingDistribution[2] ?? 0);
    if (lowCount >= 3) {
      recommendations.push({
        agent,
        type: 'improvement',
        description: `${lowCount} tasks rated 1-2 stars. Review failing patterns.`,
        basedOn: this.feedback
          .filter((f) => f.agent === agent && f.rating <= 2 && f.comment)
          .map((f) => f.comment!)
          .slice(0, 3),
      });
    }

    // Strength: 5-star streak
    const fiveStarCount = perf.ratingDistribution[5] ?? 0;
    if (fiveStarCount >= 3) {
      recommendations.push({
        agent,
        type: 'strength',
        description: `${fiveStarCount} perfect 5-star ratings. Strong pattern of success.`,
        basedOn: [],
      });
    }

    return recommendations;
  }

  async improvePrompt(
    agent: string,
    feedback: string,
  ): Promise<string> {
    const perf = await this.getAgentPerformance(agent);
    const recs = await this.getRecommendations(agent);

    const prompt = `You are improving an AI agent's system prompt.

Agent: ${agent}
Average rating: ${perf.averageRating.toFixed(1)}/5 across ${perf.totalTasks} tasks
Recent issues: ${perf.recentFeedback.filter((f) => f.comment).map((f) => `[${f.rating}/5] ${f.comment}`).join('\n') || 'None'}

Recommendations:
${recs.map((r) => `- [${r.type}] ${r.description}`).join('\n') || 'No specific recommendations yet.'}

New feedback to incorporate:
"${feedback}"

Generate an improved system prompt section for this agent that addresses the feedback and recommendations. Output only the improved prompt text, nothing else.`;

    try {
      const result = execSync(`hermes chat -q "${prompt.replace(/"/g, '\\"')}" -Q`, {
        encoding: 'utf-8',
        timeout: 60_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return result.trim();
    } catch {
      return `// Prompt improvement for ${agent}\n// Feedback: ${feedback}\n// Average rating: ${perf.averageRating.toFixed(1)}/5\n// TODO: Manual review recommended`;
    }
  }

  async getHistory(agent: string): Promise<FeedbackEntry[]> {
    return this.feedback
      .filter((f) => f.agent === agent)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
}

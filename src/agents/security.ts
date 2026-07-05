/**
 * BOWO Security Agent — Security Audit & Hardening
 */

import { BaseAgent, type AgentConfig, type TaskInput, type TaskResult, type Artifact } from "./base.js";
import { MemoryType } from "../memory.js";

const CONFIG: AgentConfig = {
  name: "security",
  displayName: "Security Auditor",
  icon: "🔒",
  description: "Scans for vulnerabilities, reviews auth logic, and recommends security improvements",
  systemPrompt: `You are a security expert. Scan for vulnerabilities, review authentication, and recommend security improvements.`,
  capabilities: ["vulnerability-scanning", "auth-review", "security-hardening", "compliance"],
};

export class SecurityAgent extends BaseAgent {
  constructor(memory: any, communication: any, llm?: any, workDir?: string) {
    super(CONFIG, memory, communication, llm, workDir);
  }

  async execute(input: TaskInput): Promise<TaskResult> {
    const start = Date.now();
    this.log("🔒 Security audit started", { goal: input.goal });

    // Try LLM-enhanced analysis first, fall back to rules
    if (this.llm?.isAvailable()) {
      try {
        return await this.auditWithLLM(input, start);
      } catch (err: any) {
        this.log("⚠️ LLM security analysis failed, falling back to rules", { error: err.message });
      }
    }

    return await this.auditWithRules(input, start);
  }

  /**
   * LLM-enhanced security analysis — asks the model to analyze for
   * vulnerabilities, check OWASP Top 10, and suggest fixes.
   */
  private async auditWithLLM(input: TaskInput, start: number): Promise<TaskResult> {
    const context = typeof input.context?.code === "string"
      ? `Code to analyze:\n\`\`\`\n${input.context.code}\n\`\`\``
      : `Project context: ${JSON.stringify(input.context ?? {})}`;

    const prompt = `Perform a comprehensive security audit for the following goal:
"${input.goal}"

Analyze for:
1. Vulnerabilities — check against the OWASP Top 10 (Injection, Broken Auth, Sensitive Data Exposure, XSS, Broken Access Control, Security Misconfiguration, Insecure Deserialization, Using Components with Known Vulnerabilities, Insufficient Logging, SSRF)
2. Input validation and sanitization gaps
3. Authentication and authorization weaknesses
4. Secrets or credentials exposure
5. Rate limiting and abuse prevention

Respond with JSON in this exact structure:
{
  "findings": [
    { "severity": "critical|high|medium|low", "area": "...", "description": "...", "recommendation": "..." }
  ],
  "compliance": ["OWASP A01:...", "OWASP A02:...", "..."],
  "overallRisk": "critical|high|medium|low",
  "summary": "One-paragraph executive summary"
}`;

    const response = await this.askLLM(prompt, context);
    if (!response) {
      throw new Error("askLLM returned null");
    }

    // Try to parse structured JSON from the response
    let parsed: any;
    try {
      // Strip markdown code fences if present
      const cleaned = response.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: extract fields from free-form text
      parsed = {
        findings: [{ severity: "medium", area: "General", description: "LLM analysis completed", recommendation: response }],
        compliance: ["OWASP Top 10"],
        overallRisk: "medium",
        summary: response.slice(0, 500),
      };
    }

    const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
    const compliance = Array.isArray(parsed.compliance) ? parsed.compliance : ["OWASP Top 10"];

    const audit = {
      goal: input.goal,
      findings,
      compliance,
      overallRisk: parsed.overallRisk ?? "medium",
      summary: parsed.summary ?? "",
      source: "llm",
    };

    const artifacts: Artifact[] = [
      { name: "security-audit", type: "report", content: JSON.stringify(audit, null, 2) },
    ];

    for (const artifact of artifacts) {
      this.memory.store(MemoryType.ARTIFACT, "security", artifact);
    }

    return {
      agent: "security", taskId: input.taskId, status: "completed",
      summary: `🔒 Security audit (LLM): ${findings.length} findings, overall risk: ${audit.overallRisk}`,
      artifacts,
      duration: Date.now() - start,
    };
  }

  /**
   * Rule-based security analysis — static keyword/pattern scanning.
   * This is the original fallback logic.
   */
  private async auditWithRules(input: TaskInput, start: number): Promise<TaskResult> {
    try {
      const code = typeof input.context?.code === "string" ? input.context.code : "";

      // Rule-based keyword scanning
      const rules: { pattern: RegExp; severity: string; area: string; recommendation: string }[] = [
        { pattern: /eval\s*\(/g, severity: "critical", area: "Code Injection", recommendation: "Remove eval() calls — use safe alternatives" },
        { pattern: /innerHTML\s*=/g, severity: "high", area: "XSS", recommendation: "Use textContent or sanitize HTML before inserting" },
        { pattern: /password|secret|token|api[_-]?key/gi, severity: "medium", area: "Secrets Exposure", recommendation: "Ensure secrets are stored in environment variables, not hardcoded" },
        { pattern: /SELECT\s+.*\s+FROM/gi, severity: "high", area: "SQL Injection", recommendation: "Use parameterized queries instead of string interpolation" },
        { pattern: /dangerouslySetInnerHTML/g, severity: "high", area: "XSS (React)", recommendation: "Sanitize input before using dangerouslySetInnerHTML" },
        { pattern: /http:\/\//g, severity: "low", area: "Transport Security", recommendation: "Prefer HTTPS over HTTP" },
        { pattern: /cors|Access-Control-Allow-Origin/gi, severity: "medium", area: "CORS Configuration", recommendation: "Restrict CORS to trusted origins" },
      ];

      const findings: { severity: string; area: string; recommendation: string }[] = [];

      for (const rule of rules) {
        if (rule.pattern.test(code)) {
          findings.push({ severity: rule.severity, area: rule.area, recommendation: rule.recommendation });
        }
      }

      if (findings.length === 0) {
        findings.push(
          { severity: "medium", area: "Authentication", recommendation: "Implement JWT with proper expiration" },
          { severity: "high", area: "Input Validation", recommendation: "Validate and sanitize all user inputs" },
          { severity: "low", area: "Rate Limiting", recommendation: "Add rate limiting to prevent abuse" },
        );
      }

      const audit = {
        goal: input.goal,
        findings,
        compliance: ["OWASP Top 10", "Input Sanitization", "CORS Configuration"],
        source: "rules",
      };

      const artifacts: Artifact[] = [
        { name: "security-audit", type: "report", content: JSON.stringify(audit, null, 2) },
      ];

      for (const artifact of artifacts) {
        this.memory.store(MemoryType.ARTIFACT, "security", artifact);
      }

      return {
        agent: "security", taskId: input.taskId, status: "completed",
        summary: `🔒 Security audit (rules): ${findings.length} findings`,
        artifacts,
        duration: Date.now() - start,
      };
    } catch (err: any) {
      return {
        agent: "security", taskId: input.taskId, status: "failed",
        summary: `❌ Security audit failed: ${err.message}`, artifacts: [],
        duration: Date.now() - start,
      };
    }
  }
}

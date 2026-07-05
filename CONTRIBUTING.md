# Contributing to BOWO

Thank you for your interest in contributing to BOWO! This guide covers everything you need to get started.

## Table of Contents

- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Adding New Agents](#adding-new-agents)
- [Adding New Features](#adding-new-features)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Code of Conduct](#code-of-conduct)

---

## Development Setup

### Prerequisites

- **Node.js** >= 20.x
- **pnpm** >= 9.x (preferred) or npm
- **Git**
- Hermes Agent installed at the path configured in your `.env`

### Getting Started

1. **Fork and clone** the repository:

   ```bash
   git clone https://github.com/<your-username>/bowo-agent.git
   cd bowo-agent
   ```

2. **Install dependencies**:

   ```bash
   pnpm install
   ```

3. **Set up environment variables**:

   ```bash
   cp .env.example .env
   # Edit .env with your local settings (API keys, ports, etc.)
   ```

4. **Create the output directory**:

   ```bash
   mkdir -p output/database
   ```

5. **Run the dev server**:

   ```bash
   pnpm dev
   ```

6. **Verify** the server is running on the port specified in `BOWO_PORT` (default: `3001`).

---

## Code Style

BOWO uses **TypeScript in strict mode** with **ES modules** throughout.

### General Rules

- **Strict TypeScript** — all source files must compile under `"strict": true` in `tsconfig.json`.
- **ES Modules** — use `import`/`export` syntax exclusively. No CommonJS `require()`.
- **2-space indentation** — spaces, not tabs.
- **Single quotes** for strings.
- **Trailing commas** in multi-line structures.
- **Semicolons** required at end of statements.
- **No unused variables** — the compiler and linter enforce this.

### Formatting & Linting

```bash
# Format all files
pnpm format

# Lint all files
pnpm lint

# Type-check without emitting
pnpm typecheck
```

Run all three before committing. CI will reject PRs that fail.

### File & Naming Conventions

| Item              | Convention            | Example              |
|-------------------|-----------------------|----------------------|
| Files             | `kebab-case`          | `my-feature.ts`      |
| Classes           | `PascalCase`          | `MyFeature`          |
| Functions/Methods | `camelCase`           | `myFeature()`        |
| Constants         | `UPPER_SNAKE_CASE`    | `MAX_RETRIES`        |
| Interfaces/Types  | `PascalCase` (no `I` prefix) | `AgentConfig` |

---

## Adding New Agents

Agents are the core abstraction in BOWO. Each agent encapsulates a specific capability or workflow.

### Step 1: Create the Agent File

Create a new file under `src/agents/`:

```
src/agents/
├── my-new-agent.ts
```

### Step 2: Implement the Agent Interface

```typescript
import type { Agent, AgentContext, AgentResult } from '../types';

export class MyNewAgent implements Agent {
  readonly name = 'my-new-agent';
  readonly description = 'Does something useful';

  async run(ctx: AgentContext): Promise<AgentResult> {
    // Your agent logic here
    return { success: true, data: {} };
  }
}
```

### Step 3: Register the Agent

Add your agent to the agent registry (see existing agents for the pattern):

```typescript
import { MyNewAgent } from './agents/my-new-agent';

export const agents = [
  // ... existing agents
  new MyNewAgent(),
];
```

### Step 4: Write Tests

Create a corresponding test file under `src/agents/__tests__/`:

```
src/agents/__tests__/my-new-agent.test.ts
```

See [Testing](#testing) for requirements.

### Step 5: Update Documentation

- Add a section to `README.md` describing your agent.
- Document any new environment variables in `.env.example`.

---

## Adding New Features

1. **Open an issue first** — describe the feature, motivation, and rough approach. Get alignment before writing code.

2. **Branch from `main`**:

   ```bash
   git checkout -b feature/my-feature main
   ```

3. **Keep changes focused** — one feature per PR. If your change touches multiple concerns, split them into stacked PRs.

4. **Follow existing patterns** — look at similar code in the codebase and match its structure, naming, and error handling.

5. **Add or update tests** — every new feature and bug fix must include tests.

6. **Update docs** — if the feature is user-facing, update `README.md` and relevant doc comments.

---

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

### Requirements

- **Every PR must have passing tests.** CI enforces this.
- **New features** require new test files covering happy path and edge cases.
- **Bug fixes** require a regression test that reproduces the bug.
- **Coverage threshold**: maintain at least **80% line coverage**.
- Test files live alongside source files in `__tests__/` directories or use `*.test.ts` suffixes.
- Use **descriptive test names** that explain the expected behavior:

  ```typescript
  it('should return an error when the API key is missing', async () => {
    // ...
  });
  ```

---

## Pull Request Process

### Before Opening a PR

- [ ] Code compiles with `pnpm typecheck` (zero errors)
- [ ] Linting passes with `pnpm lint` (zero warnings)
- [ ] All tests pass with `pnpm test`
- [ ] Branch is rebased on latest `main`

### PR Template

```markdown
## What

Brief description of the change.

## Why

Motivation / link to issue.

## How

Implementation approach and key decisions.

## Testing

What was tested and how.

## Checklist

- [ ] Type-check passes
- [ ] Lint passes
- [ ] Tests pass (new + existing)
- [ ] Docs updated (if applicable)
```

### Review Process

1. **Open the PR** against `main` with a clear title and description.
2. **CI runs automatically** — must pass before review begins.
3. **At least one approval** is required from a maintainer.
4. **Address feedback** — push new commits (don't force-push during review so reviewers can see diffs).
5. **Squash and merge** — maintainers will squash-merge your PR to keep history clean.

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive experience for everyone. We do not tolerate harassment or discrimination of any kind.

### Expected Behavior

- **Be respectful** — treat all contributors with dignity and professionalism.
- **Be constructive** — give feedback that helps improve the project and the person's work.
- **Be collaborative** — share knowledge, ask questions, and help others.
- **Be patient** — remember that people have different experience levels and backgrounds.

### Unacceptable Behavior

- Harassment, trolling, or personal attacks of any kind.
- Discriminatory language or imagery.
- Publishing others' private information without consent.
- Any other conduct that would be considered inappropriate in a professional setting.

### Enforcement

Project maintainers have the right to remove, edit, or reject comments, commits, code, issues, and other contributions that do not align with this Code of Conduct. Contributors who violate these standards may be temporarily or permanently banned from the project.

### Reporting

If you experience or witness unacceptable behavior, report it by contacting the project maintainers directly. All reports will be handled confidentially.

---

## Questions?

Open a [GitHub Discussion](https://github.com/nousresearch/bowo-agent/discussions) or reach out to the maintainers. We're happy to help!

---

*Thank you for contributing to BOWO!*

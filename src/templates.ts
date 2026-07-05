import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateFile {
  /** Relative path inside the generated project */
  path: string;
  /** Raw file content (string) */
  content: string;
}

export interface ProjectTemplate {
  /** Machine-readable identifier (e.g. "express-rest-api") */
  name: string;
  /** Human-friendly short description */
  description: string;
  /** Files to create relative to the target directory */
  files: TemplateFile[];
  /** Shell commands to run after scaffolding (e.g. npm install) */
  installCommands: string[];
}

// ---------------------------------------------------------------------------
// Built-in templates
// ---------------------------------------------------------------------------

const expressRestApi: ProjectTemplate = {
  name: 'express-rest-api',
  description: 'RESTful API server built with Express, TypeScript, and structured routes.',
  files: [
    {
      path: 'package.json',
      content: `{
  "name": "express-rest-api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0"
  }
}
`,
    },
    {
      path: 'tsconfig.json',
      content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
`,
    },
    {
      path: 'src/index.ts',
      content: `import express from 'express';
import { healthRouter } from './routes/health.js';
import { usersRouter } from './routes/users.js';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

// Routes
app.use('/health', healthRouter);
app.use('/api/users', usersRouter);

app.listen(PORT, () => {
  console.log(\`🚀 Server running on http://localhost:\${PORT}\`);
});
`,
    },
    {
      path: 'src/routes/health.ts',
      content: `import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
`,
    },
    {
      path: 'src/routes/users.ts',
      content: `import { Router } from 'express';

export const usersRouter = Router();

interface User {
  id: number;
  name: string;
  email: string;
}

const users: User[] = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
];

usersRouter.get('/', (_req, res) => {
  res.json(users);
});

usersRouter.get('/:id', (req, res) => {
  const user = users.find((u) => u.id === Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

usersRouter.post('/', (req, res) => {
  const { name, email } = req.body as Omit<User, 'id'>;
  const newUser: User = { id: users.length + 1, name, email };
  users.push(newUser);
  res.status(201).json(newUser);
});
`,
    },
    {
      path: '.gitignore',
      content: `node_modules
dist
.env
`,
    },
  ],
  installCommands: ['npm install'],
};

// ---------------------------------------------------------------------------

const reactWebApp: ProjectTemplate = {
  name: 'react-web-app',
  description: 'React 18 single-page app with Vite, TypeScript, and a starter component.',
  files: [
    {
      path: 'package.json',
      content: `{
  "name": "react-web-app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
`,
    },
    {
      path: 'tsconfig.json',
      content: `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
`,
    },
    {
      path: 'vite.config.ts',
      content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`,
    },
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React Web App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: 'src/main.tsx',
      content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
    },
    {
      path: 'src/App.tsx',
      content: `import { useState } from 'react';

export function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', textAlign: 'center' }}>
      <h1>🚀 React Web App</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </div>
  );
}
`,
    },
    {
      path: 'src/vite-env.d.ts',
      content: `/// <reference types="vite/client" />
`,
    },
    {
      path: '.gitignore',
      content: `node_modules
dist
.env
`,
    },
  ],
  installCommands: ['npm install'],
};

// ---------------------------------------------------------------------------

const cliTool: ProjectTemplate = {
  name: 'cli-tool',
  description: 'Node.js CLI tool with argument parsing, help output, and a build pipeline.',
  files: [
    {
      path: 'package.json',
      content: `{
  "name": "cli-tool",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "cli-tool": "dist/index.js"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "commander": "^12.1.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "@types/node": "^22.0.0"
  }
}
`,
    },
    {
      path: 'tsconfig.json',
      content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
`,
    },
    {
      path: 'src/index.ts',
      content: `#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('cli-tool')
  .description('A starter CLI tool scaffolded by bowo-agent')
  .version('1.0.0');

program
  .command('greet')
  .description('Greet a person by name')
  .argument('[name]', 'Who to greet', 'World')
  .action((name: string) => {
    console.log(\`Hello, \${name}! 👋\`);
  });

program
  .command('info')
  .description('Print environment information')
  .action(() => {
    console.log(\`Node:    \${process.version}\`);
    console.log(\`Platform: \${process.platform}\`);
    console.log(\`Arch:     \${process.arch}\`);
    console.log(\`CWD:      \${process.cwd()}\`);
  });

program.parse();
`,
    },
    {
      path: '.gitignore',
      content: `node_modules
dist
`,
    },
  ],
  installCommands: ['npm install'],
};

// ---------------------------------------------------------------------------

const fullstackApp: ProjectTemplate = {
  name: 'fullstack-app',
  description: 'Monorepo with an Express backend and a Vite React frontend.',
  files: [
    {
      path: 'package.json',
      content: `{
  "name": "fullstack-app",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently \\"npm run dev:server\\" \\"npm run dev:client\\"",
    "dev:server": "tsx watch server/src/index.ts",
    "dev:client": "cd client && vite",
    "build": "cd client && tsc && vite build"
  },
  "devDependencies": {
    "concurrently": "^9.0.0"
  }
}
`,
    },
    {
      path: 'server/package.json',
      content: `{
  "name": "fullstack-server",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "express": "^4.21.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0"
  }
}
`,
    },
    {
      path: 'server/tsconfig.json',
      content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
`,
    },
    {
      path: 'server/src/index.ts',
      content: `import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/message', (_req, res) => {
  res.json({ message: 'Hello from the fullstack server!' });
});

app.listen(PORT, () => {
  console.log(\`🚀 Server running on http://localhost:\${PORT}\`);
});
`,
    },
    {
      path: 'client/package.json',
      content: `{
  "name": "fullstack-client",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
`,
    },
    {
      path: 'client/tsconfig.json',
      content: `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
`,
    },
    {
      path: 'client/vite.config.ts',
      content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
`,
    },
    {
      path: 'client/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Fullstack App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: 'client/src/main.tsx',
      content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
    },
    {
      path: 'client/src/App.tsx',
      content: `import { useEffect, useState } from 'react';

export function App() {
  const [message, setMessage] = useState('Loading…');

  useEffect(() => {
    fetch('/api/message')
      .then((r) => r.json())
      .then((data) => setMessage(data.message))
      .catch(() => setMessage('Failed to reach server'));
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', textAlign: 'center' }}>
      <h1>🚀 Fullstack App</h1>
      <p>Server says: <strong>{message}</strong></p>
    </div>
  );
}
`,
    },
    {
      path: 'client/src/vite-env.d.ts',
      content: `/// <reference types="vite/client" />
`,
    },
    {
      path: '.gitignore',
      content: `node_modules
dist
.env
`,
    },
  ],
  installCommands: ['npm install', 'cd server && npm install', 'cd client && npm install'],
};

// ---------------------------------------------------------------------------

const microservice: ProjectTemplate = {
  name: 'microservice',
  description: 'Docker-ready Express microservice with health checks, graceful shutdown, and structured logging.',
  files: [
    {
      path: 'package.json',
      content: `{
  "name": "microservice",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "docker:build": "docker build -t microservice .",
    "docker:run": "docker run -p 3000:3000 microservice"
  },
  "dependencies": {
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0"
  }
}
`,
    },
    {
      path: 'tsconfig.json',
      content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
`,
    },
    {
      path: 'src/index.ts',
      content: `import express from 'express';
import { logger } from './middleware/logger.js';
import { healthRouter } from './routes/health.js';
import { itemsRouter } from './routes/items.js';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());
app.use(logger);

// Routes
app.use('/health', healthRouter);
app.use('/api/items', itemsRouter);

const server = app.listen(PORT, () => {
  console.log(\`🚀 Microservice running on http://localhost:\${PORT}\`);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(\`\n\${signal} received – shutting down gracefully\`);
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 s
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
`,
    },
    {
      path: 'src/middleware/logger.ts',
      content: `import type { Request, Response, NextFunction } from 'express';

export function logger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(\`\${req.method} \${req.originalUrl} → \${res.statusCode} (\${ms}ms)\`);
  });
  next();
}
`,
    },
    {
      path: 'src/routes/health.ts',
      content: `import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get('/ready', (_req, res) => {
  // Add real readiness checks here (DB ping, cache, etc.)
  res.json({ ready: true });
});
`,
    },
    {
      path: 'src/routes/items.ts',
      content: `import { Router } from 'express';

export const itemsRouter = Router();

interface Item {
  id: number;
  name: string;
}

let items: Item[] = [];
let nextId = 1;

itemsRouter.get('/', (_req, res) => {
  res.json(items);
});

itemsRouter.post('/', (req, res) => {
  const { name } = req.body as { name: string };
  const item: Item = { id: nextId++, name };
  items.push(item);
  res.status(201).json(item);
});

itemsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const before = items.length;
  items = items.filter((i) => i.id !== id);
  if (items.length === before) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});
`,
    },
    {
      path: 'Dockerfile',
      content: `FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=base /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=base /app/dist ./dist
EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
`,
    },
    {
      path: '.dockerignore',
      content: `node_modules
dist
.git
*.md
`,
    },
    {
      path: '.gitignore',
      content: `node_modules
dist
.env
`,
    },
  ],
  installCommands: ['npm install'],
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const BUILTIN_TEMPLATES: Map<string, ProjectTemplate> = new Map([
  [expressRestApi.name, expressRestApi],
  [reactWebApp.name, reactWebApp],
  [cliTool.name, cliTool],
  [fullstackApp.name, fullstackApp],
  [microservice.name, microservice],
]);

// ---------------------------------------------------------------------------
// TemplateEngine
// ---------------------------------------------------------------------------

export class TemplateEngine {
  /** Return metadata for every built-in template (name + description). */
  listTemplates(): Array<{ name: string; description: string }> {
    return Array.from(BUILTIN_TEMPLATES.values()).map((t) => ({
      name: t.name,
      description: t.description,
    }));
  }

  /** Retrieve a template by name. Throws if not found. */
  getTemplate(name: string): ProjectTemplate {
    const tpl = BUILTIN_TEMPLATES.get(name);
    if (!tpl) {
      const available = Array.from(BUILTIN_TEMPLATES.keys()).join(', ');
      throw new Error(
        `Template "${name}" not found. Available templates: ${available}`,
      );
    }
    return tpl;
  }

  /**
   * Scaffold a project from a named template into `targetDir`.
   *
   * 1. Resolves the template.
   * 2. Creates every file (creating intermediate directories as needed).
   * 3. Runs the template's installCommands sequentially inside `targetDir`.
   *
   * Returns the list of generated file paths (relative to targetDir).
   */
  async generate(name: string, targetDir: string): Promise<string[]> {
    const tpl = this.getTemplate(name);
    const created: string[] = [];

    // Ensure target directory exists
    fs.mkdirSync(targetDir, { recursive: true });

    // Write files
    for (const file of tpl.files) {
      const filePath = path.join(targetDir, file.path);
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, file.content, 'utf-8');
      created.push(file.path);
    }

    // Run install commands
    for (const cmd of tpl.installCommands) {
      const { execSync } = await import('node:child_process');
      console.log(`\n▸ Running: ${cmd}`);
      execSync(cmd, { cwd: targetDir, stdio: 'inherit' });
    }

    return created;
  }
}

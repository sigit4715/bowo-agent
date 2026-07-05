/**
 * BOWO Multi-User System with Role-Based Access Control
 *
 * Inspired by 9Router's user management with roles, permissions,
 * sessions, and API key support. Zero external dependencies.
 */

import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ── Types ──────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'operator' | 'viewer' | 'api-only';

export type Permission =
  | 'agents:read'
  | 'agents:execute'
  | 'agents:create'
  | 'pools:read'
  | 'pools:manage'
  | 'combos:read'
  | 'combos:manage'
  | 'users:read'
  | 'users:manage'
  | 'system:read'
  | 'system:manage'
  | 'api:access';

export interface UserPreferences {
  defaultModel: string;
  defaultStrategy: string;
  theme: 'light' | 'dark';
  language: string;
  maxTokensPerRequest: number;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  permissions: Permission[];
  apiKey?: string;
  passwordHash?: string;
  isActive: boolean;
  lastLoginAt?: string;
  loginCount: number;
  createdAt: string;
  preferences: UserPreferences;
}

export interface UserSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

// ── Default role permissions ───────────────────────────────────────

const ALL_PERMISSIONS: Permission[] = [
  'agents:read',
  'agents:execute',
  'agents:create',
  'pools:read',
  'pools:manage',
  'combos:read',
  'combos:manage',
  'users:read',
  'users:manage',
  'system:read',
  'system:manage',
  'api:access',
];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [...ALL_PERMISSIONS],
  operator: [
    'agents:read',
    'agents:execute',
    'agents:create',
    'pools:read',
    'combos:read',
    'system:read',
    'api:access',
  ],
  viewer: [
    'agents:read',
    'pools:read',
    'combos:read',
    'system:read',
  ],
  'api-only': [
    'api:access',
  ],
};

const DEFAULT_PREFERENCES: UserPreferences = {
  defaultModel: 'hermes-3-llama-3.1-405b',
  defaultStrategy: 'balanced',
  theme: 'dark',
  language: 'en',
  maxTokensPerRequest: 4096,
};

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Helpers ────────────────────────────────────────────────────────

function generateId(): string {
  return randomBytes(16).toString('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function generateApiKey(): string {
  return 'bowo_' + randomBytes(24).toString('hex');
}

function nowISO(): string {
  return new Date().toISOString();
}

function addMs(iso: string, ms: number): string {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}

function hashPassword(password: string): string {
  const salt = randomBytes(32).toString('hex');
  const hash = createHash('sha256')
    .update(`${salt}:${password}`)
    .digest('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHash] = parts;
  const actualHash = createHash('sha256')
    .update(`${salt}:${password}`)
    .digest('hex');
  return actualHash === expectedHash;
}

// ── Persistence shape ──────────────────────────────────────────────

interface StorageData {
  users: User[];
  sessions: UserSession[];
}

// ── UserManager ────────────────────────────────────────────────────

export class UserManager {
  private storagePath: string;
  private data: StorageData;

  constructor(storagePath?: string) {
    this.storagePath = storagePath ?? join(process.cwd(), 'output', 'bowo-users.json');
    this.data = this.load();
  }

  // ── User CRUD ──────────────────────────────────────────────────

  createUser(input: {
    username: string;
    email: string;
    role: UserRole;
    password?: string;
  }): User {
    // Unique constraints
    if (this.data.users.some((u) => u.username === input.username)) {
      throw new Error(`Username "${input.username}" already exists`);
    }
    if (this.data.users.some((u) => u.email === input.email)) {
      throw new Error(`Email "${input.email}" already exists`);
    }

    const permissions = [...(ROLE_PERMISSIONS[input.role] ?? [])];
    const now = nowISO();

    const user: User = {
      id: generateId(),
      username: input.username,
      email: input.email,
      role: input.role,
      permissions,
      isActive: true,
      loginCount: 0,
      createdAt: now,
      preferences: { ...DEFAULT_PREFERENCES },
    };

    if (input.password) {
      user.passwordHash = hashPassword(input.password);
    }

    this.data.users.push(user);
    this.save();
    return user;
  }

  deleteUser(id: string): boolean {
    const idx = this.data.users.findIndex((u) => u.id === id);
    if (idx === -1) return false;

    this.data.users.splice(idx, 1);
    // Also purge sessions for this user
    this.data.sessions = this.data.sessions.filter((s) => s.userId !== id);
    this.save();
    return true;
  }

  updateUser(id: string, updates: Partial<User>): User | null {
    const user = this.getUser(id);
    if (!user) return null;

    // Block overriding id and createdAt
    const { id: _id, createdAt: _ca, ...safe } = updates as any;

    Object.assign(user, safe);
    this.save();
    return user;
  }

  getUser(id: string): User | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  getUserByUsername(username: string): User | undefined {
    return this.data.users.find((u) => u.username === username);
  }

  getUserByApiKey(apiKey: string): User | undefined {
    return this.data.users.find((u) => u.apiKey === apiKey);
  }

  listUsers(): User[] {
    return [...this.data.users];
  }

  // ── Permissions ────────────────────────────────────────────────

  hasPermission(userId: string, permission: Permission): boolean {
    const user = this.getUser(userId);
    if (!user) return false;
    return user.isActive && user.permissions.includes(permission);
  }

  grantPermission(userId: string, permission: Permission): boolean {
    const user = this.getUser(userId);
    if (!user) return false;
    if (user.permissions.includes(permission)) return true; // already has it

    user.permissions.push(permission);
    this.save();
    return true;
  }

  revokePermission(userId: string, permission: Permission): boolean {
    const user = this.getUser(userId);
    if (!user) return false;

    const idx = user.permissions.indexOf(permission);
    if (idx === -1) return false;

    user.permissions.splice(idx, 1);
    this.save();
    return true;
  }

  // ── Sessions ───────────────────────────────────────────────────

  createSession(userId: string): UserSession {
    const user = this.getUser(userId);
    if (!user) throw new Error(`User "${userId}" not found`);

    const now = nowISO();
    const session: UserSession = {
      id: generateId(),
      userId,
      token: generateToken(),
      expiresAt: addMs(now, SESSION_TTL_MS),
      createdAt: now,
    };

    // Update user login tracking
    user.loginCount += 1;
    user.lastLoginAt = now;

    this.data.sessions.push(session);
    this.save();
    return session;
  }

  validateSession(token: string): User | null {
    const session = this.data.sessions.find((s) => s.token === token);
    if (!session) return null;

    // Check expiry
    if (new Date(session.expiresAt) < new Date()) {
      // Purge expired session
      this.data.sessions = this.data.sessions.filter((s) => s.id !== session.id);
      this.save();
      return null;
    }

    const user = this.getUser(session.userId);
    if (!user || !user.isActive) return null;

    return user;
  }

  deleteSession(token: string): boolean {
    const idx = this.data.sessions.findIndex((s) => s.token === token);
    if (idx === -1) return false;

    this.data.sessions.splice(idx, 1);
    this.save();
    return true;
  }

  getSessions(userId: string): UserSession[] {
    return this.data.sessions.filter((s) => s.userId === userId);
  }

  // ── API Keys ───────────────────────────────────────────────────

  generateApiKey(userId: string): string {
    const user = this.getUser(userId);
    if (!user) throw new Error(`User "${userId}" not found`);

    const key = generateApiKey();
    user.apiKey = key;
    this.save();
    return key;
  }

  // ── Password support ───────────────────────────────────────────

  verifyUserPassword(userId: string, password: string): boolean {
    const user = this.getUser(userId);
    if (!user || !user.passwordHash) return false;
    return verifyPassword(password, user.passwordHash);
  }

  setUserPassword(userId: string, password: string): boolean {
    const user = this.getUser(userId);
    if (!user) return false;

    user.passwordHash = hashPassword(password);
    this.save();
    return true;
  }

  // ── Stats ──────────────────────────────────────────────────────

  getStats(): {
    totalUsers: number;
    activeUsers: number;
    totalSessions: number;
    usersByRole: Record<UserRole, number>;
  } {
    const usersByRole: Record<UserRole, number> = {
      admin: 0,
      operator: 0,
      viewer: 0,
      'api-only': 0,
    };

    for (const u of this.data.users) {
      usersByRole[u.role] += 1;
    }

    return {
      totalUsers: this.data.users.length,
      activeUsers: this.data.users.filter((u) => u.isActive).length,
      totalSessions: this.data.sessions.length,
      usersByRole,
    };
  }

  // ── Persistence ────────────────────────────────────────────────

  private load(): StorageData {
    if (!existsSync(this.storagePath)) {
      return { users: [], sessions: [] };
    }

    try {
      const raw = readFileSync(this.storagePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<StorageData>;
      return {
        users: parsed.users ?? [],
        sessions: parsed.sessions ?? [],
      };
    } catch {
      return { users: [], sessions: [] };
    }
  }

  private save(): void {
    const dir = dirname(this.storagePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(
      this.storagePath,
      JSON.stringify(this.data, null, 2),
      'utf-8',
    );
  }
}

// ── Re-export convenience constants ────────────────────────────────

export { ROLE_PERMISSIONS, ALL_PERMISSIONS, DEFAULT_PREFERENCES };

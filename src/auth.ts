import { createHash, randomBytes, createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: 'admin' | 'user' | 'viewer';
  createdAt: string;
}

export interface AuthToken {
  token: string;
  expiresAt: string;
  userId: string;
  role: string;
}

interface JWTHeader {
  alg: string;
  typ: string;
}

interface JWTClaims {
  sub: string;
  role: string;
  iat: number;
  exp: number;
  jti: string;
}

/**
 * Base64url encode (no padding).
 */
function base64url(data: Buffer | string): string {
  const str = typeof data === 'string' ? data : data.toString('base64');
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64url decode.
 */
function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

/**
 * Create HMAC-SHA256 signature.
 */
function hmacSign(secret: string, data: string): string {
  return base64url(createHmac('sha256', secret).update(data).digest());
}

/**
 * Encode a JWT manually (no external deps).
 */
function encodeJWT(header: JWTHeader, payload: object, secret: string): string {
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = hmacSign(secret, signingInput);
  return `${signingInput}.${signature}`;
}

/**
 * Decode and verify a JWT.
 */
function decodeJWT(token: string, secret: string): { payload: Record<string, unknown>; valid: boolean; error?: string } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { payload: {}, valid: false, error: 'Invalid token format' };
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSig = hmacSign(secret, signingInput);

  if (signature !== expectedSig) {
    return { payload: {}, valid: false, error: 'Invalid signature' };
  }

  try {
    const payload = JSON.parse(base64urlDecode(encodedPayload).toString('utf-8'));
    return { payload, valid: true };
  } catch {
    return { payload: {}, valid: false, error: 'Invalid payload encoding' };
  }
}

export class AuthManager {
  private secret: string;
  private usersFile: string;

  constructor(secret?: string) {
    this.secret = secret ?? process.env.BOWO_AUTH_SECRET ?? randomBytes(64).toString('hex');

    // Ensure output directory exists
    const outputDir = join(process.cwd(), 'output');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    this.usersFile = join(outputDir, 'users.json');
  }

  /**
   * Hash a password using SHA-256 with a random salt.
   */
  hashPassword(password: string): string {
    const salt = randomBytes(32).toString('hex');
    const hash = createHash('sha256')
      .update(`${salt}:${password}`)
      .digest('hex');
    return `${salt}:${hash}`;
  }

  /**
   * Verify a password against its hash.
   */
  verifyPassword(password: string, hash: string): boolean {
    const parts = hash.split(':');
    if (parts.length !== 2) return false;
    const [salt, storedHash] = parts;
    const computedHash = createHash('sha256')
      .update(`${salt}:${password}`)
      .digest('hex');
    return computedHash === storedHash;
  }

  /**
   * Generate a JWT for the given user with 24h expiry.
   */
  generateToken(user: User): AuthToken {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 24 * 60 * 60; // 24 hours

    const header: JWTHeader = { alg: 'HS256', typ: 'JWT' };
    const claims: JWTClaims = {
      sub: user.id,
      role: user.role,
      iat: now,
      exp: expiresAt,
      jti: randomBytes(16).toString('hex'),
    };

    const token = encodeJWT(header, claims, this.secret);

    return {
      token,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      userId: user.id,
      role: user.role,
    };
  }

  /**
   * Verify and decode a JWT token.
   */
  verifyToken(token: string): { valid: boolean; userId?: string; role?: string; error?: string } {
    const { payload, valid, error } = decodeJWT(token, this.secret);

    if (!valid) {
      return { valid: false, error };
    }

    const claims = payload as unknown as JWTClaims;

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp === 'number' && claims.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    return {
      valid: true,
      userId: claims.sub,
      role: claims.role,
    };
  }

  /**
   * Register a new user. Persists to output/users.json.
   */
  register(username: string, password: string, role: string = 'user'): User {
    const users = this.readUsers();

    // Check for duplicate username
    if (users.some((u) => u.username === username)) {
      throw new Error(`User "${username}" already exists`);
    }

    // Validate role
    const validRoles = ['admin', 'user', 'viewer'];
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role: ${role}. Must be one of: ${validRoles.join(', ')}`);
    }

    const user: User = {
      id: randomBytes(16).toString('hex'),
      username,
      passwordHash: this.hashPassword(password),
      role: role as User['role'],
      createdAt: new Date().toISOString(),
    };

    users.push(user);
    this.writeUsers(users);

    return user;
  }

  /**
   * Authenticate a user by username and password.
   * Returns an AuthToken on success, null on failure.
   */
  login(username: string, password: string): AuthToken | null {
    const users = this.readUsers();
    const user = users.find((u) => u.username === username);

    if (!user || !this.verifyPassword(password, user.passwordHash)) {
      return null;
    }

    return this.generateToken(user);
  }

  /**
   * List all users without password hashes.
   */
  getUsers(): User[] {
    const users = this.readUsers();
    return users.map(({ passwordHash: _, ...rest }) => rest as User);
  }

  /**
   * Delete a user by ID. Returns true if deleted, false if not found.
   */
  deleteUser(userId: string): boolean {
    const users = this.readUsers();
    const initialLength = users.length;
    const filtered = users.filter((u) => u.id !== userId);

    if (filtered.length === initialLength) {
      return false;
    }

    this.writeUsers(filtered);
    return true;
  }

  /**
   * Create a default admin user (admin / admin123) if no users exist.
   */
  createDefaultAdmin(): User {
    const users = this.readUsers();
    if (users.length > 0) {
      throw new Error('Users already exist; default admin not created');
    }

    return this.register('admin', 'admin123', 'admin');
  }

  // ── Internal helpers ──────────────────────────────────────────────

  private readUsers(): User[] {
    if (!existsSync(this.usersFile)) {
      return [];
    }
    try {
      const data = readFileSync(this.usersFile, 'utf-8');
      return JSON.parse(data) as User[];
    } catch {
      return [];
    }
  }

  private writeUsers(users: User[]): void {
    const dir = dirname(this.usersFile);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.usersFile, JSON.stringify(users, null, 2), 'utf-8');
  }
}

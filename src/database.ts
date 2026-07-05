/**
 * database.ts — SQLite-like database using JSON file persistence.
 * Each collection is stored as a separate JSON file under the db directory.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface DBRecord {
  id: string;
  [key: string]: any;
}

export interface QueryFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';
  value: any;
}

// ── CollectionHandle ────────────────────────────────────────────────────────

export class CollectionHandle {
  private filePath: string;
  private indexes: Map<string, Map<any, Set<string>>> = new Map();

  constructor(
    private dbPath: string,
    private collectionName: string,
  ) {
    this.filePath = join(dbPath, `${collectionName}.json`);
    this.ensureFile();
  }

  /** Ensure the JSON file exists on disk (empty array). */
  private ensureFile(): void {
    if (!existsSync(this.filePath)) {
      writeFileSync(this.filePath, '[]', 'utf-8');
    }
  }

  /** Read all records from disk. */
  private load(): DBRecord[] {
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw) as DBRecord[];
    } catch {
      return [];
    }
  }

  /** Persist the full record array to disk. */
  private save(records: DBRecord[]): void {
    this.ensureFile();
    writeFileSync(this.filePath, JSON.stringify(records, null, 2), 'utf-8');
    this.rebuildIndexes(records);
  }

  /** Generate a UUID v4-like ID. */
  private generateId(): string {
    return randomUUID();
  }

  // ── CRUD ────────────────────────────────────────────────────────────────

  /** Insert a single record (auto-generates ID). */
  insert(record: Omit<DBRecord, 'id'>): DBRecord {
    const records = this.load();
    const newRecord: DBRecord = { id: this.generateId(), ...record };
    records.push(newRecord);
    this.save(records);
    return newRecord;
  }

  /** Insert multiple records at once. */
  insertMany(records: Omit<DBRecord, 'id'>[]): DBRecord[] {
    const existing = this.load();
    const newRecords: DBRecord[] = records.map((r) => ({
      id: this.generateId(),
      ...r,
    }));
    existing.push(...newRecords);
    this.save(existing);
    return newRecords;
  }

  /** Find a record by its ID. */
  findById(id: string): DBRecord | null {
    // Fast path via index
    const idx = this.indexes.get('id');
    if (idx) {
      const ids = idx.get(id);
      if (!ids) return null;
      const records = this.load();
      return records.find((r) => r.id === id) ?? null;
    }
    const records = this.load();
    return records.find((r) => r.id === id) ?? null;
  }

  /** Find all records matching an optional set of filters (AND logic). */
  find(filters?: QueryFilter[]): DBRecord[] {
    let results = this.load();
    if (filters && filters.length > 0) {
      results = results.filter((r) => filters.every((f) => this.matchesFilter(r, f)));
    }
    return results;
  }

  /** Find the first record matching filters. */
  findOne(filters?: QueryFilter[]): DBRecord | null {
    return this.find(filters)[0] ?? null;
  }

  /** Update a record by ID. Returns the updated record or null. */
  update(id: string, updates: Partial<DBRecord>): DBRecord | null {
    const records = this.load();
    const idx = records.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    records[idx] = { ...records[idx], ...updates, id };
    this.save(records);
    return records[idx];
  }

  /** Delete a record by ID. Returns true if deleted. */
  delete(id: string): boolean {
    const records = this.load();
    const before = records.length;
    const filtered = records.filter((r) => r.id !== id);
    if (filtered.length === before) return false;
    this.save(filtered);
    return true;
  }

  /** Count total records. */
  count(): number {
    return this.load().length;
  }

  /** Delete the entire collection file. */
  drop(): void {
    if (existsSync(this.filePath)) {
      unlinkSync(this.filePath);
    }
    this.indexes.clear();
  }

  // ── Indexing ────────────────────────────────────────────────────────────

  /** Create a simple index on a field for faster lookups. */
  createIndex(field: string): void {
    if (this.indexes.has(field)) return; // already indexed
    const records = this.load();
    const idx = new Map<any, Set<string>>();
    for (const r of records) {
      const val = r[field];
      if (!idx.has(val)) idx.set(val, new Set());
      idx.get(val)!.add(r.id);
    }
    this.indexes.set(field, idx);
  }

  /** Rebuild all indexes after a write. */
  private rebuildIndexes(records: DBRecord[]): void {
    for (const [field, idx] of this.indexes) {
      idx.clear();
      for (const r of records) {
        const val = r[field];
        if (!idx.has(val)) idx.set(val, new Set());
        idx.get(val)!.add(r.id);
      }
    }
  }

  // ── Filter Matching ─────────────────────────────────────────────────────

  private matchesFilter(record: DBRecord, filter: QueryFilter): boolean {
    const fieldVal = record[filter.field];
    const { operator, value } = filter;

    // Fast path: use index for 'eq' when available
    if (operator === 'eq') {
      const idx = this.indexes.get(filter.field);
      if (idx) {
        const ids = idx.get(value);
        return ids ? ids.has(record.id) : false;
      }
    }

    switch (operator) {
      case 'eq':
        return fieldVal === value;
      case 'ne':
        return fieldVal !== value;
      case 'gt':
        return fieldVal > value;
      case 'lt':
        return fieldVal < value;
      case 'gte':
        return fieldVal >= value;
      case 'lte':
        return fieldVal <= value;
      case 'contains':
        return typeof fieldVal === 'string' && fieldVal.includes(String(value));
      case 'in':
        return Array.isArray(value) && value.includes(fieldVal);
      default:
        return false;
    }
  }
}

// ── DatabaseManager ─────────────────────────────────────────────────────────

export class DatabaseManager {
  private dbPath: string;
  private collections: Map<string, CollectionHandle> = new Map();

  constructor(dbPath?: string) {
    this.dbPath = resolve(dbPath ?? 'output/database');
    if (!existsSync(this.dbPath)) {
      mkdirSync(this.dbPath, { recursive: true });
    }
  }

  /** Get (or create) a handle for a named collection. */
  collection(name: string): CollectionHandle {
    if (!this.collections.has(name)) {
      this.collections.set(name, new CollectionHandle(this.dbPath, name));
    }
    return this.collections.get(name)!;
  }

  /** List all collection names that exist on disk. */
  getCollections(): string[] {
    if (!existsSync(this.dbPath)) return [];
    return readdirSync(this.dbPath)
      .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
      .map((f) => f.replace(/\.json$/, ''));
  }

  /** Backup the entire database to a timestamped directory. */
  backup(): string {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = resolve(this.dbPath, `../backups/backup-${ts}`);
    mkdirSync(backupDir, { recursive: true });

    const files = this.getCollections();
    for (const name of files) {
      const src = join(this.dbPath, `${name}.json`);
      const dst = join(backupDir, `${name}.json`);
      copyFileSync(src, dst);
    }
    return backupDir;
  }

  /** Restore collections from a backup directory. */
  restore(backupPath: string): boolean {
    if (!existsSync(backupPath)) return false;
    const files = readdirSync(backupPath).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const src = join(backupPath, f);
      const dst = join(this.dbPath, f);
      copyFileSync(src, dst);
    }
    this.collections.clear(); // invalidate cache
    return true;
  }

  /** Get summary statistics about the database. */
  getStats(): { collections: number; totalRecords: number; size: string } {
    const colNames = this.getCollections();
    let totalRecords = 0;
    let totalBytes = 0;

    for (const name of colNames) {
      const filePath = join(this.dbPath, `${name}.json`);
      try {
        const stat = statSync(filePath);
        totalBytes += stat.size;
        const data = JSON.parse(readFileSync(filePath, 'utf-8'));
        totalRecords += Array.isArray(data) ? data.length : 0;
      } catch {
        // skip unreadable files
      }
    }

    const size = totalBytes < 1024
      ? `${totalBytes} B`
      : totalBytes < 1024 * 1024
        ? `${(totalBytes / 1024).toFixed(1)} KB`
        : `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;

    return { collections: colNames.length, totalRecords, size };
  }
}

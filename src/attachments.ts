import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export interface AttachmentMetadata {
  id: string;
  originalName: string;
  filePath: string;
  type: string;
  size: number;
  mimeType: string;
  createdAt: string;
  customMetadata?: Record<string, unknown>;
}

const ATTACHMENTS_DIR = join(process.cwd(), 'output', 'attachments');
const METADATA_FILE = join(ATTACHMENTS_DIR, '_metadata.json');

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function guessMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.html': 'text/html',
    '.css': 'text/css',
    '.xml': 'application/xml',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.csv': 'text/csv',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.gz': 'application/gzip',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.wav': 'audio/wav',
    '.py': 'text/x-python',
    '.java': 'text/x-java-source',
    '.rb': 'text/x-ruby',
    '.go': 'text/x-go',
    '.rs': 'text/x-rust',
    '.sh': 'text/x-shellscript',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}

function guessType(filePath: string): string {
  const ext = extname(filePath).toLowerCase().slice(1);
  return ext || 'unknown';
}

export class AttachmentManager {
  private attachments: Map<string, AttachmentMetadata> = new Map();

  constructor() {
    ensureDir(ATTACHMENTS_DIR);
    this.loadMetadata();
  }

  private loadMetadata(): void {
    if (existsSync(METADATA_FILE)) {
      try {
        const raw = readFileSync(METADATA_FILE, 'utf-8');
        const items: AttachmentMetadata[] = JSON.parse(raw);
        for (const item of items) {
          this.attachments.set(item.id, item);
        }
      } catch {
        // Start fresh if metadata is corrupted
      }
    }
  }

  private saveMetadata(): void {
    const items = [...this.attachments.values()];
    writeFileSync(METADATA_FILE, JSON.stringify(items, null, 2), 'utf-8');
  }

  private getMimeType(filePath: string): string {
    try {
      const result = execSync(`file --mime-type -b "${filePath}"`, {
        encoding: 'utf-8',
        timeout: 5_000,
      }).trim();
      if (result && !result.includes('cannot open')) {
        return result;
      }
    } catch {
      // Fall back to extension-based guessing
    }
    return guessMimeType(filePath);
  }

  async attach(filePath: string, metadata?: Record<string, unknown>): Promise<AttachmentMetadata> {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const id = randomUUID();
    const originalName = basename(filePath);
    const destPath = join(ATTACHMENTS_DIR, `${id}_${originalName}`);

    // Copy file to attachments dir
    execSync(`cp "${filePath}" "${destPath}"`, { timeout: 10_000 });

    const stats = execSync(`stat -c %s "${filePath}"`, { encoding: 'utf-8', timeout: 5_000 });
    const size = parseInt(stats.trim(), 10);

    const attachment: AttachmentMetadata = {
      id,
      originalName,
      filePath: destPath,
      type: guessType(filePath),
      size,
      mimeType: this.getMimeType(filePath),
      createdAt: new Date().toISOString(),
      customMetadata: metadata,
    };

    this.attachments.set(id, attachment);
    this.saveMetadata();
    return attachment;
  }

  async detach(id: string): Promise<boolean> {
    const attachment = this.attachments.get(id);
    if (!attachment) return false;

    if (existsSync(attachment.filePath)) {
      unlinkSync(attachment.filePath);
    }

    this.attachments.delete(id);
    this.saveMetadata();
    return true;
  }

  async list(): Promise<AttachmentMetadata[]> {
    return [...this.attachments.values()];
  }

  async getByType(type: string): Promise<AttachmentMetadata[]> {
    return [...this.attachments.values()].filter((a) => a.type === type);
  }

  async getAttachment(id: string): Promise<AttachmentMetadata | undefined> {
    return this.attachments.get(id);
  }

  async toBase64(id: string): Promise<string> {
    const attachment = this.attachments.get(id);
    if (!attachment) {
      throw new Error(`Attachment not found: ${id}`);
    }

    try {
      const encoded = execSync(`base64 "${attachment.filePath}"`, {
        encoding: 'utf-8',
        timeout: 10_000,
      });
      return encoded.trim();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to encode attachment as base64: ${message}`);
    }
  }

  async getContent(id: string): Promise<string> {
    const attachment = this.attachments.get(id);
    if (!attachment) {
      throw new Error(`Attachment not found: ${id}`);
    }

    return readFileSync(attachment.filePath, 'utf-8');
  }
}

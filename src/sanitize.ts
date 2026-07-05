export class InputSanitizer {
  /** Default max length for sanitized strings. */
  private static readonly DEFAULT_MAX_LENGTH = 10_000;

  /**
   * Sanitize a string: strip HTML tags, escape special chars, limit length.
   */
  sanitize(input: string): string {
    let result = input;

    // Strip HTML tags
    result = result.replace(/<[^>]*>/g, '');

    // Escape HTML special characters
    result = result
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');

    // Remove null bytes
    result = result.replace(/\0/g, '');

    // Limit length
    result = this.limitLength(result, InputSanitizer.DEFAULT_MAX_LENGTH);

    return result;
  }

  /**
   * Recursively sanitize all string values in an object.
   */
  sanitizeObject(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.sanitize(value);
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) => {
          if (typeof item === 'string') return this.sanitize(item);
          if (typeof item === 'object' && item !== null) return this.sanitizeObject(item);
          return item;
        });
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.sanitizeObject(value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Validate an email address.
   */
  validateEmail(email: string): boolean {
    // RFC 5322 simplified pattern
    const pattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!pattern.test(email)) return false;

    // Additional checks
    if (email.length > 254) return false;
    const parts = email.split('@');
    if (parts.length !== 2) return false;
    if (parts[0].length > 64) return false;
    if (parts[1].length > 253) return false;

    return true;
  }

  /**
   * Validate a URL.
   */
  validateUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:', 'ftp:', 'ftps:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Validate and parse a JSON string.
   */
  validateJSON(json: string): { valid: boolean; data?: any; error?: string } {
    try {
      const data = JSON.parse(json);
      return { valid: true, data };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : 'Invalid JSON',
      };
    }
  }

  /**
   * Prevent SQL/NoSQL injection patterns by escaping or stripping dangerous patterns.
   */
  preventInjection(input: string): string {
    let result = input;

    // SQL injection patterns
    result = result.replace(/['";\\]/g, '');          // Remove quotes, semicolons, backslashes
    result = result.replace(/--/g, '');                // Remove SQL comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, ''); // Remove block comments
    result = result.replace(/\b(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|XP_CMDSHELL|SP_EXECUTESQL)\b/gi, '');

    // NoSQL injection patterns
    result = result.replace(/\$where/gi, '');
    result = result.replace(/\$ne/gi, '');
    result = result.replace(/\$gt/gi, '');
    result = result.replace(/\$lt/gi, '');
    result = result.replace(/\$regex/gi, '');
    result = result.replace(/\$exists/gi, '');
    result = result.replace(/\bfunction\s*\(/gi, '');  // JS function injection

    return result;
  }

  /**
   * Limit string length.
   */
  limitLength(input: string, max: number): string {
    if (input.length <= max) return input;
    return input.substring(0, max);
  }

  /**
   * Strip ANSI escape codes.
   */
  stripAnsi(input: string): string {
    // eslint-disable-next-line no-control-regex
    return input.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  }

  /**
   * Check if a path is safe (no path traversal).
   */
  isSafePath(path: string): boolean {
    // Normalize and check for traversal patterns
    const normalized = path.replace(/\\/g, '/');

    // Check for traversal sequences
    if (normalized.includes('..')) return false;
    if (normalized.includes('~')) return false;

    // Check for absolute paths to sensitive system dirs
    const dangerousPrefixes = ['/etc', '/proc', '/sys', '/dev', '/root', '/boot'];
    for (const prefix of dangerousPrefixes) {
      if (normalized.startsWith(prefix)) return false;
    }

    // Check for null bytes
    if (path.includes('\0')) return false;

    return true;
  }
}

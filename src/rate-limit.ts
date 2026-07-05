export interface TokenBucketConfig {
  maxTokens: number;
  refillRate: number;          // tokens per refill
  refillInterval: number;      // milliseconds between refills
}

interface BucketState {
  tokens: number;
  maxTokens: number;
  refillRate: number;
  refillInterval: number;
  lastRefillTime: number;
  totalAcquired: number;
  totalReleased: number;
}

export interface BucketStatus {
  key: string;
  tokens: number;
  maxTokens: number;
  refillRate: number;
  refillInterval: number;
  canAcquire: boolean;
  timeUntilRefill: number;     // ms until next refill
  totalAcquired: number;
  totalReleased: number;
}

const DEFAULT_CONFIG: TokenBucketConfig = {
  maxTokens: 10,
  refillRate: 1,
  refillInterval: 1000,
};

export class RateLimiter {
  private buckets: Map<string, BucketState> = new Map();
  private config: TokenBucketConfig;

  constructor(config?: Partial<TokenBucketConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private getBucket(key: string): BucketState {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        tokens: this.config.maxTokens,
        maxTokens: this.config.maxTokens,
        refillRate: this.config.refillRate,
        refillInterval: this.config.refillInterval,
        lastRefillTime: Date.now(),
        totalAcquired: 0,
        totalReleased: 0,
      };
      this.buckets.set(key, bucket);
    }
    this.refill(bucket);
    return bucket;
  }

  private refill(bucket: BucketState): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefillTime;
    const refills = Math.floor(elapsed / bucket.refillInterval);
    if (refills > 0) {
      bucket.tokens = Math.min(
        bucket.maxTokens,
        bucket.tokens + refills * bucket.refillRate,
      );
      bucket.lastRefillTime += refills * bucket.refillInterval;
    }
  }

  async acquire(key: string): Promise<boolean> {
    const bucket = this.getBucket(key);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      bucket.totalAcquired += 1;
      return true;
    }
    return false;
  }

  async release(key: string): Promise<void> {
    const bucket = this.getBucket(key);
    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + 1);
    bucket.totalReleased += 1;
  }

  async canAcquire(key: string): Promise<boolean> {
    const bucket = this.getBucket(key);
    return bucket.tokens >= 1;
  }

  async getStatus(key: string): Promise<BucketStatus> {
    const bucket = this.getBucket(key);
    const now = Date.now();
    const timeSinceRefill = now - bucket.lastRefillTime;
    const timeUntilRefill = Math.max(0, bucket.refillInterval - timeSinceRefill);

    return {
      key,
      tokens: bucket.tokens,
      maxTokens: bucket.maxTokens,
      refillRate: bucket.refillRate,
      refillInterval: bucket.refillInterval,
      canAcquire: bucket.tokens >= 1,
      timeUntilRefill,
      totalAcquired: bucket.totalAcquired,
      totalReleased: bucket.totalReleased,
    };
  }

  async reset(key: string): Promise<void> {
    const bucket = this.buckets.get(key);
    if (bucket) {
      bucket.tokens = bucket.maxTokens;
      bucket.lastRefillTime = Date.now();
      bucket.totalAcquired = 0;
      bucket.totalReleased = 0;
    }
  }

  async resetAll(): Promise<void> {
    for (const [, bucket] of this.buckets) {
      bucket.tokens = bucket.maxTokens;
      bucket.lastRefillTime = Date.now();
      bucket.totalAcquired = 0;
      bucket.totalReleased = 0;
    }
  }
}

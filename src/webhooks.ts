export interface WebhookConfig {
  name: string;
  url: string;
  events: string[];
  createdAt: string;
  lastTriggered?: string;
  failureCount: number;
  successCount: number;
}

export interface WebhookTriggerResult {
  webhook: string;
  url: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  timestamp: string;
}

export class WebhookManager {
  private webhooks: Map<string, WebhookConfig> = new Map();

  async register(
    name: string,
    url: string,
    events?: string[],
  ): Promise<WebhookConfig> {
    const config: WebhookConfig = {
      name,
      url,
      events: events ?? ['*'],
      createdAt: new Date().toISOString(),
      failureCount: 0,
      successCount: 0,
    };

    this.webhooks.set(name, config);
    return config;
  }

  async unregister(name: string): Promise<boolean> {
    return this.webhooks.delete(name);
  }

  async trigger(
    event: string,
    payload: Record<string, unknown>,
  ): Promise<WebhookTriggerResult[]> {
    const results: WebhookTriggerResult[] = [];
    const timestamp = new Date().toISOString();

    for (const [, webhook] of this.webhooks) {
      // Check if this webhook listens to the event
      const listens =
        webhook.events.includes('*') || webhook.events.includes(event);
      if (!listens) continue;

      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Bowo-Event': event,
            'X-Bowo-Timestamp': timestamp,
          },
          body: JSON.stringify({ event, payload, timestamp }),
        });

        const success = response.ok;
        webhook.lastTriggered = timestamp;

        if (success) {
          webhook.successCount += 1;
        } else {
          webhook.failureCount += 1;
        }

        results.push({
          webhook: webhook.name,
          url: webhook.url,
          success,
          statusCode: response.status,
          timestamp,
        });
      } catch (error: unknown) {
        webhook.failureCount += 1;
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          webhook: webhook.name,
          url: webhook.url,
          success: false,
          error: message,
          timestamp,
        });
      }
    }

    return results;
  }

  async list(): Promise<WebhookConfig[]> {
    return [...this.webhooks.values()];
  }

  async getWebhook(name: string): Promise<WebhookConfig | undefined> {
    return this.webhooks.get(name);
  }
}

import { ExternalServiceError } from '@/common/exceptions/app-error.js';
import { env } from '@/config/env.js';
import { logger } from '@/logger/logger.service.js';

import type {
  AiServiceClient,
  AiServiceHealth,
  DispatchSessionInput,
  DispatchSessionResult,
} from './interfaces/ai-service-client.interface.js';

const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * §9.11 — real implementation, resolved only when `AI_SERVICE_PROVIDER=real`
 * (`config/container.ts`). Nothing in the codebase imports this directly
 * (§9.11 rule 1); it exists so that swapping fake → real is one env var,
 * not a rewrite. Bearer-token auth against `AI_SERVICE_BASE_URL` is the
 * provisional scheme — Open Question #1 in MEMORY.md flags this as pending
 * their confirmed auth mechanism.
 */
export class HttpAiServiceClient implements AiServiceClient {
  async dispatchSession(input: DispatchSessionInput): Promise<DispatchSessionResult> {
    return this.request<DispatchSessionResult>('POST', '/sessions/dispatch', input);
  }

  async cancelSession(sessionId: string): Promise<void> {
    await this.request<void>('POST', '/sessions/cancel', { sessionId });
  }

  async healthCheck(): Promise<AiServiceHealth> {
    const start = Date.now();
    try {
      await this.request<unknown>('GET', '/health');
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false };
    }
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const url = `${env.AI_SERVICE_BASE_URL}${path}`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${env.AI_SERVICE_TOKEN}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });

        if (!response.ok) {
          throw new ExternalServiceError(
            `AI service request failed: ${response.status} ${response.statusText}`,
          );
        }

        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      } catch (error) {
        clearTimeout(timeout);
        if (attempt < MAX_RETRIES) {
          logger.warn({ url, attempt, error }, 'AI service call failed, retrying');
          continue;
        }
        throw error instanceof ExternalServiceError
          ? error
          : new ExternalServiceError('AI service unreachable');
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new ExternalServiceError('AI service unreachable');
  }
}

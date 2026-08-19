import {
  ConflictError,
  ExternalServiceError,
  NotFoundError,
} from '@/common/exceptions/app-error.js';
import { env } from '@/config/env.js';
import { logger } from '@/logger/logger.service.js';

import type {
  AiTrainerErrorBody,
  GenerateSlidesRequest,
  GenerateSlidesResponse,
  SessionEvaluationResponse,
  SessionStatusResponse,
  SessionTranscriptResponse,
  StartExternalSessionRequest,
  StartExternalSessionResponse,
  SuggestOutcomesRequest,
  SuggestOutcomesResponse,
  SuggestSkillsRequest,
  SuggestSkillsResponse,
} from './ai-trainer-client.types.js';

// `POST /slides` and `POST /sessions/external` are documented as
// BLOCKING/slow — a generous timeout per the AI Trainer API doc's own
// warning, well above the 10s used for the fast/advisory calls below
// (mirrors the gap between `HttpAiServiceClient`'s 10s default and how this
// codebase already treats known-slow outbound calls).
const FAST_TIMEOUT_MS = 15_000;
const SLOW_TIMEOUT_MS = 120_000;

/**
 * Thin HTTP wrapper over the external AI Trainer microservice's 7 endpoints
 * (separate host from `AI_SERVICE_BASE_URL` — a different team's service,
 * see PRD). No auth today; `getHeaders()` is the single seam a future
 * `Authorization` header slots into without touching every call site.
 * Errors: the AI service replies `{"detail": "..."}` on failure. 404/409 are
 * surfaced as our own `NotFoundError`/`ConflictError` so callers (our
 * controllers) can let them propagate straight to `errorHandler` without
 * re-mapping; anything else (5xx, network failure, timeout) becomes a
 * generic `ExternalServiceError` (502) — never leaks the raw upstream body.
 */
export class AiTrainerClientService {
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      // Authorization: `Bearer ${env.AI_TRAINER_TOKEN}` — add once the AI
      // Trainer service ships auth; no token exists yet (see PRD).
    };
  }

  async generateSlides(input: GenerateSlidesRequest): Promise<GenerateSlidesResponse> {
    return this.request<GenerateSlidesResponse>('POST', '/slides', input, SLOW_TIMEOUT_MS);
  }

  async suggestSkills(input: SuggestSkillsRequest): Promise<SuggestSkillsResponse> {
    return this.request<SuggestSkillsResponse>(
      'POST',
      '/recommendations/skills',
      input,
      FAST_TIMEOUT_MS,
    );
  }

  async suggestOutcomes(input: SuggestOutcomesRequest): Promise<SuggestOutcomesResponse> {
    return this.request<SuggestOutcomesResponse>(
      'POST',
      '/recommendations/outcomes',
      input,
      FAST_TIMEOUT_MS,
    );
  }

  async startExternalSession(
    input: StartExternalSessionRequest,
  ): Promise<StartExternalSessionResponse> {
    return this.request<StartExternalSessionResponse>(
      'POST',
      '/sessions/external',
      input,
      SLOW_TIMEOUT_MS,
    );
  }

  async getSessionStatus(sessionId: string): Promise<SessionStatusResponse> {
    return this.request<SessionStatusResponse>(
      'GET',
      `/sessions/${sessionId}`,
      undefined,
      FAST_TIMEOUT_MS,
    );
  }

  async getSessionTranscript(sessionId: string): Promise<SessionTranscriptResponse> {
    return this.request<SessionTranscriptResponse>(
      'GET',
      `/sessions/${sessionId}/transcript`,
      undefined,
      FAST_TIMEOUT_MS,
    );
  }

  async getSessionEvaluation(sessionId: string): Promise<SessionEvaluationResponse> {
    return this.request<SessionEvaluationResponse>(
      'GET',
      `/sessions/${sessionId}/evaluation`,
      undefined,
      FAST_TIMEOUT_MS,
    );
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<T> {
    const url = `${env.AI_TRAINER_HOST}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: this.getHeaders(),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });

      if (!response.ok) {
        const detail = await this.readErrorDetail(response);

        if (response.status === 404) {
          throw new NotFoundError(detail ?? 'Not found on the AI Trainer service');
        }
        if (response.status === 409) {
          throw new ConflictError(detail ?? 'Conflict on the AI Trainer service');
        }

        logger.warn({ url, status: response.status, detail }, 'AI Trainer service request failed');
        throw new ExternalServiceError(detail ?? `AI Trainer service returned ${response.status}`);
      }

      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ConflictError) {
        throw error;
      }
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      logger.warn({ url, error }, 'AI Trainer service unreachable');
      throw new ExternalServiceError('AI Trainer service unreachable', error);
    } finally {
      clearTimeout(timeout);
    }
  }

  // Named `globalThis.Response` (not the bare `Response` type reference) —
  // this file's `no-restricted-syntax` rule bans `Response` as a type
  // reference in every service file to keep Express's `res` out of the
  // service layer (ARCHITECTURE §4.1); this is the unrelated Fetch API
  // `Response` from `fetch()`, which the qualified form sidesteps cleanly.
  private async readErrorDetail(response: globalThis.Response): Promise<string | undefined> {
    try {
      const body = (await response.json()) as AiTrainerErrorBody;
      return body.detail;
    } catch {
      return undefined;
    }
  }
}

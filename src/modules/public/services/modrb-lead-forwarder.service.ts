import { env } from '@/config/env.js';
import { logger } from '@/logger/logger.service.js';

/** `05XXXXXXXX`, `+9665XXXXXXXX`, or `9665XXXXXXXX` — see modrb.md field rules. */
const SAUDI_MOBILE_RE = /^(?:05\d{8}|(?:\+966|966)5\d{8})$/;

export interface ModrbLeadInput {
  name: string;
  email: string;
  companyName?: string | undefined;
  orgSize?: string | undefined;
  phone?: string | undefined;
  message?: string | undefined;
}

type ModrbLeadPayload = {
  name: string;
  email: string;
  companyName?: string;
  orgSize?: string;
  phone?: string;
  message?: string;
};

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 8_000;
const RETRY_BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPayload(input: ModrbLeadInput): ModrbLeadPayload {
  const payload: ModrbLeadPayload = { name: input.name, email: input.email };
  if (input.companyName) payload.companyName = input.companyName;
  if (input.orgSize) payload.orgSize = input.orgSize;
  if (input.message) payload.message = input.message;
  if (input.phone && SAUDI_MOBILE_RE.test(input.phone)) payload.phone = input.phone;
  return payload;
}

/**
 * Forwards a demo request to the MODRB central Contact Dashboard
 * (`modrb.md`). Best-effort and additive only: the caller's submission has
 * already been persisted locally before this runs, and every failure path
 * here just logs — never throws — so a dead/slow dashboard can never fail a
 * visitor's form submission. Retries `5xx`/timeouts/network errors with
 * backoff; `401`/`422` are not retried since the spec guarantees they can't
 * succeed unchanged.
 */
export class ModrbLeadForwarderService {
  async forward(input: ModrbLeadInput): Promise<string | null> {
    if (!env.MODRB_LEADS_API_KEY) {
      logger.warn('modrb-lead-forward: MODRB_LEADS_API_KEY not set, skipping forward');
      return null;
    }

    const payload = buildPayload(input);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(env.MODRB_LEADS_URL, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.MODRB_LEADS_API_KEY,
          },
          body: JSON.stringify(payload),
        });
        clearTimeout(timeout);

        if (response.status === 201) {
          const body = (await response.json().catch(() => null)) as { id?: string } | null;
          logger.info({ leadId: body?.id }, 'modrb-lead-forward: succeeded');
          return body?.id ?? null;
        }

        if (response.status === 401 || response.status === 422) {
          const detail = await response.text().catch(() => '');
          logger.error(
            { status: response.status, detail },
            'modrb-lead-forward: rejected, not retrying',
          );
          return null;
        }

        // 5xx (or anything else unexpected) — retryable.
        const detail = await response.text().catch(() => '');
        logger.warn(
          { status: response.status, detail, attempt },
          'modrb-lead-forward: failed, will retry',
        );
      } catch (error) {
        clearTimeout(timeout);
        logger.warn({ error, attempt }, 'modrb-lead-forward: network/timeout error, will retry');
      } finally {
        clearTimeout(timeout);
      }

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      }
    }

    logger.error('modrb-lead-forward: exhausted retries, giving up');
    return null;
  }
}

export const modrbLeadForwarderService = new ModrbLeadForwarderService();

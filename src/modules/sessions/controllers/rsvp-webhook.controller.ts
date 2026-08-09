import type { Request, Response } from 'express';

import { env } from '@/config/env.js';
import { logger } from '@/logger/logger.service.js';

import type { GraphChangeNotification } from '../services/rsvp-webhook.service.js';
import { RsvpWebhookService } from '../services/rsvp-webhook.service.js';

const rsvpWebhook = new RsvpWebhookService();

/**
 * `IV-03` — 🌐 public route. Handles both halves of Graph's protocol:
 * the one-time `?validationToken=` handshake sent when a subscription is
 * created (echo the token back as `text/plain`), and the real notification
 * payload afterward. `clientState` is validated per-notification since
 * that's the mechanism Graph's own docs specify for basic (non-resource-data)
 * notifications — see `RsvpWebhookService`'s doc comment.
 */
export class RsvpWebhookController {
  async receive(req: Request, res: Response): Promise<void> {
    const validationToken = req.query['validationToken'];
    if (typeof validationToken === 'string') {
      res.status(200).type('text/plain').send(validationToken);
      return;
    }

    const body = req.body as { value?: GraphChangeNotification[] };
    const notifications = body.value ?? [];

    for (const notification of notifications) {
      if (
        !rsvpWebhook.isValidClientState(notification.clientState, env.GRAPH_WEBHOOK_CLIENT_STATE)
      ) {
        logger.warn(
          { subscriptionId: notification.subscriptionId },
          'rsvp-webhook: clientState mismatch, rejecting notification',
        );
        continue;
      }

      await rsvpWebhook.processNotification(notification);
    }

    // Graph requires a fast 202 regardless of processing outcome, or it
    // retries and eventually disables the subscription.
    res.status(202).end();
  }
}

import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { logger } from '@/logger/logger.service.js';
import { learnerRepository } from '@/modules/learners/learners.module.js';
import { teamRepository } from '@/modules/teams/teams.module.js';

import { InvitationRepository } from '../repositories/invitation.repository.js';

export interface GraphChangeNotification {
  subscriptionId: string;
  clientState?: string;
  changeType: string;
  resource: string;
  resourceData?: { id?: string; responseStatus?: { response?: string } };
}

const RSVP_STATUS_BY_GRAPH_RESPONSE: Record<string, 'ACCEPTED' | 'DECLINED' | 'TENTATIVE'> = {
  accepted: 'ACCEPTED',
  organizer: 'ACCEPTED',
  declined: 'DECLINED',
  tentativelyAccepted: 'TENTATIVE',
};

/**
 * `IV-03` — Graph change notifications carry no `organizationId` and arrive
 * at a 🌐 public route, so every notification is resolved by its
 * `graphEventId` through the same two-step unscoped→scoped pattern as the
 * agent's `joinToken` entry point, then re-enters `runWithTenant` for the
 * actual write (same discipline as any event-bus handler, MEMORY P6-8 note).
 */
export class RsvpWebhookService {
  private readonly invitations = new InvitationRepository();

  /** Basic notifications (no resource-data enrichment) are authenticated via `clientState`, per Graph's own docs — richer notifications additionally carry JWT `validationTokens`, not used here since this subscription doesn't request resource data. */
  isValidClientState(clientState: string | undefined, expected: string): boolean {
    return clientState === expected;
  }

  async processNotification(notification: GraphChangeNotification): Promise<void> {
    const graphEventId = notification.resourceData?.id;
    const responseStatus = notification.resourceData?.responseStatus?.response;
    if (!graphEventId || !responseStatus) {
      logger.warn(
        { notification },
        'rsvp-webhook: notification missing id/responseStatus, skipping',
      );
      return;
    }

    const rsvpStatus = RSVP_STATUS_BY_GRAPH_RESPONSE[responseStatus];
    if (!rsvpStatus) {
      logger.info({ responseStatus }, 'rsvp-webhook: non-RSVP response status, skipping');
      return;
    }

    const found = await this.invitations.findByGraphEventId(graphEventId);
    if (!found) {
      logger.warn({ graphEventId }, 'rsvp-webhook: no invitation for this meeting, skipping');
      return;
    }

    const { invitation, organizationId } = found;

    await runWithTenant(organizationId, async () => {
      const updated = await this.invitations.update(invitation.id, {
        rsvpStatus,
        respondedAt: new Date(),
      } as never);

      await writeAuditLog({
        organizationId,
        actorType: 'SYSTEM',
        action: 'invitation.rsvp_received',
        entityType: 'Invitation',
        entityId: updated.id,
        after: { rsvpStatus },
      });

      // `IV-08` — decline notifies the manager. Never silently skipped.
      if (rsvpStatus === 'DECLINED') {
        const learner = await learnerRepository.findByIdScoped(invitation.learnerId);
        const team = learner ? await teamRepository.findByIdScoped(learner.teamId) : null;
        logger.warn(
          { invitationId: updated.id, managerId: team?.managerId },
          'Learner declined a session invitation — manager notification due (P9 job)',
        );
      }
    });
  }
}

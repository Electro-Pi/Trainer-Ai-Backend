import { container } from '@/config/container.js';
import { env } from '@/config/env.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { logger } from '@/logger/logger.service.js';
import { PortalInviteRepository } from '@/modules/invites/repositories/portal-invite.repository.js';
import {
  inviteEmailSubject,
  renderInviteEmailHtml,
} from '@/modules/notifications/templates/invite-email.template.js';
import { organizationRepository } from '@/modules/organizations/organizations.module.js';
import type { EmailService } from '@/shared-types.js';

import type { QueuePayloads } from '../queues.js';

const invites = new PortalInviteRepository();

/** Sends the onboarding invite email — `PortalInvite` created synchronously by the `invites` service, delivery happens off the request path via this job (same shape as `report.send`). */
export async function processSendInviteJob(payload: QueuePayloads['invite.send']): Promise<void> {
  await runWithTenant(payload.organizationId, async () => {
    const invite = await invites.findById(payload.portalInviteId);
    if (!invite || invite.status !== 'PENDING') {
      logger.info(
        { portalInviteId: payload.portalInviteId },
        'send-invite: invite missing or no longer pending, skipping',
      );
      return;
    }

    const organization = await organizationRepository.findById(invite.organizationId);
    if (!organization) {
      logger.error({ portalInviteId: invite.id }, 'send-invite: organization not found, skipping');
      return;
    }

    const acceptUrl = new URL('/invite/accept', env.APP_URL);
    acceptUrl.searchParams.set('token', invite.token);

    const emailService = container.resolveEmail<EmailService>();
    await emailService.send({
      to: invite.email,
      subject: inviteEmailSubject(organization.name, organization.defaultLanguage),
      html: renderInviteEmailHtml({
        organizationName: organization.name,
        role: invite.role as 'DEPARTMENT_MANAGER' | 'CONTENT_CREATOR',
        acceptUrl: acceptUrl.toString(),
        language: organization.defaultLanguage,
      }),
      senderPortalUserId: invite.invitedById,
    });

    logger.info({ portalInviteId: invite.id }, 'Invite email sent');
  });
}

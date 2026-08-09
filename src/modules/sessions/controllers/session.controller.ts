import type { Request, Response } from 'express';

import type { AuthContext } from '@/common/types/express.js';

import type {
  InvitationResponseDto,
  RescheduleSessionDto,
  SessionResponseDto,
} from '../dto/session.dto.js';
import type { Invitation } from '../repositories/invitation.repository.js';
import type { Session } from '../repositories/session.repository.js';
import { type ActingUser, SessionService } from '../services/session.service.js';

const sessions = new SessionService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

function toResponseDto(session: Session): SessionResponseDto {
  return {
    id: session.id,
    planId: session.planId,
    learnerId: session.learnerId,
    primaryOutcomeId: session.primaryOutcomeId,
    sequence: session.sequence,
    scheduledStart: session.scheduledStart.toISOString(),
    scheduledEnd: session.scheduledEnd.toISOString(),
    durationMinutes: session.durationMinutes,
    status: session.status,
    verdict: session.verdict,
    score: session.score,
    joinUrl: session.joinUrl,
    startedAt: session.startedAt?.toISOString() ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
    cancelledAt: session.cancelledAt?.toISOString() ?? null,
  };
}

function toInvitationDto(invitation: Invitation): InvitationResponseDto {
  return {
    id: invitation.id,
    sessionId: invitation.sessionId,
    learnerId: invitation.learnerId,
    graphEventId: invitation.graphEventId,
    sentAt: invitation.sentAt.toISOString(),
    rsvpStatus: invitation.rsvpStatus,
    respondedAt: invitation.respondedAt?.toISOString() ?? null,
    reminderSentAt: invitation.reminderSentAt?.toISOString() ?? null,
    joinedAt: invitation.joinedAt?.toISOString() ?? null,
    leftAt: invitation.leftAt?.toISOString() ?? null,
    attendanceMinutes: invitation.attendanceMinutes,
  };
}

export class SessionController {
  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as {
      learnerId?: string;
      teamId?: string;
      status?: string;
      from?: string;
      to?: string;
    };
    const results = await sessions.list(query);
    res.status(200).json({
      data: results.map(toResponseDto),
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
  }

  async calendar(req: Request, res: Response): Promise<void> {
    const query = req.query as {
      learnerId?: string;
      teamId?: string;
      from?: string;
      to?: string;
    };
    const results = await sessions.calendar(query);
    res.status(200).json({
      data: results.map(toResponseDto),
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
  }

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const session = await sessions.getById(id);
    res.status(200).json(toResponseDto(session));
  }

  async reschedule(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as RescheduleSessionDto;
    const session = await sessions.reschedule(toActingUser(req.auth!), id, dto);
    res.status(200).json(toResponseDto(session));
  }

  async cancel(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const session = await sessions.cancel(toActingUser(req.auth!), id);
    res.status(200).json(toResponseDto(session));
  }

  async getInvitation(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const invitation = await sessions.getInvitation(id);
    res.status(200).json(toInvitationDto(invitation));
  }

  async resendInvitation(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const invitation = await sessions.resendInvitation(toActingUser(req.auth!), id);
    res.status(200).json(toInvitationDto(invitation));
  }
}

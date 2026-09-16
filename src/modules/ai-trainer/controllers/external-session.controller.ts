import type { Request, Response } from 'express';

import type { AuthContext } from '@/common/types/express.js';
import { learnerRepository } from '@/modules/learners/learners.module.js';
import { teamRepository } from '@/modules/teams/teams.module.js';

import type { StartExternalSessionRequestDto } from '../dto/ai-trainer.dto.js';
import { ExternalSessionRepository } from '../repositories/external-session.repository.js';
import { ExternalSessionService, type ActingUser } from '../services/external-session.service.js';

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId };
}

const externalSessions = new ExternalSessionRepository();

/**
 * Ownership resolution for the `/external-sessions/:id` reads, injected into
 * `requireTeamAccess` by `ai-trainer.routes.ts`.
 *
 * Resolved entirely inside this module: `ExternalSession.id` IS the AI
 * Trainer's `externalSessionId`, and the row carries `learnerId`, so the chain
 * is externalSessionId -> learner -> team without touching `sessions`. That
 * matters structurally as well as practically — `session.service.ts` imports
 * `ai-trainer.module.ts`, so reaching back into the `sessions` barrel from
 * here would close an import cycle (`import-x/no-cycle`), and reaching past
 * the barrel into its repository would breach the deep-import ban
 * (`no-restricted-imports`, ARCHITECTURE §4).
 *
 * Every lookup is tenant-scoped, so an id belonging to another organization
 * resolves to null and `requireTeamAccess` turns that into a 403.
 */
export async function resolveManagerIdByExternalSession(req: {
  params: { id?: string };
}): Promise<string | null> {
  const externalSessionId = req.params.id;
  if (!externalSessionId) return null;
  const externalSession = await externalSessions.findByIdScoped(externalSessionId);
  if (!externalSession) return null;
  const learner = await learnerRepository.findByIdScoped(externalSession.learnerId);
  if (!learner) return null;
  const team = await teamRepository.findByIdScoped(learner.teamId);
  return team?.managerId ?? null;
}

export class ExternalSessionController {
  private readonly service = new ExternalSessionService();

  /** `POST /external-sessions` — blocking, starts a live AI-trainer-bot session on an already-provisioned meeting link. */
  async start(req: Request, res: Response): Promise<void> {
    const dto = req.body as StartExternalSessionRequestDto;
    const result = await this.service.start(toActingUser(req.auth!), dto);
    res.status(201).json(result);
  }

  /** `GET /external-sessions/:id` — proxies live status; opportunistically refreshes our cached progress fields. */
  async getStatus(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const result = await this.service.getStatus(id);
    res.status(200).json(result);
  }

  /** `GET /external-sessions/:id/transcript` — proxies live, never cached. */
  async getTranscript(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const result = await this.service.getTranscript(id);
    res.status(200).json(result);
  }

  /** `GET /external-sessions/:id/evaluation` — proxies live, never cached. */
  async getEvaluation(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const result = await this.service.getEvaluation(id);
    res.status(200).json(result);
  }
}

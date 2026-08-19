import type { Request, Response } from 'express';

import type { AuthContext } from '@/common/types/express.js';

import type { StartExternalSessionRequestDto } from '../dto/ai-trainer.dto.js';
import { ExternalSessionService, type ActingUser } from '../services/external-session.service.js';

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId };
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

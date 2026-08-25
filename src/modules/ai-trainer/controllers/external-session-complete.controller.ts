import type { Request, Response } from 'express';

import type { WebhookSessionCompleteRequestDto } from '../dto/ai-trainer.dto.js';
import { ExternalSessionCompleteService } from '../services/external-session-complete.service.js';

export class ExternalSessionCompleteController {
  private readonly service = new ExternalSessionCompleteService();

  /** `POST /external-sessions/:id/complete` — the AI Trainer's meeting-end webhook. */
  async complete(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as WebhookSessionCompleteRequestDto;
    await this.service.complete(id, dto);
    res.status(200).json({ accepted: true });
  }
}

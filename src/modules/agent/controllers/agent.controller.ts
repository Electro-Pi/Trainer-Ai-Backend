import { randomUUID } from 'node:crypto';

import type { Request, Response } from 'express';

import { DEFAULT_TRANSCRIPT_RETENTION_DAYS } from '@/config/constants.js';
import { container } from '@/config/container.js';
import type { StorageService } from '@/shared-types.js';

import type {
  RemediationRequestDto,
  SubmitAnswerDto,
  SubmitNotesDto,
  SubmitTranscriptDto,
} from '../dto/agent.dto.js';
import { AgentSessionService } from '../services/agent-session.service.js';
import { CompleteSessionService } from '../services/complete-session.service.js';
import { RemediationService } from '../services/remediation.service.js';
import { SessionContextService } from '../services/session-context.service.js';

const context = new SessionContextService();
const agentSessions = new AgentSessionService();
const remediation = new RemediationService();
const completion = new CompleteSessionService();

export class AgentController {
  async getContext(req: Request, res: Response): Promise<void> {
    const { joinToken } = req.params as { joinToken: string };
    const result = await context.getByJoinToken(joinToken);
    res.status(200).json(result);
  }

  async markDelivered(req: Request, res: Response): Promise<void> {
    const { id, contentId } = req.params as { id: string; contentId: string };
    await agentSessions.markContentDelivered(id, contentId);
    res.status(204).send();
  }

  async start(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const session = await agentSessions.start(id);
    res.status(200).json({ id: session.id, status: session.status });
  }

  async submitAnswer(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as SubmitAnswerDto;
    await agentSessions.submitAnswer(id, dto);
    res.status(201).json({ accepted: true });
  }

  async remediation(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as RemediationRequestDto;
    const results = await remediation.find(id, dto.outcomeId);
    res.status(200).json({ data: results });
  }

  async submitNotes(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as SubmitNotesDto;
    await agentSessions.submitNotes(id, dto);
    res.status(201).json({ accepted: true });
  }

  async submitTranscript(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as SubmitTranscriptDto;

    const storage = container.resolveStorage<StorageService>();
    const blobKey = `transcripts/${id}/${randomUUID()}.txt`;
    await storage.upload(blobKey, Buffer.from(dto.transcriptText, 'utf8'), 'text/plain');

    await agentSessions.submitTranscript(
      id,
      blobKey,
      dto.recordingConsentGiven,
      DEFAULT_TRANSCRIPT_RETENTION_DAYS,
    );
    res.status(201).json({ accepted: true });
  }

  async complete(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const { rubricId } = req.body as { rubricId?: string };
    const result = await completion.complete(id, rubricId);
    res.status(200).json({
      sessionId: result.session.id,
      status: result.session.status,
      verdict: result.verdict,
      totalScore: result.totalScore,
    });
  }
}

import type { Request, Response } from 'express';

import { toCollectionResponse } from '@/common/interceptors/response-envelope.interceptor.js';
import type { AuthContext } from '@/common/types/express.js';

import type { ImportLearnersDto, InviteLearnerDto } from '../dto/learner.dto.js';
import { LearnerRepository } from '../repositories/learner.repository.js';
import { LearnerImportService, type ActingUser } from '../services/learner-import.service.js';

import { toResponseDto } from './learner.controller.js';

const importService = new LearnerImportService();
const learners = new LearnerRepository();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

/** `TM-02` — mounted under `/teams/:id/members` (team-owned URL, learners-owned logic). */
export class TeamMemberController {
  async importMembers(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as ImportLearnersDto;
    const result = await importService.importMany(toActingUser(req.auth!), id, dto.learners);
    res.status(201).json(result);
  }

  async importMembersCsv(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const { csv } = req.body as { csv: string };
    const result = await importService.importFromCsv(toActingUser(req.auth!), id, csv);
    res.status(201).json(result);
  }

  /** `TM-02` cross-tenant extension — invites a guest by email instead of importing an existing directory match. */
  async inviteMember(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as InviteLearnerDto;
    const result = await importService.inviteLearner(toActingUser(req.auth!), id, dto);
    res.status(201).json(result);
  }

  async listMembers(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const { limit, cursor } = req.query as unknown as { limit: number; cursor?: string };
    const page = await learners.findMany({
      ...(cursor ? { limit, cursor } : { limit }),
      where: { teamId: id },
    });
    const data = await Promise.all(page.data.map(toResponseDto));
    res.status(200).json(
      toCollectionResponse(data, {
        nextCursor: page.nextCursor,
        hasNextPage: page.hasNextPage,
      }),
    );
  }
}

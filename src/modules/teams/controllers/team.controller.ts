import type { Request, Response } from 'express';

import { toCollectionResponse } from '@/common/interceptors/response-envelope.interceptor.js';
import type { AuthContext } from '@/common/types/express.js';

import type { CreateTeamDto, TeamResponseDto, UpdateTeamDto } from '../dto/team.dto.js';
import type { Team } from '../repositories/team.repository.js';
import { TeamService, type ActingUser } from '../services/team.service.js';

const service = new TeamService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

function toResponseDto(team: Team): TeamResponseDto {
  return {
    id: team.id,
    organizationId: team.organizationId,
    managerId: team.managerId,
    name: team.name,
    description: team.description,
    createdAt: team.createdAt.toISOString(),
  };
}

export class TeamController {
  async list(req: Request, res: Response): Promise<void> {
    const { limit, cursor } = req.query as unknown as { limit: number; cursor?: string };
    const page = await service.list(limit, cursor);
    res.status(200).json(
      toCollectionResponse(page.data.map(toResponseDto), {
        nextCursor: page.nextCursor,
        hasNextPage: page.hasNextPage,
      }),
    );
  }

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const team = await service.getById(id);
    res.status(200).json(toResponseDto(team));
  }

  async create(req: Request, res: Response): Promise<void> {
    const dto = req.body as CreateTeamDto;
    const team = await service.create(toActingUser(req.auth!), dto);
    res.status(201).json(toResponseDto(team));
  }

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as UpdateTeamDto;
    const team = await service.update(toActingUser(req.auth!), id, dto);
    res.status(200).json(toResponseDto(team));
  }
}

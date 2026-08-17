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

async function toResponseDto(team: Team): Promise<TeamResponseDto> {
  const departmentName = await service.getDepartmentName(team.id);
  return {
    id: team.id,
    organizationId: team.organizationId,
    departmentId: team.departmentId,
    departmentName: departmentName ?? '',
    managerId: team.managerId,
    name: team.name,
    description: team.description,
    createdAt: team.createdAt.toISOString(),
  };
}

export class TeamController {
  async list(req: Request, res: Response): Promise<void> {
    const { limit, cursor } = req.query as unknown as { limit: number; cursor?: string };
    const page = await service.list(toActingUser(req.auth!), limit, cursor);
    const data = await Promise.all(page.data.map(toResponseDto));
    res.status(200).json(
      toCollectionResponse(data, {
        nextCursor: page.nextCursor,
        hasNextPage: page.hasNextPage,
      }),
    );
  }

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const team = await service.getById(id);
    res.status(200).json(await toResponseDto(team));
  }

  async create(req: Request, res: Response): Promise<void> {
    const dto = req.body as CreateTeamDto;
    const team = await service.create(toActingUser(req.auth!), dto);
    res.status(201).json(await toResponseDto(team));
  }

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as UpdateTeamDto;
    const team = await service.update(toActingUser(req.auth!), id, dto);
    res.status(200).json(await toResponseDto(team));
  }
}

export interface TeamResponseDto {
  id: string;
  organizationId: string;
  managerId: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface CreateTeamDto {
  name: string;
  description?: string;
  managerId?: string;
}

export interface UpdateTeamDto {
  name?: string;
  description?: string;
  managerId?: string;
}

export interface TeamFilterDto {
  limit?: number;
  cursor?: string;
}

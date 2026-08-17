export interface TeamResponseDto {
  id: string;
  organizationId: string;
  departmentId: string;
  departmentName: string;
  managerId: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface CreateTeamDto {
  name: string;
  description?: string;
  departmentId: string;
  managerId?: string;
}

export interface UpdateTeamDto {
  name?: string;
  description?: string;
  departmentId?: string;
  managerId?: string;
}

export interface TeamFilterDto {
  limit?: number;
  cursor?: string;
}

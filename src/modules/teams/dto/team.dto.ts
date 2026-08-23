export interface TeamResponseDto {
  id: string;
  organizationId: string;
  departmentId: string;
  departmentName: string;
  managerId: string | null;
  pendingManagerInvite: { id: string; email: string } | null;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
}

export interface CreateTeamDto {
  name: string;
  description?: string;
  departmentId: string;
  managerId?: string;
  pendingManagerInviteId?: string;
}

export interface UpdateTeamDto {
  name?: string;
  description?: string;
  departmentId?: string;
  managerId?: string;
  pendingManagerInviteId?: string;
}

export interface TeamFilterDto {
  limit?: number;
  cursor?: string;
}

export interface TeamResponseDto {
  id: string;
  organizationId: string;
  departmentId: string;
  departmentName: string;
  managerId: string | null;
  pendingManagerInvite: { id: string; email: string } | null;
  /** English compatibility alias retained for older portal clients. */
  name: string;
  nameEn: string;
  nameAr: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
}

export interface CreateTeamDto {
  /** Legacy single-name input. New clients should submit both localized fields. */
  name?: string;
  nameEn?: string;
  nameAr?: string;
  description?: string;
  departmentId: string;
  managerId?: string;
  pendingManagerInviteId?: string;
}

export interface UpdateTeamDto {
  name?: string;
  nameEn?: string;
  nameAr?: string;
  description?: string;
  departmentId?: string;
  managerId?: string;
  pendingManagerInviteId?: string;
}

export interface TeamFilterDto {
  limit?: number;
  cursor?: string;
}

export interface CreatePortalInviteDto {
  email: string;
  role: 'DEPARTMENT_MANAGER' | 'CONTENT_CREATOR';
}

export interface PortalInviteResponseDto {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  status: string;
  invitedById: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

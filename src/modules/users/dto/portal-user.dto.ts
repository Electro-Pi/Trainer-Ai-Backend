export interface PortalUserResponseDto {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: string;
  locale: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CreatePortalUserDto {
  email: string;
  name: string;
  role: 'DEPARTMENT_MANAGER' | 'CONTENT_CREATOR' | 'ADMIN';
  password?: string;
  locale?: 'EN' | 'AR';
}

export interface UpdatePortalUserDto {
  name?: string;
  role?: 'DEPARTMENT_MANAGER' | 'CONTENT_CREATOR' | 'ADMIN';
  locale?: 'EN' | 'AR';
  isActive?: boolean;
}

export interface PortalUserFilterDto {
  limit?: number;
  cursor?: string;
}

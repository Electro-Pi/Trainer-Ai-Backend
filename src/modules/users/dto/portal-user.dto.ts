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
  role: 'MANAGER' | 'HR' | 'CONTENT_MANAGER' | 'ADMIN';
  password?: string;
  locale?: 'EN' | 'AR';
}

export interface UpdatePortalUserDto {
  name?: string;
  role?: 'MANAGER' | 'HR' | 'CONTENT_MANAGER' | 'ADMIN';
  locale?: 'EN' | 'AR';
  isActive?: boolean;
}

export interface PortalUserFilterDto {
  limit?: number;
  cursor?: string;
}

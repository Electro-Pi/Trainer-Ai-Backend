export interface OrganizationResponseDto {
  id: string;
  name: string;
  defaultLanguage: 'EN' | 'AR';
  entraTenantId: string | null;
  createdAt: string;
}

export interface UpdateOrganizationDto {
  name?: string;
  defaultLanguage?: 'EN' | 'AR';
}

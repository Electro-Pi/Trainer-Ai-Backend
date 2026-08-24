export interface DepartmentResponseDto {
  id: string;
  organizationId: string;
  nameEn: string;
  nameAr: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDepartmentDto {
  nameEn: string;
  nameAr: string;
  isEnabled?: boolean;
}

export interface UpdateDepartmentDto {
  nameEn?: string;
  nameAr?: string;
  isEnabled?: boolean;
}

export interface DepartmentFilterDto {
  limit?: number;
  cursor?: string;
}

export interface DepartmentResponseDto {
  id: string;
  organizationId: string;
  name: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDepartmentDto {
  name: string;
}

export interface UpdateDepartmentDto {
  name?: string;
  isEnabled?: boolean;
}

export interface DepartmentFilterDto {
  limit?: number;
  cursor?: string;
}

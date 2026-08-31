export interface TokenResponseDto {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
}

export interface AuthorizeUrlResponseDto {
  url: string;
}

export interface MeResponseDto {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: string;
  locale: string;
  /** DEPARTMENT_MANAGER only — names of the department(s) behind the teams they manage. Empty for other roles or a manager with no team yet. */
  managedDepartmentNames: string[];
  /** Arabic counterpart of `managedDepartmentNames`, same order — falls back to the English name when a department has no `nameAr`. */
  managedDepartmentNamesAr: string[];
}

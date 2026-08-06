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
}

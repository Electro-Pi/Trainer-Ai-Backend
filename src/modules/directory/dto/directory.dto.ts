export interface DirectoryUserDto {
  entraObjectId: string;
  displayName: string;
  email: string | null;
  userPrincipalName: string;
}

export interface DirectorySearchFilterDto {
  q: string;
}

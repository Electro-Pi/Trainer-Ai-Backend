export interface ContentResponseDto {
  id: string;
  organizationId: string;
  skillId: string;
  name: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContentDto {
  skillId: string;
  name: string;
}

export interface UpdateContentDto {
  name?: string;
}

export interface ContentFilterDto {
  limit?: number;
  cursor?: string;
  skillId?: string;
}

export interface MediaResponseDto {
  id: string;
  contentItemId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  caption: string | null;
  altTextEn: string | null;
  altTextAr: string | null;
  extractedText: string | null;
  pageCount: number | null;
  scanStatus: 'PENDING' | 'CLEAN' | 'INFECTED' | 'FAILED';
  downloadUrl: string;
  createdAt: string;
}

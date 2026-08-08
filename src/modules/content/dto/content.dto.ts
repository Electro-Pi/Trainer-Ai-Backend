export interface ContentResponseDto {
  id: string;
  organizationId: string;
  title: string;
  trackId: string;
  levelId: string;
  contentType: 'DOCUMENT' | 'SLIDES' | 'TEXT' | 'LINK' | 'IMAGE';
  textBody: string | null;
  sourceUrl: string | null;
  language: 'EN' | 'AR';
  estimatedMinutes: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  status: 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
  version: number;
  parentVersionId: string | null;
  isMandatory: boolean;
  skillTags: string[];
  outcomeIds: string[];
  createdById: string;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContentDto {
  title: string;
  trackId: string;
  levelId: string;
  contentType: 'DOCUMENT' | 'SLIDES' | 'TEXT' | 'LINK' | 'IMAGE';
  textBody?: string;
  sourceUrl?: string;
  language: 'EN' | 'AR';
  estimatedMinutes: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  isMandatory?: boolean;
  skillTags?: string[];
  outcomeIds: string[];
}

export interface UpdateContentDto {
  title?: string;
  textBody?: string;
  sourceUrl?: string;
  estimatedMinutes?: number;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  isMandatory?: boolean;
  skillTags?: string[];
  outcomeIds?: string[];
}

export interface ContentFilterDto {
  limit?: number;
  cursor?: string;
  trackId?: string;
  levelId?: string;
  status?: 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
  contentType?: 'DOCUMENT' | 'SLIDES' | 'TEXT' | 'LINK' | 'IMAGE';
  language?: 'EN' | 'AR';
}

export interface BulkCreateContentDto {
  items: CreateContentDto[];
  sharedTags?: string[];
}

export interface BulkMetadataEditDto {
  contentItemIds: string[];
  skillTags?: string[];
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  isMandatory?: boolean;
}

export interface CoverageGapDto {
  outcomeId: string;
  outcomeTitleEn: string;
  outcomeTitleAr: string;
  levelId: string;
  trackId: string;
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

export interface ContentSearchResultDto {
  contentItemId: string;
  title: string;
  contentType: string;
  language: string;
  matchType: 'FULL_TEXT' | 'SEMANTIC';
  score: number;
  snippet: string;
}

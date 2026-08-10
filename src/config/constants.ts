export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// CM-07
export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

export const MIME_ALLOWLIST_BY_CONTENT_TYPE = {
  DOCUMENT: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  SLIDES: [
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  IMAGE: ['image/png', 'image/jpeg', 'image/webp'],
  TEXT: [],
  LINK: [],
} as const;

export const DEFAULT_TRANSCRIPT_RETENTION_DAYS = 90;
export const DEFAULT_AUDIT_RETENTION_DAYS = 730;

export const JWT_ACCESS_TOKEN_ALGORITHM = 'RS256';

// `cleanup.job` (ARCHITECTURE §10.1) — windows for by-products that have no
// per-org override (`RefreshToken`, quarantined media, orphaned blobs, temp
// files). Transcript and audit-log windows come from `Organization` instead.
export const REFRESH_TOKEN_RETENTION_DAYS = 30;
export const INFECTED_MEDIA_RETENTION_DAYS = 7;
export const ORPHANED_BLOB_RETENTION_HOURS = 24;
export const CLEANUP_BATCH_SIZE = 500;

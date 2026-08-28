export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// CM-07
export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

/** Content is document-only — one uploaded file per content item. */
export const DOCUMENT_MIME_ALLOWLIST = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export const DEFAULT_TRANSCRIPT_RETENTION_DAYS = 90;
export const DEFAULT_AUDIT_RETENTION_DAYS = 730;

export const JWT_ACCESS_TOKEN_ALGORITHM = 'RS256';

// `cleanup.job` (ARCHITECTURE §10.1) — windows for by-products that have no
// per-org override (`RefreshToken`, orphaned blobs, temp files). Transcript
// and audit-log windows come from `Organization` instead.
export const REFRESH_TOKEN_RETENTION_DAYS = 30;
export const ORPHANED_BLOB_RETENTION_HOURS = 24;
export const CLEANUP_BATCH_SIZE = 500;

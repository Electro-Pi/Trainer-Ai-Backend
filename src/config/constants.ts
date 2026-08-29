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

// `reconcile-external-sessions.job` — the AI Trainer's meeting-end webhook
// (`POST /external-sessions/:id/complete`) is the ONLY signal that a
// Teams-dispatched session ended. When it never arrives the session sits at
// its pre-meeting status forever and nobody is told: no report is generated,
// and the failure is indistinguishable from a meeting that simply hasn't
// happened yet. This sweep is that missing backstop.
//
// The grace window is deliberately generous — a session running long is
// normal and must not be reconciled out from under a meeting still in
// progress; the webhook is the happy path and this only ever catches what it
// missed.
export const EXTERNAL_SESSION_RECONCILE_GRACE_MINUTES = 30;
export const EXTERNAL_SESSION_RECONCILE_BATCH_SIZE = 25;

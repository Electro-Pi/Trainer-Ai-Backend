// Shared contracts imported by more than one module (ARCHITECTURE §4.2).
// Provider interfaces, JWT claims, job payload types and config shapes live
// here; request/response/filter DTOs stay in each module's `dto/`.

export interface JwtAccessClaims {
  sub: string;
  orgId: string;
  role: string;
  locale: string;
}

// ─────────────────────────────────────────────────────────────────────────
// P5 — Storage, scanning (ARCHITECTURE §4.5, §4, D-14)
// ─────────────────────────────────────────────────────────────────────────

export interface StorageBlobListing {
  blobKey: string;
  createdAt: Date;
}

/** File storage, backed by UploadThing (`UploadThingStorageService`). */
export interface StorageService {
  /** Uploads a buffer under `blobKey`, returns nothing — callers read the key back via `getDownloadUrl`. */
  upload(blobKey: string, data: Buffer, contentType: string): Promise<void>;
  /** Time-limited signed/SAS URL for reading `blobKey` (§9.11 media access assumption). */
  getDownloadUrl(blobKey: string, expiresInSeconds?: number): Promise<string>;
  delete(blobKey: string): Promise<void>;
  /** Every blob key currently in storage — `cleanup.job`'s orphaned-blob sweep (§10.1) cross-references this against `MediaAsset.blobKey`. */
  list(): Promise<StorageBlobListing[]>;
}

export interface ScanResult {
  status: 'CLEAN' | 'INFECTED' | 'FAILED';
  signature?: string | undefined;
}

/** Malware scanning (`ClamAvScanner` real, `FakeScanner` dev/test default — CM-07). */
export interface Scanner {
  scan(data: Buffer): Promise<ScanResult>;
}

// ─────────────────────────────────────────────────────────────────────────
// P9 — Notifications (ARCHITECTURE §4.5, `RP-02`)
// ─────────────────────────────────────────────────────────────────────────

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  /** `GraphEmailService` sends "as" this `PortalUser` (their own Graph session, `Mail.Send` scope); ignored by SMTP/fake. */
  senderPortalUserId?: string;
}

/**
 * Mail delivery (`GraphEmailService` primary via Graph `sendMail`, `SmtpEmailService`
 * fallback, `FakeEmailService` dev/test default — never send real mail from dev, §4.5).
 */
export interface EmailService {
  send(input: SendMailInput): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────
// P12 — Observability (ARCHITECTURE §4.5)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Error tracking (`FakeErrorTracker` — §4.5). `errorHandler` reports every
 * 5xx here in addition to logging it; pino stays the source of truth for
 * full request context, this is only for aggregation/alerting across
 * occurrences.
 */
export interface ErrorTracker {
  captureException(error: unknown, context?: Record<string, unknown>): void;
}

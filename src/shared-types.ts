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
// P5 — Storage, scanning, OCR, embeddings (ARCHITECTURE §4.5, §4, D-14)
// ─────────────────────────────────────────────────────────────────────────

/** Swappable file storage (`AzureStorageService` real, `LocalStorageService` dev default). */
export interface StorageService {
  /** Uploads a buffer under `blobKey`, returns nothing — callers read the key back via `getDownloadUrl`. */
  upload(blobKey: string, data: Buffer, contentType: string): Promise<void>;
  /** Time-limited signed/SAS URL for reading `blobKey` (§9.11 media access assumption). */
  getDownloadUrl(blobKey: string, expiresInSeconds?: number): Promise<string>;
  delete(blobKey: string): Promise<void>;
}

export interface ScanResult {
  status: 'CLEAN' | 'INFECTED' | 'FAILED';
  signature?: string | undefined;
}

/** Malware scanning (`ClamAvScanner` real, `FakeScanner` dev/test default — CM-07). */
export interface Scanner {
  scan(data: Buffer): Promise<ScanResult>;
}

/** Text extraction from documents/slides/images (`CM-05`). Ours per D-14; fake is the default. */
export interface OcrService {
  extractText(data: Buffer, mimeType: string): Promise<{ text: string; pageCount?: number }>;
}

/** Vector embeddings for semantic similarity (`CM-09`) — ours, not the AI team's (MEMORY D-15). */
export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  readonly dimensions: number;
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

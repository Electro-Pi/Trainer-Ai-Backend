import type { OcrService } from '@/shared-types.js';

/**
 * Deterministic dev/test default (ARCHITECTURE §4.5, D-14) — no Azure
 * dependency. Returns a stable placeholder derived from the buffer's byte
 * length so repeated runs against the same fixture produce identical text
 * (matters for embedding determinism in tests, per D-14's reproducible-
 * ranking rationale).
 */
export class FakeOcrService implements OcrService {
  extractText(data: Buffer, mimeType: string): Promise<{ text: string; pageCount?: number }> {
    const pageCount = Math.max(1, Math.ceil(data.length / 50_000));
    return Promise.resolve({
      text: `[fake-ocr] Extracted text from a ${mimeType} file of ${data.length} bytes.`,
      pageCount,
    });
  }
}

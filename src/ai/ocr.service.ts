import OpenAI from 'openai';

import { ExternalServiceError } from '@/common/exceptions/app-error.js';
import { env } from '@/config/env.js';
import type { OcrService } from '@/shared-types.js';

const EXTRACTION_PROMPT =
  'Extract all text from this document exactly as written, preserving reading order. ' +
  'Output only the extracted text — no commentary, no markdown formatting. ' +
  'The document may be in Arabic, English, or both.';

/**
 * Real implementation (ARCHITECTURE §4.5, `CM-05`) — OpenAI's vision model
 * reading PDFs/images directly, chosen for its Arabic text recognition.
 * ⚠ BRD §11.2 flags Arabic accuracy on low-resolution/handwritten input as
 * an unverified risk (MEMORY) — validate against real Arabic samples before
 * relying on this for production content.
 *
 * Only PDF and image mimetypes are supported (OpenAI's file input doesn't
 * parse Word/PowerPoint) — DOC/DOCX/PPT/PPTX uploads still succeed, they
 * just skip text extraction (MediaAsset.extractedText stays empty).
 */
export class OpenAiOcrService implements OcrService {
  private readonly client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  async extractText(data: Buffer, mimeType: string): Promise<{ text: string; pageCount?: number }> {
    const content = this.buildContentPart(data, mimeType);
    if (!content) {
      return { text: '' };
    }

    const completion = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: [content, { type: 'text', text: EXTRACTION_PROMPT }] }],
    });

    const text = completion.choices[0]?.message.content;
    if (text === null || text === undefined) {
      throw new ExternalServiceError('OpenAI returned no extracted text');
    }
    return { text };
  }

  private buildContentPart(
    data: Buffer,
    mimeType: string,
  ):
    | { type: 'file'; file: { filename: string; file_data: string } }
    | { type: 'image_url'; image_url: { url: string } }
    | undefined {
    const base64 = data.toString('base64');
    if (mimeType === 'application/pdf') {
      return {
        type: 'file',
        file: { filename: 'document.pdf', file_data: `data:${mimeType};base64,${base64}` },
      };
    }
    if (mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp') {
      return { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } };
    }
    return undefined;
  }
}

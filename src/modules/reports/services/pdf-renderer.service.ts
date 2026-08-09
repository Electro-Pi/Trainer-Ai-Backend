import { type Browser, chromium } from 'playwright';

import { ExternalServiceError } from '@/common/exceptions/app-error.js';
import { logger } from '@/logger/logger.service.js';

/**
 * `RP-01` — Playwright (Chromium) is the only reliable way to render RTL
 * Arabic reports correctly (ARCHITECTURE §4.3). One browser process is
 * launched lazily and reused across renders ("pooled") — a fresh page per
 * PDF, not a fresh browser, since browser startup dominates render time.
 * Runs inside the worker process (`report.generate` job), never the API
 * event loop.
 */
export class PdfRendererService {
  private browserPromise: Promise<Browser> | undefined;

  private async getBrowser(): Promise<Browser> {
    this.browserPromise ??= chromium.launch({ headless: true });
    return this.browserPromise;
  }

  async renderPdf(html: string): Promise<Buffer> {
    let browser: Browser;
    try {
      browser = await this.getBrowser();
    } catch (error) {
      throw new ExternalServiceError('Failed to launch PDF renderer', error);
    }

    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
      });
      return pdf;
    } catch (error) {
      throw new ExternalServiceError('PDF rendering failed', error);
    } finally {
      await page.close().catch((error: unknown) => {
        logger.warn({ error }, 'Failed to close Playwright page');
      });
    }
  }

  async close(): Promise<void> {
    if (!this.browserPromise) return;
    const browser = await this.browserPromise;
    await browser.close();
    this.browserPromise = undefined;
  }
}

export const pdfRendererService = new PdfRendererService();

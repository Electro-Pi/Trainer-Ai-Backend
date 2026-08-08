import { AzureKeyCredential } from '@azure/core-auth';
import DocumentIntelligence, {
  getLongRunningPoller,
  isUnexpected,
} from '@azure-rest/ai-document-intelligence';
import type { AnalyzeOperationOutput } from '@azure-rest/ai-document-intelligence';

import { ExternalServiceError } from '@/common/exceptions/app-error.js';
import { env } from '@/config/env.js';
import type { OcrService } from '@/shared-types.js';

/**
 * Real implementation (ARCHITECTURE §4.5, `CM-05`) — Azure Document
 * Intelligence's `prebuilt-read` model, chosen over `prebuilt-layout`
 * because CM-05 needs plain extracted text, not table/form structure.
 * ⚠ BRD §11.2 flags Arabic accuracy on low-resolution/handwritten input as
 * an unverified risk (MEMORY) — validate against real Arabic samples before
 * relying on this for production content.
 */
export class AzureOcrService implements OcrService {
  private readonly client = DocumentIntelligence(
    env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
    new AzureKeyCredential(env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY),
  );

  async extractText(
    data: Buffer,
    _mimeType: string,
  ): Promise<{ text: string; pageCount?: number }> {
    const initialResponse = await this.client
      .path('/documentModels/{modelId}:analyze', 'prebuilt-read')
      .post({
        contentType: 'application/json',
        body: { base64Source: data.toString('base64') },
      });

    if (isUnexpected(initialResponse)) {
      throw new ExternalServiceError(
        'Document Intelligence analyze request failed',
        initialResponse.body,
      );
    }

    const poller = getLongRunningPoller(this.client, initialResponse);
    const result = (await poller.pollUntilDone()).body as AnalyzeOperationOutput;

    const analyzeResult = result.analyzeResult;
    if (!analyzeResult) {
      throw new ExternalServiceError('Document Intelligence returned no result');
    }

    return {
      text: analyzeResult.content ?? '',
      pageCount: analyzeResult.pages?.length,
    };
  }
}

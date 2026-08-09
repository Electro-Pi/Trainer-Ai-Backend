import { AzureEmbeddingService } from '@/ai/embedding.service.js';
import { FakeEmbeddingService } from '@/ai/fakes/fake-embedding.service.js';
import { FakeLlmService } from '@/ai/fakes/fake-llm.service.js';
import { FakeOcrService } from '@/ai/fakes/fake-ocr.service.js';
import { HttpAiServiceClient } from '@/ai/http-ai-service-client.js';
import type { AiServiceClient } from '@/ai/interfaces/ai-service-client.interface.js';
import { AzureOcrService } from '@/ai/ocr.service.js';
import { env } from '@/config/env.js';
import { FakeEmailService } from '@/email/fakes/fake-email.service.js';
import { GraphEmailService } from '@/email/graph-email.service.js';
import { SmtpEmailService } from '@/email/smtp-email.service.js';
import { FakeGraphService } from '@/integrations/microsoft/fake-graph.service.js';
import type { GraphService } from '@/integrations/microsoft/graph.interfaces.js';
import { RealGraphService } from '@/integrations/microsoft/graph.service.js';
import type {
  EmailService,
  EmbeddingService,
  OcrService,
  Scanner,
  StorageService,
} from '@/shared-types.js';
import { AzureStorageService } from '@/storage/azure-storage.service.js';
import { LocalStorageService } from '@/storage/local-storage.service.js';
import { ClamAvScanner } from '@/storage/scanner/clamav.scanner.js';
import { FakeScanner } from '@/storage/scanner/fake-scanner.service.js';

// DI wiring shape (ARCHITECTURE §4.5). Every external dependency resolves
// to a fake by default via its `<X>_PROVIDER` env flag, lazily constructed
// and cached as a singleton per `resolveX()` call.

export interface Container {
  resolveGraph(): GraphService;
  resolveAiService<T>(): T;
  resolveStorage<T>(): T;
  resolveScanner<T>(): T;
  resolveEmbedding<T>(): T;
  resolveOcr<T>(): T;
  resolveEmail<T>(): T;
}

export function createContainer(): Container {
  let graphService: GraphService | undefined;
  let storageService: StorageService | undefined;
  let scanner: Scanner | undefined;
  let ocrService: OcrService | undefined;
  let embeddingService: EmbeddingService | undefined;
  let aiServiceClient: AiServiceClient | undefined;
  let emailService: EmailService | undefined;

  return {
    resolveGraph: () => {
      graphService ??=
        env.GRAPH_PROVIDER === 'real' ? new RealGraphService() : new FakeGraphService();
      return graphService;
    },
    resolveAiService: <T>() => {
      aiServiceClient ??=
        env.AI_SERVICE_PROVIDER === 'real' ? new HttpAiServiceClient() : new FakeLlmService();
      return aiServiceClient as T;
    },
    resolveStorage: <T>() => {
      storageService ??=
        env.STORAGE_PROVIDER === 'azure' ? new AzureStorageService() : new LocalStorageService();
      return storageService as T;
    },
    resolveScanner: <T>() => {
      scanner ??= env.SCANNER_PROVIDER === 'clamav' ? new ClamAvScanner() : new FakeScanner();
      return scanner as T;
    },
    resolveEmbedding: <T>() => {
      embeddingService ??=
        env.EMBEDDING_PROVIDER === 'azure'
          ? new AzureEmbeddingService()
          : new FakeEmbeddingService();
      return embeddingService as T;
    },
    resolveOcr: <T>() => {
      ocrService ??= env.OCR_PROVIDER === 'azure' ? new AzureOcrService() : new FakeOcrService();
      return ocrService as T;
    },
    resolveEmail: <T>() => {
      emailService ??=
        env.EMAIL_PROVIDER === 'graph'
          ? new GraphEmailService()
          : env.EMAIL_PROVIDER === 'smtp'
            ? new SmtpEmailService()
            : new FakeEmailService();
      return emailService as T;
    },
  };
}

export const container = createContainer();

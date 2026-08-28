import { FakeLlmService } from '@/ai/fakes/fake-llm.service.js';
import { HttpAiServiceClient } from '@/ai/http-ai-service-client.js';
import type { AiServiceClient } from '@/ai/interfaces/ai-service-client.interface.js';
import { env } from '@/config/env.js';
import { FakeEmailService } from '@/email/fakes/fake-email.service.js';
import { GraphEmailService } from '@/email/graph-email.service.js';
import { SmtpEmailService } from '@/email/smtp-email.service.js';
import { FakeGraphService } from '@/integrations/microsoft/fake-graph.service.js';
import type { GraphService } from '@/integrations/microsoft/graph.interfaces.js';
import { RealGraphService } from '@/integrations/microsoft/graph.service.js';
import { FakeErrorTracker } from '@/observability/fake-error-tracker.service.js';
import type { EmailService, ErrorTracker, StorageService } from '@/shared-types.js';
import { UploadThingStorageService } from '@/storage/uploadthing-storage.service.js';

// DI wiring shape (ARCHITECTURE §4.5). Every external dependency resolves
// to a fake by default via its `<X>_PROVIDER` env flag, lazily constructed
// and cached as a singleton per `resolveX()` call.

export interface Container {
  resolveGraph(): GraphService;
  resolveAiService<T>(): T;
  resolveStorage<T>(): T;
  resolveEmail<T>(): T;
  resolveErrorTracker<T>(): T;
}

export function createContainer(): Container {
  let graphService: GraphService | undefined;
  let storageService: StorageService | undefined;
  let aiServiceClient: AiServiceClient | undefined;
  let emailService: EmailService | undefined;
  let errorTracker: ErrorTracker | undefined;

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
      storageService ??= new UploadThingStorageService();
      return storageService as T;
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
    resolveErrorTracker: <T>() => {
      errorTracker ??= new FakeErrorTracker();
      return errorTracker as T;
    },
  };
}

export const container = createContainer();

import { env } from '@/config/env.js';

// DI wiring shape (ARCHITECTURE §4.5). Every external dependency resolves
// to a fake by default via its `<X>_PROVIDER` env flag. The concrete real
// and fake implementations do not exist yet — Graph, AI, storage, scanner,
// embedding, OCR and email each arrive with the phase that needs them. This
// file fixes the *pattern* other phases plug into: one `registerXxx()`
// factory per provider interface, switched on its env flag, resolved once
// and cached.

export type ProviderKind =
  'graph' | 'aiService' | 'storage' | 'scanner' | 'embedding' | 'ocr' | 'email';

class NotImplementedYetError extends Error {
  constructor(kind: ProviderKind, provider: string) {
    super(
      `No implementation registered yet for provider "${kind}" (configured: "${provider}"). This lands with the phase that owns it.`,
    );
    this.name = 'NotImplementedYetError';
  }
}

export interface Container {
  resolveGraph<T>(): T;
  resolveAiService<T>(): T;
  resolveStorage<T>(): T;
  resolveScanner<T>(): T;
  resolveEmbedding<T>(): T;
  resolveOcr<T>(): T;
  resolveEmail<T>(): T;
}

/**
 * Placeholder container — every branch currently throws
 * `NotImplementedYetError` rather than fabricating a fake class that a
 * later phase is supposed to author for real (e.g. `FakeLlmService` is
 * ai/fakes' job, not P0's). Real registration replaces each `resolveX`
 * body with a lazily-constructed singleton, still switched on the same
 * `env.*_PROVIDER` flag.
 */
export function createContainer(): Container {
  const notYet = (kind: ProviderKind, provider: string): never => {
    throw new NotImplementedYetError(kind, provider);
  };

  return {
    resolveGraph: <T>() => notYet('graph', env.GRAPH_PROVIDER) as T,
    resolveAiService: <T>() => notYet('aiService', env.AI_SERVICE_PROVIDER) as T,
    resolveStorage: <T>() => notYet('storage', env.STORAGE_PROVIDER) as T,
    resolveScanner: <T>() => notYet('scanner', env.SCANNER_PROVIDER) as T,
    resolveEmbedding: <T>() => notYet('embedding', env.EMBEDDING_PROVIDER) as T,
    resolveOcr: <T>() => notYet('ocr', env.OCR_PROVIDER) as T,
    resolveEmail: <T>() => notYet('email', env.EMAIL_PROVIDER) as T,
  };
}

export const container = createContainer();

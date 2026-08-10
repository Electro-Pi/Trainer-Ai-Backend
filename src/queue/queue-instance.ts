import { createQueueConnection, createQueueService } from './queue.service.js';

// Process-wide `QueueService` singleton (ARCHITECTURE §10) — P0 left this
// unbuilt on purpose ("jobs are added by the phases that need them"); P5 is
// the first phase where a *service* (not just `index.ts`'s own local
// instance) needs to enqueue a job, e.g. content publish → `content.embed`.
// One pg-boss connection (on the same Postgres database), shared by every
// enqueue call in the api process.
const connection = createQueueConnection();
export const queueService = createQueueService(connection);

export async function closeQueueService(): Promise<void> {
  await queueService.closeAll();
}

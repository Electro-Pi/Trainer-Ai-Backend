import { EventEmitter } from 'node:events';

import type { Logger } from '@/logger/logger.service.js';

import type { EventName, EventPayloads } from './events.js';

export type EventHandler<K extends EventName> = (payload: EventPayloads[K]) => Promise<void> | void;

/**
 * Thin typed wrapper around Node's EventEmitter (ARCHITECTURE §4.4).
 *
 * ⚠ Invariant enforced by caller discipline, not by this class:
 * `publish()` must only be called AFTER the enclosing transaction commits,
 * never inside it. A rolled-back transaction that already published has
 * announced something that did not happen. There is no transaction concept
 * at this layer to check against mechanically — Prisma transactions arrive
 * in P1 — so this is one clear comment, not a runtime guard.
 */
export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor(private readonly logger: Logger) {
    this.emitter.setMaxListeners(50);
  }

  publish<K extends EventName>(name: K, payload: EventPayloads[K]): void {
    this.emitter.emit(name, payload);
  }

  subscribe<K extends EventName>(name: K, handler: EventHandler<K>): void {
    this.emitter.on(name, (payload: EventPayloads[K]) => {
      // Handlers must not throw into the publisher (rule 3) — one failing
      // handler cannot break the request or the other handlers.
      Promise.resolve()
        .then(() => handler(payload))
        .catch((error: unknown) => {
          this.logger.error({ err: error, event: name }, 'Event handler failed');
        });
    });
  }
}

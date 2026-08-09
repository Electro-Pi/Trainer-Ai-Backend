import { describe, expect, it, vi } from 'vitest';

import { EventBus } from '@/events/event-bus.js';
import type { EventName, EventPayloads } from '@/events/events.js';

const silentLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as never;

// A real, typed event name/payload pair from the catalogue, used purely as a
// vehicle to test EventBus's own dispatch mechanics — not to exercise any
// particular module's business logic (that's what the handler-specific
// integration tests do).
const TEST_EVENT = 'learner.level.assigned' satisfies EventName;
function payload(): EventPayloads['learner.level.assigned'] {
  return {
    organizationId: 'org-1',
    learnerId: 'learner-1',
    trackId: 'track-1',
    levelId: 'level-1',
    assignedById: 'user-1',
  };
}

describe('EventBus — handler isolation (rule: a failing handler must not break the request or its siblings)', () => {
  it('a throwing handler does not prevent a sibling handler from running', async () => {
    const bus = new EventBus(silentLogger);
    const goodHandler = vi.fn();

    bus.subscribe(TEST_EVENT, () => {
      throw new Error('boom');
    });
    bus.subscribe(TEST_EVENT, goodHandler);

    bus.publish(TEST_EVENT, payload());

    // Handlers run via `Promise.resolve().then()` — yield the microtask queue.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(goodHandler).toHaveBeenCalledTimes(1);
  });

  it('a throwing handler does not throw synchronously into publish() itself', () => {
    const bus = new EventBus(silentLogger);
    bus.subscribe(TEST_EVENT, () => {
      throw new Error('boom');
    });

    expect(() => bus.publish(TEST_EVENT, payload())).not.toThrow();
  });

  it('a handler that returns a rejected promise is isolated the same way a throw is', async () => {
    const bus = new EventBus(silentLogger);
    const goodHandler = vi.fn();

    bus.subscribe(TEST_EVENT, async () => {
      throw new Error('async boom');
    });
    bus.subscribe(TEST_EVENT, goodHandler);

    expect(() => bus.publish(TEST_EVENT, payload())).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(goodHandler).toHaveBeenCalledTimes(1);
  });

  it('every subscribed handler receives the same published payload', async () => {
    const bus = new EventBus(silentLogger);
    const first = vi.fn();
    const second = vi.fn();
    bus.subscribe(TEST_EVENT, first);
    bus.subscribe(TEST_EVENT, second);

    const sentPayload = payload();
    bus.publish(TEST_EVENT, sentPayload);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(first).toHaveBeenCalledWith(sentPayload);
    expect(second).toHaveBeenCalledWith(sentPayload);
  });

  it('an event with no subscribers is a no-op, not an error', () => {
    const bus = new EventBus(silentLogger);
    expect(() => bus.publish(TEST_EVENT, payload())).not.toThrow();
  });
});

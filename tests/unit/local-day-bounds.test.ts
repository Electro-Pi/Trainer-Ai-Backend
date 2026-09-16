import { describe, expect, it } from 'vitest';

import { localDayBounds } from '@/modules/notifications/format-local-time.js';

/**
 * `MODRB-19` — the plan wizard accepted two sessions at the identical date and
 * time. The server-side guard (`SessionService.assertNoSameDaySession`) asks
 * this helper for the window covering "the same day", so the boundary it
 * returns is what decides whether a collision is seen at all.
 *
 * The reported case sat at 12:00 AM, which is the one time of day where a
 * UTC day and the manager's local day disagree — so that is the case worth
 * pinning down rather than a comfortable mid-afternoon one.
 */
describe('localDayBounds — the local calendar day around an instant', () => {
  it('spans exactly 24 hours', () => {
    const { from, to } = localDayBounds(new Date('2026-09-17T09:00:00.000Z'));
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60_000);
  });

  it('is half-open — the end instant belongs to the next day, not this one', () => {
    const { from, to } = localDayBounds(new Date('2026-09-17T09:00:00.000Z'));
    expect(localDayBounds(to).from.getTime()).toBe(to.getTime());
    expect(localDayBounds(new Date(to.getTime() - 1)).from.getTime()).toBe(from.getTime());
  });

  it('puts a local midnight start at the very beginning of its own day', () => {
    // 12:00 AM local on Sep 17 is 21:00 UTC on Sep 16 (local = UTC+3).
    const midnightLocal = new Date('2026-09-16T21:00:00.000Z');
    expect(localDayBounds(midnightLocal).from.toISOString()).toBe('2026-09-16T21:00:00.000Z');
  });

  it('groups two sessions entered as the same local day, despite differing UTC dates', () => {
    // The reported pair: both 12:00 AM on Sep 17 local. A UTC-keyed day would
    // file these under Sep 16 while the manager typed Sep 17 — either way they
    // must land in ONE window, or the collision goes unnoticed.
    const first = new Date('2026-09-16T21:00:00.000Z'); // 12:00 AM local Sep 17
    const second = new Date('2026-09-17T14:30:00.000Z'); // 5:30 PM local Sep 17
    expect(localDayBounds(first).from.getTime()).toBe(localDayBounds(second).from.getTime());
  });

  it('separates instants that are close together but fall on different local days', () => {
    const lateOnThe17th = new Date('2026-09-17T20:30:00.000Z'); // 11:30 PM local
    const earlyOnThe18th = new Date('2026-09-17T21:30:00.000Z'); // 12:30 AM local, next day
    expect(localDayBounds(lateOnThe17th).from.getTime()).not.toBe(
      localDayBounds(earlyOnThe18th).from.getTime(),
    );
  });

  it('contains the instant it was derived from', () => {
    for (const iso of [
      '2026-09-16T21:00:00.000Z',
      '2026-09-17T00:00:00.000Z',
      '2026-09-17T20:59:59.999Z',
      '2026-12-31T22:00:00.000Z',
    ]) {
      const at = new Date(iso);
      const { from, to } = localDayBounds(at);
      expect(at.getTime(), `${iso} should sit inside its own day`).toBeGreaterThanOrEqual(
        from.getTime(),
      );
      expect(at.getTime(), `${iso} should sit inside its own day`).toBeLessThan(to.getTime());
    }
  });
});

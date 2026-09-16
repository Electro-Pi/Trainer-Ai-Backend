import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ValidationError } from '@/common/exceptions/app-error.js';

/**
 * `MODRB-21` — two tracks named "AI" were created and published side by side.
 *
 * `Track.key` is the only unique column, and the wizard's `createFull` derives
 * that key from the name via `generateUniqueTrackKey`, which appends `-2`,
 * `-3`… until it is free. The constraint was therefore always satisfied while
 * the NAME — the only part of a track anyone actually reads in the catalogue
 * or in the assignment pickers — was never checked at all.
 *
 * These cover the decision the service makes, not the query: which field the
 * error is reported against, and how a duplicate-of-a-duplicate is named.
 * Whether the query itself matches the right rows is integration territory.
 */

const findByNameInDepartment = vi.fn();
const findByKey = vi.fn();
const create = vi.fn();
const createFull = vi.fn();
const duplicate = vi.fn();
const findByIdScoped = vi.fn();

vi.mock('@/modules/tracks/repositories/track.repository.js', () => ({
  TrackRepository: class {
    findByNameInDepartment = findByNameInDepartment;
    findByKey = findByKey;
    create = create;
    createFull = createFull;
    duplicate = duplicate;
    findByIdScoped = findByIdScoped;
  },
}));

vi.mock('@/common/interceptors/audit.interceptor.js', () => ({ writeAuditLog: vi.fn() }));
vi.mock('@/modules/departments/departments.module.js', () => ({
  departmentRepository: {
    findByIdScoped: vi.fn().mockResolvedValue({ id: 'dept-1', isEnabled: true }),
  },
}));
vi.mock('@/modules/teams/teams.module.js', () => ({
  teamRepository: { findByManager: vi.fn().mockResolvedValue([]) },
}));

const { TrackService } = await import('@/modules/tracks/services/track.service.js');

const actor = { id: 'user-1', organizationId: 'org-1', role: 'ADMIN' };

const trackNamed = (nameEn: string, nameAr = 'ذكاء') => ({
  id: 'existing-1',
  departmentId: 'dept-1',
  nameEn,
  nameAr,
});

const fullDto = (nameEn: string, nameAr: string) => ({
  nameEn,
  nameAr,
  descriptionEn: 'd',
  descriptionAr: 'د',
  departmentId: 'dept-1',
  levels: [],
});

describe('track name uniqueness — MODRB-21', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findByNameInDepartment.mockResolvedValue(null);
    findByKey.mockResolvedValue(null);
  });

  it('refuses the wizard save path when the English name is taken', async () => {
    // `createFull` is the path the bug was reported against — unlike `create`
    // it had no uniqueness check of any kind.
    findByNameInDepartment.mockResolvedValue(trackNamed('AI'));

    await expect(
      new TrackService().createFull(actor, fullDto('AI', 'ذكاء اصطناعي') as never),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(createFull).not.toHaveBeenCalled();
  });

  it('reports the error against the field that actually collided', async () => {
    // Different English name, same Arabic one — the message has to point at
    // nameAr, or the wizard highlights an input the manager did not reuse.
    findByNameInDepartment.mockResolvedValue(trackNamed('Machine Learning', 'ذكاء اصطناعي'));

    const error = await new TrackService()
      .createFull(actor, fullDto('AI', 'ذكاء اصطناعي') as never)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).errors?.[0]?.path).toBe('nameAr');
    expect((error as ValidationError).errors?.[0]?.code).toBe('duplicate');
  });

  it('points at nameEn when the English name is the one reused', async () => {
    findByNameInDepartment.mockResolvedValue(trackNamed('AI', 'شيء آخر'));

    const error = await new TrackService()
      .createFull(actor, fullDto('AI', 'ذكاء اصطناعي') as never)
      .catch((e: unknown) => e);

    expect((error as ValidationError).errors?.[0]?.path).toBe('nameEn');
  });

  it('treats a differently-cased name as the same name', async () => {
    // "ai" and "AI" are one track to anyone reading the catalogue. The service
    // compares case-insensitively when deciding which field to blame, so this
    // must still resolve to nameEn rather than falling through to nameAr.
    findByNameInDepartment.mockResolvedValue(trackNamed('ai'));

    const error = await new TrackService()
      .createFull(actor, fullDto('AI', 'ذكاء اصطناعي') as never)
      .catch((e: unknown) => e);

    expect((error as ValidationError).errors?.[0]?.path).toBe('nameEn');
  });

  it('allows a name that is free', async () => {
    createFull.mockResolvedValue({ track: { id: 't1' }, levels: [] });

    await new TrackService().createFull(actor, fullDto('Robotics', 'روبوتات') as never);
    expect(createFull).toHaveBeenCalled();
  });
});

describe('duplicating a track — the copy needs its own name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findByKey.mockResolvedValue(null);
    findByIdScoped.mockResolvedValue(trackNamed('AI'));
    duplicate.mockResolvedValue({ id: 'copy-1', key: 'ai-copy' });
  });

  it('names the copy "<name> (copy)" rather than reusing the source name', async () => {
    // The portal always meant to do this but only slugified the label into the
    // key, so the copy inherited the source's name verbatim — two identical
    // rows, reachable straight from the catalogue's Duplicate action.
    findByNameInDepartment.mockResolvedValue(null);

    await new TrackService().duplicate(actor, 'existing-1', 'ai-copy');

    expect(duplicate).toHaveBeenCalledWith(
      'existing-1',
      'ai-copy',
      expect.objectContaining({ nameEn: 'AI (copy)' }),
    );
  });

  it('counts up when "(copy)" is itself already taken', async () => {
    // Duplicating twice must give two distinguishable tracks instead of
    // failing the second time.
    findByNameInDepartment.mockImplementation((params: { nameEn?: string; nameAr?: string }) => {
      const name = params.nameEn ?? params.nameAr;
      return Promise.resolve(name === 'AI (copy)' ? trackNamed('AI (copy)') : null);
    });

    await new TrackService().duplicate(actor, 'existing-1', 'ai-copy-2');

    expect(duplicate).toHaveBeenCalledWith(
      'existing-1',
      'ai-copy-2',
      expect.objectContaining({ nameEn: 'AI (copy 2)' }),
    );
  });

  it('uses an explicitly supplied name as-is', async () => {
    findByNameInDepartment.mockResolvedValue(null);

    await new TrackService().duplicate(actor, 'existing-1', 'ai-v2', { nameEn: 'AI v2' });

    expect(duplicate).toHaveBeenCalledWith(
      'existing-1',
      'ai-v2',
      expect.objectContaining({ nameEn: 'AI v2' }),
    );
  });
});

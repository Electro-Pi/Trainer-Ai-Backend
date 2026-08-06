import { ConflictError, NotFoundError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { teamRepository } from '@/modules/teams/teams.module.js';

import type { ImportLearnerDto } from '../dto/learner.dto.js';
import { LearnerRepository, type Learner } from '../repositories/learner.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

export interface ImportOutcome {
  imported: Learner[];
  skipped: { entraObjectId: string; reason: string }[];
}

/**
 * `TM-02` — imports a directory identity as a `Learner` row. **No account is
 * ever created** — this is the one place that boundary is structurally
 * true: `Learner` has no `passwordHash`/JWT path (AGENTS.md #1).
 */
export class LearnerImportService {
  private readonly learners = new LearnerRepository();

  private parseCsv(csv: string): ImportLearnerDto[] {
    const lines = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) return [];

    const header = lines[0]!.split(',').map((column) => column.trim().toLowerCase());
    const required = ['entraobjectid', 'email', 'displayname'];
    for (const column of required) {
      if (!header.includes(column)) {
        throw new ConflictError(`CSV is missing required column "${column}"`);
      }
    }

    return lines.slice(1).map((line) => {
      const cells = line.split(',').map((cell) => cell.trim());
      const row = new Map(header.map((column, i) => [column, cells[i] ?? '']));

      const jobTitle = row.get('jobtitle');
      const department = row.get('department');

      const entry: ImportLearnerDto = {
        entraObjectId: row.get('entraobjectid') ?? '',
        email: row.get('email') ?? '',
        displayName: row.get('displayname') ?? '',
        ...(jobTitle ? { jobTitle } : {}),
        ...(department ? { department } : {}),
        ...(row.get('preferredlanguage') === 'AR' ? { preferredLanguage: 'AR' as const } : {}),
      };
      return entry;
    });
  }

  async importFromCsv(actor: ActingUser, teamId: string, csv: string): Promise<ImportOutcome> {
    return this.importMany(actor, teamId, this.parseCsv(csv));
  }

  async importMany(
    actor: ActingUser,
    teamId: string,
    entries: ImportLearnerDto[],
  ): Promise<ImportOutcome> {
    const team = await teamRepository.findByIdScoped(teamId);
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    const imported: Learner[] = [];
    const skipped: { entraObjectId: string; reason: string }[] = [];

    for (const entry of entries) {
      const existing = await this.learners.findByEntraObjectId(entry.entraObjectId);
      if (existing) {
        skipped.push({ entraObjectId: entry.entraObjectId, reason: 'Already a learner' });
        continue;
      }

      const created = await this.learners.create({
        teamId,
        entraObjectId: entry.entraObjectId,
        email: entry.email,
        displayName: entry.displayName,
        jobTitle: entry.jobTitle ?? null,
        department: entry.department ?? null,
        preferredLanguage: entry.preferredLanguage ?? 'EN',
      } as never);

      await writeAuditLog({
        organizationId: actor.organizationId,
        actorId: actor.id,
        actorType: 'USER',
        action: 'learner.imported',
        entityType: 'Learner',
        entityId: created.id,
        after: { teamId, email: created.email },
      });

      imported.push(created);
    }

    return { imported, skipped };
  }
}

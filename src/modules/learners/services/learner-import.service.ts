import {
  ConflictError,
  ExternalServiceError,
  NotFoundError,
} from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { decrypt } from '@/common/utils/encryption.js';
import { container } from '@/config/container.js';
import { env } from '@/config/env.js';
import { msalService } from '@/modules/auth/auth.module.js';
import { teamRepository, type Team } from '@/modules/teams/teams.module.js';
import { portalUserRepository } from '@/modules/users/users.module.js';

import type { ImportLearnerDto, InviteLearnerDto } from '../dto/learner.dto.js';
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
 * `TM-01`/`TM-06` pattern (`directory.service.ts`) reused here — the calling
 * PortalUser's own Entra sign-in already carries the Graph delegated scopes
 * (`msal.service.ts`'s `SCOPES`), so both directory reads and guest invites
 * are done on their behalf rather than a separate service-principal token.
 */
async function resolveAccessToken(callerId: string): Promise<string> {
  const caller = await portalUserRepository.findByIdUnscoped(callerId);
  if (!caller?.graphHomeAccountId || !caller.graphTokenCacheEncrypted) {
    throw new ExternalServiceError(
      'No Microsoft Graph session for this user — sign in via Entra ID first',
    );
  }

  return msalService.acquireGraphTokenSilent(
    caller.graphHomeAccountId,
    decrypt(caller.graphTokenCacheEncrypted),
  );
}

/**
 * `TM-02` — imports a directory identity (or invited guest) as a `Learner`
 * row. **No account is ever created** — this is the one place that boundary
 * is structurally true: `Learner` has no `passwordHash`/JWT path (AGENTS.md #1).
 */
export class LearnerImportService {
  private readonly learners = new LearnerRepository();

  /**
   * A learner's department is the department of the team they're imported
   * into — nothing else. The directory/CSV import supplies a *free-text*
   * department name (`ImportLearnerDto.department`, unlike
   * `Track`/`UpdateLearnerDto` which take a resolved `departmentId` from an
   * authenticated caller), and that text is whatever the person's Entra
   * profile happens to say — a job description ("Developer"), a legacy org
   * unit, a typo. This used to resolve-or-*create* a `Department` from it,
   * which silently minted org departments nobody had chosen and stamped
   * learners with them, so a learner on the "Support" team (Quality and
   * Product Support) displayed as "Developer". Departments are now created
   * only by an Admin, through the departments module.
   *
   * The free-text value is still carried on the DTO — `jobTitle` and the
   * audit log keep the directory's own wording — it just no longer decides
   * org structure.
   */
  private departmentIdForTeam(team: Team): string | null {
    return team.departmentId ?? null;
  }

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

  /**
   * Shared "resolve department + insert Learner row + audit log" logic
   * behind both `importMany` (directory identity, `status` defaults to
   * `ACTIVE`) and `inviteLearner` (cross-tenant guest, `status:
   * 'PENDING_INVITE'`) — the one place a Learner insert payload is built, so
   * the two paths can't drift apart on required fields.
   */
  private async createLearnerRow(
    actor: ActingUser,
    team: Team,
    entry: {
      entraObjectId: string;
      email: string;
      displayName: string;
      jobTitle?: string;
      department?: string;
      preferredLanguage?: 'EN' | 'AR';
      status?: 'ACTIVE' | 'PENDING_INVITE';
    },
    auditAction: string,
  ): Promise<Learner> {
    const departmentId = this.departmentIdForTeam(team);

    const created = await this.learners.create({
      teamId: team.id,
      entraObjectId: entry.entraObjectId,
      email: entry.email,
      displayName: entry.displayName,
      jobTitle: entry.jobTitle ?? null,
      departmentId,
      preferredLanguage: entry.preferredLanguage ?? 'EN',
      ...(entry.status ? { status: entry.status } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: auditAction,
      entityType: 'Learner',
      entityId: created.id,
      after: { teamId: team.id, email: created.email },
    });

    return created;
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

      const created = await this.createLearnerRow(actor, team, entry, 'learner.imported');

      imported.push(created);
    }

    return { imported, skipped };
  }

  /**
   * Cross-tenant B2B guest invite (`TM-02` extension) — the invitee's
   * Microsoft account lives in a different Entra tenant, so it can never
   * show up in `DirectoryService.searchUsers`'s own-tenant Graph query.
   * `POST /invitations` (Graph, `User.Invite.All`) creates a guest shadow
   * account in our tenant and returns its object id — that id becomes
   * `Learner.entraObjectId`, so meeting creation (which invites by email,
   * not object id — `graph.service.ts`'s `createMeeting`) needs no changes.
   */
  async inviteLearner(actor: ActingUser, teamId: string, dto: InviteLearnerDto): Promise<Learner> {
    const team = await teamRepository.findByIdScoped(teamId);
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    const accessToken = await resolveAccessToken(actor.id);

    // No dedicated invite-redemption landing page exists yet — the app's own
    // base URL is a reasonable fallback for `inviteRedirectUrl` (Graph
    // requires *some* https redirect target) until one is built.
    const redirectUrl = new URL('/', env.APP_URL).toString();

    const invitation = await container.resolveGraph().inviteGuest(
      {
        email: dto.email,
        redirectUrl,
        ...(dto.displayName ? { displayName: dto.displayName } : {}),
      },
      accessToken,
    );

    const existing = await this.learners.findByEntraObjectId(invitation.invitedUserId);
    // A still-live row (PENDING_INVITE or ACTIVE) blocks a duplicate invite.
    // An INACTIVE row means the manager cancelled a prior invite/membership
    // (`deactivate` — non-negotiable 17, never hard-deleted) and is now
    // re-inviting the same person: reactivate that row instead of throwing,
    // so "cancel invite, then resend" is possible without piling up dead
    // duplicate Learner rows for the same person.
    if (existing && existing.status !== 'INACTIVE') {
      throw new ConflictError('This person has already been invited as a learner');
    }

    // Graph's `invitedUserDisplayName` is frequently null pre-redemption —
    // fall back to what the manager typed, then to the email itself.
    const displayName = dto.displayName || invitation.invitedUserDisplayName || dto.email;

    if (existing) {
      const departmentId = this.departmentIdForTeam(team);
      const reactivated = await this.learners.update(existing.id, {
        teamId,
        email: dto.email,
        displayName,
        jobTitle: dto.jobTitle ?? null,
        departmentId,
        status: 'PENDING_INVITE',
        deactivatedAt: null,
      } as never);

      await writeAuditLog({
        organizationId: actor.organizationId,
        actorId: actor.id,
        actorType: 'USER',
        action: 'learner.reinvited',
        entityType: 'Learner',
        entityId: reactivated.id,
        before: { status: existing.status },
        after: { status: reactivated.status, teamId, email: reactivated.email },
      });

      return reactivated;
    }

    return this.createLearnerRow(
      actor,
      team,
      {
        entraObjectId: invitation.invitedUserId,
        email: dto.email,
        displayName,
        ...(dto.jobTitle ? { jobTitle: dto.jobTitle } : {}),
        ...(dto.department ? { department: dto.department } : {}),
        status: 'PENDING_INVITE',
      },
      'learner.invited',
    );
  }
}

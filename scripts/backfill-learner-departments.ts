/**
 * One-off repair for the departments that `LearnerImportService` used to
 * invent from Microsoft Graph's free-text `user.department` string.
 *
 * Before the fix, importing a learner whose Entra profile said e.g.
 * "Developer" created a `Department` row with that name and stamped the
 * learner with it — so a member of the "Support" team (Quality and Product
 * Support) displayed under a department nobody had ever created. This script
 * undoes that, in two passes:
 *
 *   1. Repoint every learner whose `departmentId` differs from their own
 *      team's `departmentId` back to the team's department.
 *   2. Delete departments left with no teams, no tracks and no learners.
 *      A department an Admin created deliberately but hasn't used yet would
 *      also match that shape, so pass 2 only ever deletes departments that
 *      pass 1 actually emptied — they are named explicitly.
 *
 * Dry run by default; pass `--apply` to write. Scope to one org with
 * `--org=<organizationId>`, otherwise every organization is processed.
 *
 * `--only-mismatched` narrows pass 1 to learners who carry a *wrong*
 * department, skipping those whose `departmentId` is simply null — those
 * already display under their team's department, so stamping them is
 * cosmetic rather than a correction.
 *
 *   npx tsx scripts/backfill-learner-departments.ts
 *   npx tsx scripts/backfill-learner-departments.ts --apply
 *   npx tsx scripts/backfill-learner-departments.ts --only-mismatched --apply
 */
import { prisma, disconnectPrisma } from '@/database/prisma.service.js';
import { runWithTenant } from '@/database/tenant-context.js';

const APPLY = process.argv.includes('--apply');
const ONLY_MISMATCHED = process.argv.includes('--only-mismatched');
const ORG_ARG = process.argv.find((a) => a.startsWith('--org='))?.slice('--org='.length);

interface Move {
  learnerId: string;
  email: string;
  fromDepartmentId: string | null;
  fromDepartmentName: string;
  toDepartmentId: string | null;
  toDepartmentName: string;
  teamName: string;
}

async function repairOrganization(organizationId: string, orgName: string): Promise<void> {
  console.log(`\n=== ${orgName} (${organizationId}) ===`);

  // `Learner` and `Team` are tenant-scoped on the Prisma extension, so every
  // query below has to run inside the ALS frame or it refuses to execute.
  const { moves, emptiedDepartmentIds } = await runWithTenant(organizationId, async () => {
    const learners = await prisma.learner.findMany({
      include: {
        team: { include: { department: true } },
        department: true,
      },
    });

    const collected: Move[] = [];
    for (const learner of learners) {
      const teamDepartmentId = learner.team?.departmentId ?? null;
      if (learner.departmentId === teamDepartmentId) continue;
      // A null department isn't wrong on screen — the UI already falls back
      // to the team's — so `--only-mismatched` leaves those rows alone.
      if (ONLY_MISMATCHED && learner.departmentId === null) continue;

      collected.push({
        learnerId: learner.id,
        email: learner.email,
        fromDepartmentId: learner.departmentId,
        fromDepartmentName: learner.department?.nameEn ?? '(none)',
        toDepartmentId: teamDepartmentId,
        toDepartmentName: learner.team?.department?.nameEn ?? '(none)',
        teamName: learner.team?.nameEn ?? learner.team?.name ?? '(unknown team)',
      });
    }

    // The departments those learners are being moved off — candidates for
    // deletion once they hold nothing else.
    const vacated = new Set(
      collected.map((m) => m.fromDepartmentId).filter((id): id is string => id !== null),
    );

    return { moves: collected, emptiedDepartmentIds: vacated };
  });

  if (moves.length === 0) {
    console.log("  No learner sits outside their team's department.");
  }

  for (const move of moves) {
    console.log(
      `  ${move.email} — team "${move.teamName}": ` +
        `${move.fromDepartmentName} -> ${move.toDepartmentName}`,
    );
  }

  if (APPLY && moves.length > 0) {
    await runWithTenant(organizationId, async () => {
      for (const move of moves) {
        await prisma.learner.update({
          where: { id: move.learnerId },
          data: { departmentId: move.toDepartmentId },
        });
      }
    });
    console.log(`  Applied: ${moves.length} learner(s) repointed.`);
  }

  // Pass 2 — only the departments pass 1 vacated, and only if nothing else
  // references them. `Department` is not tenant-scoped on the extension
  // (ARCHITECTURE §7.3), so `organizationId` is filtered explicitly here.
  const orphans: { id: string; nameEn: string }[] = [];
  for (const departmentId of emptiedDepartmentIds) {
    const department = await prisma.department.findFirst({
      where: { id: departmentId, organizationId },
      include: { _count: { select: { teams: true, tracks: true, learners: true } } },
    });
    if (!department) continue;

    // In a dry run the learners have not actually moved yet, so discount the
    // ones this script would move off this department before judging it empty.
    const stillHeld = APPLY
      ? department._count.learners
      : department._count.learners -
        moves.filter((m) => m.fromDepartmentId === departmentId).length;

    if (department._count.teams === 0 && department._count.tracks === 0 && stillHeld <= 0) {
      orphans.push({ id: department.id, nameEn: department.nameEn });
    }
  }

  for (const orphan of orphans) {
    console.log(`  Department now empty, would delete: "${orphan.nameEn}" (${orphan.id})`);
  }

  if (APPLY && orphans.length > 0) {
    for (const orphan of orphans) {
      await prisma.department.delete({ where: { id: orphan.id } });
    }
    console.log(`  Applied: ${orphans.length} empty department(s) deleted.`);
  }
}

async function main(): Promise<void> {
  console.log(
    APPLY ? 'MODE: apply (writing changes)' : 'MODE: dry run (no writes) — pass --apply to write',
  );
  if (ONLY_MISMATCHED) {
    console.log('SCOPE: only learners with a wrong department (null ones skipped)');
  }

  const organizations = await prisma.organization.findMany({
    ...(ORG_ARG ? { where: { id: ORG_ARG } } : {}),
    select: { id: true, name: true },
  });

  if (organizations.length === 0) {
    console.log('No organizations matched.');
    return;
  }

  for (const org of organizations) {
    await repairOrganization(org.id, org.name);
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void disconnectPrisma();
  });

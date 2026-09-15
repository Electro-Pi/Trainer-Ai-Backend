import type { Learner } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { Learner };

type LearnerDelegate = typeof prisma.learner;

export class LearnerRepository extends BaseRepository<Learner, LearnerDelegate> {
  constructor() {
    super(prisma.learner, 'createdAt');
  }

  async findByTeam(teamId: string): Promise<Learner[]> {
    return this.delegate.findMany({ where: { teamId } });
  }

  async findByEntraObjectId(entraObjectId: string): Promise<Learner | null> {
    return this.delegate.findFirst({ where: { entraObjectId } });
  }

  /**
   * `BaseRepository.findById` uses `findUnique`, which the tenant extension
   * cannot scope even though `Learner` is a tenant-scoped model (see the
   * extension's own doc comment) — a request-supplied `learnerId` must
   * resolve through this `findFirst` instead, or a MANAGER in org A could
   * read/mutate a learner belonging to org B by guessing a CUID.
   */
  async findByIdScoped(id: string): Promise<Learner | null> {
    return this.delegate.findFirst({ where: { id } });
  }

  /** Batched form of `findByIdScoped` — `Learner` is directly tenant-scoped, so `findMany` is safe. */
  async findManyByIds(ids: string[]): Promise<Learner[]> {
    if (ids.length === 0) return [];
    return this.delegate.findMany({ where: { id: { in: ids } } });
  }

  /**
   * `Learner.departmentId` read-through for `LearnerResponseDto.departmentName`
   * — same join-for-a-name pattern as `TrackRepository.findDepartmentName`.
   * `Learner.departmentId` is independently nullable from `Learner.teamId`
   * (a learner can join a team without ever getting their own department
   * set explicitly), but `Team.departmentId` is required — every team
   * belongs to exactly one department. Falling back to the learner's team's
   * department means "—" only shows when neither the learner nor their team
   * has one, rather than whenever the learner's own field happens to be
   * unset despite already being on a team with a real department.
   */
  async findDepartmentName(learnerId: string): Promise<string | null> {
    return (await this.findDepartmentNames(learnerId))?.nameEn ?? null;
  }

  /**
   * Both localizations of the same name `findDepartmentName` resolves. The
   * portal renders this column to the viewer, so it has to be able to pick by
   * language rather than always showing the English name in the Arabic UI.
   */
  async findDepartmentNames(learnerId: string): Promise<{ nameEn: string; nameAr: string } | null> {
    const row = await prisma.learner.findFirst({
      where: { id: learnerId },
      select: {
        department: { select: { nameEn: true, nameAr: true } },
        team: { select: { department: { select: { nameEn: true, nameAr: true } } } },
      },
    });
    return row?.department ?? row?.team.department ?? null;
  }

  /**
   * Permanently removes a learner and everything that hangs off them.
   *
   * No relation in `schema.prisma` declares `onDelete: Cascade` towards
   * `Learner` (the two exceptions — `session_outcomes` and
   * `session_contents` — cascade from `Session`, not from here), so the
   * child rows have to be cleared explicitly, deepest first, or Postgres
   * rejects the delete on a foreign-key violation. The whole graph runs in
   * one transaction: a partial delete would leave a learner referenced by
   * orphaned plan snapshots.
   *
   * `Report.sessionId` is nullable and is deliberately *detached* rather
   * than deleted — a report is an organizational record that outlives the
   * person it covers, and cascading it away would silently rewrite history
   * that other reports aggregate over.
   *
   * This is the one place that breaks non-negotiable 17 (deactivate, never
   * hard-delete), on an explicit product decision: a manager must be able to
   * remove someone from the app outright, not merely hide them. The learner's
   * completed-training history goes with them — `deactivate()` remains the
   * reversible option and stays the default path in the UI.
   */
  async deleteWithDependents(learnerId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const plans = await tx.trainingPlan.findMany({
        where: { learnerId },
        select: { id: true },
      });
      const planIds = plans.map((plan) => plan.id);

      const snapshots = await tx.planTrackSnapshot.findMany({
        where: { trainingPlanId: { in: planIds } },
        select: { id: true },
      });
      const snapshotIds = snapshots.map((snapshot) => snapshot.id);

      const contentSnapshots = await tx.planContentSnapshot.findMany({
        where: { snapshotId: { in: snapshotIds } },
        select: { id: true },
      });
      const outcomeSnapshots = await tx.planOutcomeSnapshot.findMany({
        where: { snapshotId: { in: snapshotIds } },
        select: { id: true },
      });

      // Plan snapshot tree, leaves first.
      await tx.planContentMedia.deleteMany({
        where: { contentSnapshotId: { in: contentSnapshots.map((row) => row.id) } },
      });
      await tx.planContentSnapshot.deleteMany({ where: { snapshotId: { in: snapshotIds } } });
      await tx.planLearnerOutcomeSnapshot.deleteMany({
        where: { outcomeSnapshotId: { in: outcomeSnapshots.map((row) => row.id) } },
      });
      await tx.planOutcomeSnapshot.deleteMany({ where: { snapshotId: { in: snapshotIds } } });
      await tx.planSkillSnapshot.deleteMany({ where: { snapshotId: { in: snapshotIds } } });
      await tx.planTrackSnapshot.deleteMany({ where: { trainingPlanId: { in: planIds } } });
      await tx.trainingPlan.deleteMany({ where: { learnerId } });

      // Sessions and their non-cascading children. `session_outcomes` and
      // `session_contents` carry `onDelete: Cascade` and go automatically.
      const sessions = await tx.session.findMany({ where: { learnerId }, select: { id: true } });
      const sessionIds = sessions.map((session) => session.id);

      const assessments = await tx.assessment.findMany({
        where: { sessionId: { in: sessionIds } },
        select: { id: true },
      });
      await tx.assessmentAnswer.deleteMany({
        where: { assessmentId: { in: assessments.map((row) => row.id) } },
      });
      await tx.assessment.deleteMany({ where: { sessionId: { in: sessionIds } } });

      // Kept, not deleted — see the note above on organizational records.
      await tx.report.updateMany({
        where: { sessionId: { in: sessionIds } },
        data: { sessionId: null },
      });

      await tx.invitation.deleteMany({ where: { learnerId } });
      await tx.session.deleteMany({ where: { learnerId } });

      // Recommendations reference both the learner and their assignments, so
      // they clear before `learner_assignments` does.
      const recommendations = await tx.recommendation.findMany({
        where: { learnerId },
        select: { id: true },
      });
      await tx.recommendationItem.deleteMany({
        where: { recommendationId: { in: recommendations.map((row) => row.id) } },
      });
      await tx.recommendation.deleteMany({ where: { learnerId } });

      await tx.learnerOutcome.deleteMany({ where: { learnerId } });
      await tx.learnerAssignment.deleteMany({ where: { learnerId } });
      await tx.externalSession.deleteMany({ where: { learnerId } });
      await tx.learnerExperience.deleteMany({ where: { learnerId } });

      await tx.learner.delete({ where: { id: learnerId } });
    });
  }
}

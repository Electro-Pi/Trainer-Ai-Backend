import { randomBytes } from 'node:crypto';

import { hashPassword } from '@/common/utils/password-hash.js';
import { prisma } from '@/database/prisma.service.js';
import { runWithTenant } from '@/database/tenant-context.js';

/**
 * One user per role, a team, learners, content across all 5 types, question
 * banks, rubrics, a completed plan with sessions and assessments — mixed
 * results plus a deliberate coverage gap (BUILD_PLAN P1-7). Runs against the
 * `sales` track's `beginner` level, seeded by tracks.seed.ts, which must run
 * first. Idempotent: every create is guarded by a lookup on a natural key.
 */
export async function seedDemo(organizationId: string): Promise<void> {
  await runWithTenant(organizationId, async () => {
    const salesTrack = await prisma.track.findFirst({
      where: { organizationId, key: 'sales' },
    });
    if (!salesTrack) {
      throw new Error('seedDemo: sales track not found — run seedTracks first.');
    }

    const beginnerLevel = await prisma.level.findFirst({
      where: { trackId: salesTrack.id, key: 'beginner' },
    });
    if (!beginnerLevel) {
      throw new Error('seedDemo: sales/beginner level not found — run seedTracks first.');
    }

    const outcomes = await prisma.outcome.findMany({
      where: { levelId: beginnerLevel.id },
      orderBy: { order: 'asc' },
    });
    const discoveryOutcome = outcomes[0];
    const valuePropOutcome = outcomes[1];
    if (!discoveryOutcome || !valuePropOutcome) {
      throw new Error('seedDemo: expected 2 outcomes on sales/beginner — check tracks.seed.ts.');
    }

    // ── Portal users, one per role ──────────────────────────────────────
    const admin = await upsertPortalUser({
      organizationId,
      email: 'admin@demo.electropi.ai',
      name: 'Admin User',
      role: 'ADMIN',
    });
    const manager = await upsertPortalUser({
      organizationId,
      email: 'manager@demo.electropi.ai',
      name: 'Khaled Manager',
      role: 'DEPARTMENT_MANAGER',
      passwordHash: await hashPassword('Demo12345!'),
    });
    const contentManager = await upsertPortalUser({
      organizationId,
      email: 'content@demo.electropi.ai',
      name: 'Omar Content',
      role: 'CONTENT_CREATOR',
    });
    void admin;

    // ── Team ─────────────────────────────────────────────────────────────
    const team = await upsertByUniqueName(
      () => prisma.team.findFirst({ where: { organizationId, name: 'Cairo Sales Team' } }),
      () =>
        prisma.team.create({
          data: {
            organizationId,
            managerId: manager.id,
            departmentId: salesTrack.departmentId,
            name: 'Cairo Sales Team',
          },
        }),
    );

    // ── Learners ─────────────────────────────────────────────────────────
    const learnerSara = await upsertLearner({
      organizationId,
      teamId: team.id,
      entraObjectId: 'demo-learner-sara',
      email: 'sara@demo.electropi.ai',
      displayName: 'Sara Ahmed',
      jobTitle: 'Account Executive',
    });
    const learnerYoussef = await upsertLearner({
      organizationId,
      teamId: team.id,
      entraObjectId: 'demo-learner-youssef',
      email: 'youssef@demo.electropi.ai',
      displayName: 'Youssef Adel',
      jobTitle: 'Account Executive',
    });

    await upsertExperience(learnerSara.id, admin.id, 'university-graduate', 0);
    await upsertExperience(learnerYoussef.id, admin.id, 'lateral-hire-from-competitor', 3);

    // ── Content — all 5 types, both outcomes covered EXCEPT the deliberate gap ──
    // valuePropOutcome is left with zero PUBLISHED content on purpose — the
    // coverage report (CM-13, P5-10) and recommendation coverage-gap flag
    // (RC-10, P6-7) both need a real gap to detect, not just an empty table.
    const document = await upsertContentItem({
      organizationId,
      trackId: salesTrack.id,
      levelId: beginnerLevel.id,
      title: 'Discovery Call Playbook',
      contentType: 'DOCUMENT',
      textBody: null,
      sourceUrl: null,
      language: 'EN',
      createdById: contentManager.id,
      outcomeIds: [discoveryOutcome.id],
    });
    const slides = await upsertContentItem({
      organizationId,
      trackId: salesTrack.id,
      levelId: beginnerLevel.id,
      title: 'Needs Discovery Framework',
      contentType: 'SLIDES',
      textBody: null,
      sourceUrl: null,
      language: 'EN',
      createdById: contentManager.id,
      outcomeIds: [discoveryOutcome.id],
    });
    const text = await upsertContentItem({
      organizationId,
      trackId: salesTrack.id,
      levelId: beginnerLevel.id,
      title: 'Open Discovery Questions — Model Answers',
      contentType: 'TEXT',
      textBody:
        'Examples: "What does success look like for your team this quarter?" "What have you already tried?"',
      sourceUrl: null,
      language: 'EN',
      createdById: contentManager.id,
      outcomeIds: [discoveryOutcome.id],
    });
    const link = await upsertContentItem({
      organizationId,
      trackId: salesTrack.id,
      levelId: beginnerLevel.id,
      title: 'Discovery Call Recording (external)',
      contentType: 'LINK',
      textBody: null,
      sourceUrl: 'https://example.com/demo-sales-discovery-call',
      language: 'EN',
      createdById: contentManager.id,
      outcomeIds: [discoveryOutcome.id],
    });
    const image = await upsertContentItem({
      organizationId,
      trackId: salesTrack.id,
      levelId: beginnerLevel.id,
      title: 'Discovery Question Cheat Sheet',
      contentType: 'IMAGE',
      textBody: null,
      sourceUrl: null,
      language: 'EN',
      createdById: contentManager.id,
      outcomeIds: [discoveryOutcome.id],
    });

    await upsertMediaAsset(image.id, {
      blobKey: 'demo/discovery-cheat-sheet.png',
      originalFilename: 'discovery-cheat-sheet.png',
      mimeType: 'image/png',
      sizeBytes: 204_800,
      checksum: 'demo-checksum-cheat-sheet',
      caption: 'A one-page cheat sheet of open discovery questions.',
      altTextEn: 'Cheat sheet listing five open discovery questions for sales calls.',
      altTextAr: 'ورقة مرجعية تضم خمسة أسئلة استكشاف مفتوحة لمكالمات المبيعات.',
    });

    for (const item of [document, slides, text, link, image]) {
      await prisma.contentItem.update({
        where: { id: item.id },
        data: { status: 'PUBLISHED', publishedAt: item.publishedAt ?? new Date() },
      });
    }

    // ── Question bank + rubric on the covered outcome ───────────────────
    const questionBank = await upsertQuestionBank(discoveryOutcome.id, 'EN');
    await upsertQuestion(questionBank.id, 0, {
      prompt: 'What is the first question you would ask to uncover a prospect’s real need?',
      difficulty: 'EASY',
      modelAnswer:
        'An open question about their current goals or challenges, not a yes/no question.',
    });
    await upsertQuestion(questionBank.id, 1, {
      prompt: 'How do you know when you have uncovered the prospect’s real pain point?',
      difficulty: 'MEDIUM',
      modelAnswer: 'They confirm impact/cost of the problem, not just describe a symptom.',
    });

    const rubric = await upsertRubric(discoveryOutcome.id, 'Discovery Call Rubric', 70);
    await upsertRubricCriteria(rubric.id, [
      {
        label: 'Asks open questions',
        description: 'Uses open, not closed, questions.',
        weight: 40,
      },
      {
        label: 'Uncovers real need',
        description: 'Identifies the underlying business need.',
        weight: 40,
      },
      {
        label: 'Active listening',
        description: 'Responds to what the prospect actually said.',
        weight: 20,
      },
    ]);

    // ── Assignment → LearnerOutcome rows (both outcomes, priority order) ──
    const assignment = await upsertAssignment(
      learnerSara.id,
      salesTrack.id,
      beginnerLevel.id,
      manager.id,
    );
    await upsertLearnerOutcome(learnerSara.id, discoveryOutcome.id, assignment.id, 'ACHIEVED', 0);
    await upsertLearnerOutcome(
      learnerSara.id,
      valuePropOutcome.id,
      assignment.id,
      'NOT_ACHIEVED',
      1,
    );

    // ── A completed training plan with one session + assessment (mixed result) ──
    const plan = await upsertTrainingPlan({
      organizationId,
      learnerId: learnerSara.id,
      assignmentId: assignment.id,
      title: 'Sara — Sales Beginner Plan',
      trainingDays: 1,
      createdById: manager.id,
    });

    const session = await upsertSession({
      organizationId,
      planId: plan.id,
      learnerId: learnerSara.id,
      primaryOutcomeId: discoveryOutcome.id,
      sequence: 1,
      scheduledStart: new Date('2026-08-01T09:00:00Z'),
      scheduledEnd: new Date('2026-08-01T09:30:00Z'),
      durationMinutes: 30,
    });

    await prisma.session.update({
      where: { id: session.id },
      data: {
        status: 'COMPLETED',
        verdict: 'ACHIEVED',
        score: 85,
        startedAt: new Date('2026-08-01T09:00:00Z'),
        endedAt: new Date('2026-08-01T09:28:00Z'),
      },
    });

    await upsertSessionContent(session.id, document.id, 0, 'RECOMMENDED');
    await upsertSessionContent(session.id, text.id, 1, 'RECOMMENDED');

    const existingAssessment = await prisma.assessment.findFirst({
      where: { sessionId: session.id },
    });
    if (!existingAssessment) {
      await prisma.assessment.create({
        data: {
          sessionId: session.id,
          rubricId: rubric.id,
          totalScore: 85,
          verdict: 'ACHIEVED',
          strengths: 'Strong open questioning; built rapport quickly.',
          gaps: 'Occasionally moved on before fully confirming the prospect’s need.',
          agentNotes: 'Demo assessment seeded for Phase 1 — no live AI session ran.',
          recordingConsentAt: new Date('2026-08-01T09:00:00Z'),
        },
      });
    }

    // ── Second learner: mixed / weaker result on the same outcome ────────
    const assignmentYoussef = await upsertAssignment(
      learnerYoussef.id,
      salesTrack.id,
      beginnerLevel.id,
      manager.id,
    );
    await upsertLearnerOutcome(
      learnerYoussef.id,
      discoveryOutcome.id,
      assignmentYoussef.id,
      'IN_PROGRESS',
      0,
    );
    await upsertLearnerOutcome(
      learnerYoussef.id,
      valuePropOutcome.id,
      assignmentYoussef.id,
      'NOT_STARTED',
      1,
    );
  });
}

// ── Small idempotent upsert helpers, kept local to this seed file ──────

async function upsertPortalUser(input: {
  organizationId: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'DEPARTMENT_MANAGER' | 'CONTENT_CREATOR';
  passwordHash?: string;
}) {
  return prisma.portalUser.upsert({
    where: { organizationId_email: { organizationId: input.organizationId, email: input.email } },
    create: input,
    update: {
      name: input.name,
      role: input.role,
      ...(input.passwordHash && { passwordHash: input.passwordHash }),
    },
  });
}

async function upsertByUniqueName<T>(
  find: () => Promise<T | null>,
  create: () => Promise<T>,
): Promise<T> {
  const existing = await find();
  return existing ?? create();
}

async function upsertLearner(input: {
  organizationId: string;
  teamId: string;
  entraObjectId: string;
  email: string;
  displayName: string;
  jobTitle: string;
}) {
  return prisma.learner.upsert({
    where: {
      organizationId_entraObjectId: {
        organizationId: input.organizationId,
        entraObjectId: input.entraObjectId,
      },
    },
    create: input,
    update: { displayName: input.displayName, jobTitle: input.jobTitle },
  });
}

async function upsertExperience(
  learnerId: string,
  recordedById: string,
  background: string,
  yearsOfExperience: number,
) {
  const existing = await prisma.learnerExperience.findFirst({ where: { learnerId } });
  if (existing) return existing;
  return prisma.learnerExperience.create({
    data: { learnerId, recordedById, background, yearsOfExperience },
  });
}

async function upsertContentItem(input: {
  organizationId: string;
  trackId: string;
  levelId: string;
  title: string;
  contentType: 'DOCUMENT' | 'SLIDES' | 'TEXT' | 'LINK' | 'IMAGE';
  textBody: string | null;
  sourceUrl: string | null;
  language: 'EN' | 'AR';
  createdById: string;
  outcomeIds: string[];
}) {
  const existing = await prisma.contentItem.findFirst({
    where: { organizationId: input.organizationId, title: input.title },
  });
  const item =
    existing ??
    (await prisma.contentItem.create({
      data: {
        organizationId: input.organizationId,
        trackId: input.trackId,
        levelId: input.levelId,
        title: input.title,
        contentType: input.contentType,
        textBody: input.textBody,
        sourceUrl: input.sourceUrl,
        language: input.language,
        createdById: input.createdById,
      },
    }));

  for (const outcomeId of input.outcomeIds) {
    const link = await prisma.contentOutcome.findFirst({
      where: { contentItemId: item.id, outcomeId },
    });
    if (!link) {
      await prisma.contentOutcome.create({ data: { contentItemId: item.id, outcomeId } });
    }
  }

  return item;
}

async function upsertMediaAsset(
  contentItemId: string,
  input: {
    blobKey: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    checksum: string;
    caption: string;
    altTextEn: string;
    altTextAr: string;
  },
) {
  const existing = await prisma.mediaAsset.findFirst({
    where: { contentItemId, blobKey: input.blobKey },
  });
  if (existing) return existing;
  return prisma.mediaAsset.create({
    data: { contentItemId, scanStatus: 'CLEAN', processedAt: new Date(), ...input },
  });
}

async function upsertQuestionBank(outcomeId: string, language: 'EN' | 'AR') {
  const existing = await prisma.questionBank.findFirst({ where: { outcomeId, language } });
  if (existing) return existing;
  return prisma.questionBank.create({ data: { outcomeId, language } });
}

async function upsertQuestion(
  questionBankId: string,
  order: number,
  input: { prompt: string; difficulty: 'EASY' | 'MEDIUM' | 'HARD'; modelAnswer: string },
) {
  const existing = await prisma.question.findFirst({ where: { questionBankId, order } });
  if (existing) return existing;
  return prisma.question.create({ data: { questionBankId, order, ...input } });
}

async function upsertRubric(outcomeId: string, name: string, passThreshold: number) {
  const existing = await prisma.rubric.findFirst({ where: { outcomeId, name } });
  if (existing) return existing;
  return prisma.rubric.create({ data: { outcomeId, name, passThreshold } });
}

async function upsertRubricCriteria(
  rubricId: string,
  criteria: { label: string; description: string; weight: number }[],
) {
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight !== 100) {
    throw new Error(`seedDemo: rubric criteria weights must total 100, got ${totalWeight}.`);
  }
  for (const [order, criterion] of criteria.entries()) {
    const existing = await prisma.rubricCriterion.findFirst({ where: { rubricId, order } });
    if (!existing) {
      await prisma.rubricCriterion.create({ data: { rubricId, order, ...criterion } });
    }
  }
}

async function upsertAssignment(
  learnerId: string,
  trackId: string,
  levelId: string,
  assignedById: string,
) {
  const existing = await prisma.learnerAssignment.findFirst({
    where: { learnerId, levelId, isActive: true },
  });
  if (existing) return existing;
  return prisma.learnerAssignment.create({ data: { learnerId, trackId, levelId, assignedById } });
}

async function upsertLearnerOutcome(
  learnerId: string,
  outcomeId: string,
  assignmentId: string,
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'ACHIEVED' | 'NOT_ACHIEVED',
  priority: number,
) {
  return prisma.learnerOutcome.upsert({
    where: { learnerId_outcomeId_assignmentId: { learnerId, outcomeId, assignmentId } },
    create: {
      learnerId,
      outcomeId,
      assignmentId,
      status,
      priority,
      achievedAt: status === 'ACHIEVED' ? new Date() : null,
    },
    update: { status, priority, achievedAt: status === 'ACHIEVED' ? new Date() : null },
  });
}

async function upsertTrainingPlan(input: {
  organizationId: string;
  learnerId: string;
  assignmentId: string;
  title: string;
  trainingDays: number;
  createdById: string;
}) {
  const existing = await prisma.trainingPlan.findFirst({
    where: { organizationId: input.organizationId, learnerId: input.learnerId, title: input.title },
  });
  if (existing) return existing;
  const startDate = new Date('2026-08-01T00:00:00Z');
  const endDate = new Date('2026-08-01T23:59:59Z');
  return prisma.trainingPlan.create({
    data: { ...input, status: 'COMPLETED', startDate, endDate, confirmedAt: startDate },
  });
}

async function upsertSession(input: {
  organizationId: string;
  planId: string;
  learnerId: string;
  primaryOutcomeId: string;
  sequence: number;
  scheduledStart: Date;
  scheduledEnd: Date;
  durationMinutes: number;
}) {
  const existing = await prisma.session.findFirst({
    where: { planId: input.planId, sequence: input.sequence },
  });
  if (existing) return existing;
  return prisma.session.create({
    data: { ...input, joinToken: randomBytes(24).toString('base64url') },
  });
}

async function upsertSessionContent(
  sessionId: string,
  contentItemId: string,
  order: number,
  source: 'RECOMMENDED' | 'MANUAL' | 'IN_SESSION_REMEDIAL',
) {
  const existing = await prisma.sessionContent.findFirst({ where: { sessionId, contentItemId } });
  if (existing) return existing;
  return prisma.sessionContent.create({ data: { sessionId, contentItemId, order, source } });
}

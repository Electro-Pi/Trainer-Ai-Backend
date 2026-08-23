import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const learner = await prisma.learner.findFirst({
    where: { email: 'mahmoud.rabea@electropi.ai' },
  });
  if (!learner) return console.log('no learner');

  // Look for skills matching Responsive Web Design / State Management with React
  const skills = await prisma.skill.findMany({
    where: {
      OR: [
        { nameEn: { contains: 'Responsive', mode: 'insensitive' } },
        { nameEn: { contains: 'State Management', mode: 'insensitive' } },
      ],
    },
  });
  console.log(
    'Matching skills:',
    skills.map((s) => ({ id: s.id, name: s.nameEn })),
  );

  // All plans for this learner, wider net, including assignment info
  const plans = await prisma.trainingPlan.findMany({
    where: { learnerId: learner.id },
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      confirmedAt: true,
      assignmentId: true,
      sessions: {
        select: {
          id: true,
          graphEventId: true,
          joinUrl: true,
          status: true,
          scheduledStart: true,
          updatedAt: true,
          primaryOutcome: { select: { targetSkills: true } },
        },
      },
    },
  });
  for (const p of plans) {
    console.log(
      `\nPlan ${p.id} status=${p.status} created=${p.createdAt} updated=${p.updatedAt} confirmedAt=${p.confirmedAt}`,
    );
    for (const s of p.sessions) {
      console.log(
        '  session',
        s.id,
        'graphEventId=',
        !!s.graphEventId,
        'status=',
        s.status,
        'updatedAt=',
        s.updatedAt,
        'skills=',
        s.primaryOutcome?.targetSkills,
      );
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

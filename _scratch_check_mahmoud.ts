import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const learner = await prisma.learner.findFirst({
    where: { email: 'mahmoud.rabea@electropi.ai' },
  });
  if (!learner) {
    console.log('Learner not found');
    return;
  }
  console.log('Learner:', learner.id, learner.email);

  const plans = await prisma.trainingPlan.findMany({
    where: { learnerId: learner.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      sessions: true,
    },
  });

  for (const plan of plans) {
    console.log('\n=== Plan', plan.id, 'status=', plan.status, 'createdAt=', plan.createdAt, '===');
    for (const s of plan.sessions) {
      console.log(
        '  Session',
        s.id,
        '| graphEventId=',
        s.graphEventId,
        '| joinUrl=',
        s.joinUrl,
        '| status=',
        s.status,
        '| scheduledStart=',
        s.scheduledStart,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

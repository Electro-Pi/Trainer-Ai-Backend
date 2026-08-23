import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const plan = await prisma.trainingPlan.findUnique({
    where: { id: 't6h88ab7kxlxxmvfsnjxy7vf' },
    include: {
      sessions: {
        include: {
          primaryOutcome: true,
        },
      },
    },
  });
  console.log(JSON.stringify(plan, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

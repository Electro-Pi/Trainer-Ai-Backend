import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { env } from '@/config/env.js';

// Prisma 7's SQL path has no bundled engine binary — a driver adapter is
// mandatory, not optional (see MEMORY.md Technical Discoveries for the
// full v6→v7 delta this project inherited).
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

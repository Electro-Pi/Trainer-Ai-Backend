import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { env } from '@/config/env.js';
import { tenantExtension } from '@/database/tenant.extension.js';

// Prisma 7's SQL path has no bundled engine binary — a driver adapter is
// mandatory, not optional (see MEMORY.md Technical Discoveries for the
// full v6→v7 delta this project inherited).
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

// Every tenant-scoped query is forced through the extension (ARCHITECTURE
// §7.3) — this is the ONLY exported client. Nothing should construct its own
// `new PrismaClient()`, or the tenant guard is bypassable.
export const prisma = new PrismaClient({ adapter }).$extends(tenantExtension());

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

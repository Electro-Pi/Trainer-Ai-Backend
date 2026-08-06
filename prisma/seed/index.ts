import { prisma } from '@/database/prisma.service.js';

import { seedDemo } from './demo.seed.js';
import { seedTracks } from './tracks.seed.js';

/**
 * Idempotent end-to-end seed (P1-8): safe to re-run against an existing
 * database. Order matters — the catalogue (tracks/levels/outcomes) must
 * exist before the demo data that assigns learners into it.
 */
async function main(): Promise<void> {
  const org = await prisma.organization.upsert({
    where: { entraTenantId: 'demo-tenant' },
    create: { name: 'Demo Organization', entraTenantId: 'demo-tenant', defaultLanguage: 'EN' },
    update: {},
  });

  console.log(`[seed] Organization: ${org.name} (${org.id})`);

  await seedTracks(org.id);
  console.log('[seed] Tracks, levels and outcomes seeded.');

  await seedDemo(org.id);
  console.log('[seed] Demo org data seeded.');
}

main()
  .then(() => {
    console.log('[seed] Done.');
  })
  .catch((err: unknown) => {
    console.error('[seed] Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

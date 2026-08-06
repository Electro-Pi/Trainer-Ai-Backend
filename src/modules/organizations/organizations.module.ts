import { OrganizationRepository } from './repositories/organization.repository.js';

// P2 only needs the repository exposed for auth's tenant upsert (`AU-01`).
// A real CRUD router (branding, retention settings) is a later phase's job;
// this file still owns the sanctioned cross-module surface per ARCHITECTURE
// §4/AGENTS §5 (no deep imports into another module's internals).
export const organizationRepository = new OrganizationRepository();

import { TrackRepository } from './repositories/track.repository.js';

// P3 (`learners`) only needs the repository exposed to validate a level
// assignment's `trackId` (`LV-01`). A real CRUD router lands in P4 — same
// repo-only-export pattern `organizations.module.ts` used ahead of its own
// routes (ARCHITECTURE §4/AGENTS §5: cross-module access goes through
// `<name>.module.ts`, never a deep import into `repositories/*`).
export const trackRepository = new TrackRepository();

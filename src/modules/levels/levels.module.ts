import { LevelRepository } from './repositories/level.repository.js';

// P3 (`learners`) only needs the repository exposed to validate a level
// assignment's `levelId` (`LV-01`, `LV-02`). A real CRUD router lands in P4.
export const levelRepository = new LevelRepository();

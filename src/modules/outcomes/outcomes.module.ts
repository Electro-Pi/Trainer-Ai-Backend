import { OutcomeRepository } from './repositories/outcome.repository.js';

// P3 (`learners`) only needs the repository exposed to materialize
// `LearnerOutcome` rows for a level's outcome set (`LV-03`, `LV-04`). A real
// CRUD router lands in P4.
export const outcomeRepository = new OutcomeRepository();

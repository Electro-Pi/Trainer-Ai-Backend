-- Deletes every track and everything under it: levels, skills, outcomes,
-- content, learner assignments/outcomes, training plans, sessions,
-- assessments, reports, recommendations, question banks, rubrics, slide
-- decks. Ordered child -> parent to satisfy foreign keys. Irreversible —
-- back up the database before running.

BEGIN;

-- Assessment layer (depends on sessions/rubrics/questions)
DELETE FROM assessment_answers;
DELETE FROM assessments;
DELETE FROM rubric_criteria;
DELETE FROM rubrics;
DELETE FROM questions;
DELETE FROM question_banks;

-- Session layer
DELETE FROM invitations;
DELETE FROM session_contents;
DELETE FROM session_outcomes;
DELETE FROM reports;
DELETE FROM recommendation_items;
DELETE FROM recommendations;
DELETE FROM sessions;

-- Plan-scoped snapshot layer (hangs off training_plans)
DELETE FROM plan_content_media;
DELETE FROM plan_content_snapshots;
DELETE FROM plan_learner_outcome_snapshots;
DELETE FROM plan_outcome_snapshots;
DELETE FROM plan_skill_snapshots;
DELETE FROM plan_track_snapshots;
DELETE FROM training_plans;
DELETE FROM plan_templates;

-- Learner assignment layer
DELETE FROM learner_outcomes;
DELETE FROM learner_assignments;

-- AI Trainer integration
DELETE FROM external_sessions;
DELETE FROM slide_decks;

-- Content layer
DELETE FROM content_effectiveness;
DELETE FROM content_chunks;
DELETE FROM media_assets;
DELETE FROM content_prerequisites;
DELETE FROM content_outcomes;
DELETE FROM content_items;

-- Catalogue layer
DELETE FROM outcomes;
DELETE FROM skills;
DELETE FROM levels;
DELETE FROM tracks;

COMMIT;

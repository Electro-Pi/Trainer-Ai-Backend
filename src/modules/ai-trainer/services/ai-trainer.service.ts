import { ConflictError, NotFoundError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { levelRepository } from '@/modules/levels/levels.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';
import { skillRepository } from '@/modules/skills/skills.module.js';
import { trackRepository } from '@/modules/tracks/tracks.module.js';

import type {
  GenerateTrackSlidesResponseDto,
  SlideDeckResultDto,
  SuggestedSkillDto,
  SuggestSkillOutcomesResponseDto,
  SuggestTrackSkillsResponseDto,
} from '../dto/ai-trainer.dto.js';
import { SlideDeckRepository } from '../repositories/slide-deck.repository.js';

import { AiTrainerClientService } from './ai-trainer-client.service.js';

export interface ActingUser {
  id: string;
  organizationId: string;
}

/**
 * `POST /tracks/:trackId/slides`, `POST /tracks/:trackId/recommendations/skills`
 * and `POST /skills/:skillId/recommendations/outcomes` — the "generate slide
 * decks" + "advisory suggestions" half of the AI Trainer integration. Mirrors
 * `recommendations` module's split: advisory calls are stateless pass-through
 * (nothing persisted), the slide-generation call is the one that writes
 * `SlideDeck` rows. DB lookups go through the sanctioned cross-module
 * repositories exported by `tracks`/`levels`/`skills`/`outcomes` (ARCHITECTURE
 * §4/AGENTS §5) rather than reaching into those modules' internals.
 */
export class AiTrainerService {
  private readonly client = new AiTrainerClientService();
  private readonly slideDecks = new SlideDeckRepository();

  /**
   * Traverses Track → Level → Skill → Outcome (this catalogue's real
   * hierarchy — a `Skill` has no direct `trackId`, see `Skill.levelId`) to
   * build the AI service's per-skill `outcomes[]` payload, calls the
   * (blocking) `POST /slides`, then upserts one `SlideDeck` row per skill —
   * create on first generation, update in place on regeneration
   * (`SlideDeckRepository.upsertForSkill`).
   */
  async generateTrackSlides(
    actor: ActingUser,
    trackId: string,
  ): Promise<GenerateTrackSlidesResponseDto> {
    const track = await trackRepository.findByIdScoped(trackId);
    if (!track) {
      throw new NotFoundError('Track not found');
    }

    const levels = await levelRepository.findByTrack(trackId);
    const skillsByLevel = await Promise.all(
      levels.map((level) => skillRepository.findByLevel(level.id)),
    );
    const allSkills = skillsByLevel.flat();

    if (allSkills.length === 0) {
      throw new ConflictError('Track has no skills to generate slides for');
    }

    const allOutcomes = await outcomeRepository.findBySkillIds(allSkills.map((skill) => skill.id));
    const outcomesBySkillId = new Map<string, string[]>();
    for (const outcome of allOutcomes) {
      if (!outcome.skillId) continue;
      const titles = outcomesBySkillId.get(outcome.skillId) ?? [];
      titles.push(outcome.titleEn);
      outcomesBySkillId.set(outcome.skillId, titles);
    }

    // The AI service requires >=1 outcome per skill in the payload — a skill
    // with none yet can't be sent (its own request-schema `min(1)`), so it's
    // silently excluded here rather than failing the whole track's generation.
    const skills = allSkills.filter((skill) => (outcomesBySkillId.get(skill.id) ?? []).length > 0);
    if (skills.length === 0) {
      throw new ConflictError('No skill on this track has outcomes yet — nothing to generate');
    }

    // No track-level language field exists on `Track` (both `nameEn`/`nameAr`
    // are always populated per this app's bilingual-columns convention) — the
    // `language` key is omitted so the AI service falls back to its own
    // default (`en-US` per the API doc) rather than us guessing one.
    const result = await this.client.generateSlides({
      track_name: track.nameEn,
      track_description: track.descriptionEn || null,
      skills: skills.map((skill) => ({
        skill_name: skill.nameEn,
        outcomes: outcomesBySkillId.get(skill.id) ?? [],
      })),
    });

    const skillByName = new Map(skills.map((skill) => [skill.nameEn, skill]));

    const results: SlideDeckResultDto[] = [];
    for (const skillResult of result.skills) {
      const skill = skillByName.get(skillResult.skill_name);
      if (!skill) continue; // AI service echoed a skill name we didn't send — skip rather than crash

      await this.slideDecks.upsertForSkill({
        organizationId: actor.organizationId,
        skillId: skill.id,
        aiDeckId: skillResult.slide_deck_id,
        status: skillResult.status,
        slideCount: skillResult.slide_count,
        generationError: skillResult.generation_error,
        downloadUrl: skillResult.download_url,
      });

      results.push({
        skillId: skill.id,
        skillName: skillResult.skill_name,
        slideDeckId: skillResult.slide_deck_id,
        status: skillResult.status,
        slideCount: skillResult.slide_count,
        generationError: skillResult.generation_error,
        downloadUrl: skillResult.download_url,
      });
    }

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'ai_trainer.slides_generated',
      entityType: 'Track',
      entityId: track.id,
      after: { skillCount: results.length },
    });

    return { trackName: result.track_name, skills: results };
  }

  async suggestTrackSkills(
    trackId: string,
    trackDescription?: string,
  ): Promise<SuggestTrackSkillsResponseDto> {
    const track = await trackRepository.findByIdScoped(trackId);
    if (!track) {
      throw new NotFoundError('Track not found');
    }

    const result = await this.client.suggestSkills({
      track_name: track.nameEn,
      track_description: trackDescription ?? track.descriptionEn ?? null,
    });

    const suggestedSkills: SuggestedSkillDto[] = result.suggested_skills.map((s) => ({
      skillName: s.skill_name,
      rationale: s.rationale,
      outcomes: s.outcomes,
    }));

    return { suggestedSkills };
  }

  async suggestSkillOutcomes(
    skillId: string,
    trackDescription?: string,
  ): Promise<SuggestSkillOutcomesResponseDto> {
    const skill = await skillRepository.findByIdScoped(skillId);
    if (!skill) {
      throw new NotFoundError('Skill not found');
    }

    let trackName = skill.category;
    let description = trackDescription;
    if (skill.levelId) {
      const level = await levelRepository.findById(skill.levelId);
      if (level) {
        const track = await trackRepository.findByIdScoped(level.trackId);
        if (track) {
          trackName = track.nameEn;
          description ??= track.descriptionEn;
        }
      }
    }

    const result = await this.client.suggestOutcomes({
      track_name: trackName,
      track_description: description ?? null,
      skill_name: skill.nameEn,
    });

    return { suggestedOutcomes: result.suggested_outcomes };
  }

  /**
   * Draft-mode counterpart to `suggestTrackSkills` — for the track-creation
   * wizard, where the track being composed has no real id yet. No DB lookup:
   * the caller's typed name/description go straight to the AI service.
   */
  async suggestDraftTrackSkills(
    trackName: string,
    trackDescription?: string,
  ): Promise<SuggestTrackSkillsResponseDto> {
    const result = await this.client.suggestSkills({
      track_name: trackName,
      track_description: trackDescription ?? null,
    });

    const suggestedSkills: SuggestedSkillDto[] = result.suggested_skills.map((s) => ({
      skillName: s.skill_name,
      rationale: s.rationale,
      outcomes: s.outcomes,
    }));

    return { suggestedSkills };
  }

  /** Draft-mode counterpart to `suggestSkillOutcomes` — same no-DB-lookup shape as `suggestDraftTrackSkills`. */
  async suggestDraftSkillOutcomes(
    trackName: string,
    skillName: string,
    trackDescription?: string,
  ): Promise<SuggestSkillOutcomesResponseDto> {
    const result = await this.client.suggestOutcomes({
      track_name: trackName,
      track_description: trackDescription ?? null,
      skill_name: skillName,
    });

    return { suggestedOutcomes: result.suggested_outcomes };
  }
}

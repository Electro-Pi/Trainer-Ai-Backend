import type { Request, Response } from 'express';

import type { AuthContext } from '@/common/types/express.js';

import type {
  SuggestDraftSkillOutcomesRequestDto,
  SuggestDraftTrackSkillsRequestDto,
  SuggestSkillOutcomesRequestDto,
  SuggestTrackSkillsRequestDto,
} from '../dto/ai-trainer.dto.js';
import { AiTrainerService, type ActingUser } from '../services/ai-trainer.service.js';

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId };
}

export class AiTrainerController {
  private readonly service = new AiTrainerService();

  /** `POST /tracks/:trackId/slides` — blocking, generates one slide deck per skill in the track. */
  async generateTrackSlides(req: Request, res: Response): Promise<void> {
    const { trackId } = req.params as { trackId: string };
    const result = await this.service.generateTrackSlides(toActingUser(req.auth!), trackId);
    res.status(201).json(result);
  }

  /** `POST /tracks/:trackId/recommendations/skills` — stateless, advisory. */
  async suggestTrackSkills(req: Request, res: Response): Promise<void> {
    const { trackId } = req.params as { trackId: string };
    const { trackDescription } = req.body as SuggestTrackSkillsRequestDto;
    const result = await this.service.suggestTrackSkills(trackId, trackDescription);
    res.status(200).json(result);
  }

  /** `POST /skills/:skillId/recommendations/outcomes` — stateless, advisory. */
  async suggestSkillOutcomes(req: Request, res: Response): Promise<void> {
    const { skillId } = req.params as { skillId: string };
    const { trackDescription } = req.body as SuggestSkillOutcomesRequestDto;
    const result = await this.service.suggestSkillOutcomes(skillId, trackDescription);
    res.status(200).json(result);
  }

  /** `POST /ai-trainer/recommendations/skills` — draft-mode, no track id required. */
  async suggestDraftTrackSkills(req: Request, res: Response): Promise<void> {
    const { trackName, trackDescription } = req.body as SuggestDraftTrackSkillsRequestDto;
    const result = await this.service.suggestDraftTrackSkills(trackName, trackDescription);
    res.status(200).json(result);
  }

  /** `POST /ai-trainer/recommendations/outcomes` — draft-mode, no skill id required. */
  async suggestDraftSkillOutcomes(req: Request, res: Response): Promise<void> {
    const { trackName, trackDescription, skillName } =
      req.body as SuggestDraftSkillOutcomesRequestDto;
    const result = await this.service.suggestDraftSkillOutcomes(
      trackName,
      skillName,
      trackDescription,
    );
    res.status(200).json(result);
  }
}

import { NotFoundError } from '@/common/exceptions/app-error.js';
import { levelRepository } from '@/modules/levels/levels.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';
import { trackRepository, type Track } from '@/modules/tracks/tracks.module.js';

export interface PublicOutcome {
  id: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
}

export interface PublicLevel {
  id: string;
  nameEn: string;
  nameAr: string;
  order: number;
  outcomes: PublicOutcome[];
}

export interface PublicTrack {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  department: string;
  targetSkills: string[];
  impactIndicators: string[];
  levels: PublicLevel[];
}

/**
 * `WS-02` — the public marketing site's track catalogue. No tenant/auth
 * context; reads the shared BRD content via `TrackRepository.findPublicByKey`
 * (its own deliberate, narrow bypass of the tenant extension), then each
 * track's `Level`/`Outcome` rows — neither is tenant-scoped at the Prisma
 * extension level (reached transitively via `trackId`), so no special
 * handling is needed for those two reads.
 */
export class PublicCatalogueService {
  async listTracks(): Promise<PublicTrack[]> {
    const tracks = await trackRepository.findPublicByKey();
    return Promise.all(tracks.map((track) => this.attachLevels(track)));
  }

  async getTrackByKey(key: string): Promise<PublicTrack> {
    const tracks = await trackRepository.findPublicByKey();
    const track = tracks.find((t) => t.key === key);
    if (!track) throw new NotFoundError('Track not found');
    return this.attachLevels(track);
  }

  private async attachLevels(track: Track): Promise<PublicTrack> {
    const levels = await levelRepository.findByTrack(track.id);
    const levelsWithOutcomes = await Promise.all(
      levels
        .filter((level) => level.isEnabled)
        .map(async (level) => {
          const outcomes = await outcomeRepository.findByLevel(level.id);
          return {
            id: level.id,
            nameEn: level.nameEn,
            nameAr: level.nameAr,
            order: level.order,
            outcomes: outcomes
              .filter((outcome) => outcome.isEnabled)
              .map((outcome) => ({
                id: outcome.id,
                titleEn: outcome.titleEn,
                titleAr: outcome.titleAr,
                descriptionEn: outcome.descriptionEn,
                descriptionAr: outcome.descriptionAr,
              })),
          };
        }),
    );

    return {
      id: track.id,
      key: track.key,
      nameEn: track.nameEn,
      nameAr: track.nameAr,
      descriptionEn: track.descriptionEn,
      descriptionAr: track.descriptionAr,
      department: track.department,
      targetSkills: track.targetSkills,
      impactIndicators: track.impactIndicators,
      levels: levelsWithOutcomes,
    };
  }
}

export const publicCatalogueService = new PublicCatalogueService();

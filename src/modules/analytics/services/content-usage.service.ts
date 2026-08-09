import type { ContentUsageResponseDto } from '../dto/analytics.dto.js';
import { analyticsRepository } from '../repositories/analytics.repository.js';

export interface ContentUsageQuery {
  organizationId: string;
  trackId?: string;
  levelId?: string;
}

/** `PF-07` — `ContentEffectiveness` rows as recomputed nightly by `recompute-effectiveness.job` (`RC-13`, P10-5); never computed inline here. */
export class ContentUsageService {
  async contentUsage(query: ContentUsageQuery): Promise<ContentUsageResponseDto> {
    const rows = await analyticsRepository.contentUsage(query.organizationId);
    const filtered = rows.filter(
      (row) =>
        (!query.trackId || row.trackId === query.trackId) &&
        (!query.levelId || row.levelId === query.levelId),
    );
    return { items: filtered };
  }
}

export const contentUsageService = new ContentUsageService();

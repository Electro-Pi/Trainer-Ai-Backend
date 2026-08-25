import { NotFoundError } from '@/common/exceptions/app-error.js';
import { runWithTenant } from '@/database/tenant-context.js';
import type { ContentItem } from '@/modules/content/content.module.js';
import { contentItemRepository, mediaService } from '@/modules/content/content.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';
import { sessionContentRepository, sessionRepository } from '@/modules/sessions/sessions.module.js';

const MAX_REMEDIAL_ITEMS = 2;

export interface RemediationResult {
  contentItemId: string;
  name: string;
  downloadUrl: string | null;
}

/**
 * `RC-07`, ARCHITECTURE §8.3 — the in-session remediation pipeline. Target
 * < 2s, hence deterministic filtering, no scoring signals, no vector query,
 * no LLM round-trip: candidates are every document belonging to the failed
 * outcome's skill, excluding anything already delivered in this session,
 * capped at `MAX_REMEDIAL_ITEMS`.
 */
export class RemediationService {
  async find(sessionId: string, outcomeId: string): Promise<RemediationResult[]> {
    const raw = await sessionRepository.findOrganizationIdForSession(sessionId);
    if (!raw) throw new NotFoundError('Session not found');

    return runWithTenant(raw.organizationId, async () => {
      const session = await sessionRepository.findByIdScoped(sessionId);
      if (!session) throw new NotFoundError('Session not found');

      const outcome = await outcomeRepository.findByIdScoped(outcomeId);
      if (!outcome) throw new NotFoundError('Outcome not found');
      if (!outcome.skillId) throw new NotFoundError('Outcome has no assigned skill');

      const sessionContents = await sessionContentRepository.findBySession(session.id);
      const deliveredContentIds = new Set(
        sessionContents.filter((sc) => sc.deliveredAt !== null).map((sc) => sc.contentItemId),
      );

      const candidates = await contentItemRepository.findBySkill(outcome.skillId);

      const ranked = candidates
        .filter((item) => !deliveredContentIds.has(item.id))
        .slice(0, MAX_REMEDIAL_ITEMS);

      return Promise.all(ranked.map((item) => this.toResult(item)));
    });
  }

  private async toResult(item: ContentItem): Promise<RemediationResult> {
    const media = await mediaService.listByContentItem(item.id);
    const downloadUrl = media[0] ? await mediaService.getDownloadUrl(media[0].id) : null;
    return {
      contentItemId: item.id,
      name: item.name,
      downloadUrl,
    };
  }
}

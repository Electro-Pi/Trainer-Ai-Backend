import type { Request, Response } from 'express';

import { contentUsageService } from '../services/content-usage.service.js';
import { exportService } from '../services/export.service.js';
import { performanceService } from '../services/performance.service.js';
import { skillsService } from '../services/skills.service.js';
import { trendsService } from '../services/trends.service.js';

export class AnalyticsController {
  /** `PF-01`, `PF-03` */
  async teamPerformance(req: Request, res: Response): Promise<void> {
    const { teamId } = req.params as { teamId: string };
    const result = await performanceService.teamPerformance(teamId);
    res.status(200).json(result);
  }

  /** `PF-02` */
  async organizationPerformance(_req: Request, res: Response): Promise<void> {
    const result = await performanceService.organizationPerformance();
    res.status(200).json(result);
  }

  /** `PF-04`, `PF-05` */
  async learnerSkills(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const result = await skillsService.learnerSkills(id);
    res.status(200).json(result);
  }

  /** `PF-06`, `PF-09` */
  async trends(req: Request, res: Response): Promise<void> {
    const query = req.query as {
      teamId?: string;
      trackId?: string;
      levelId?: string;
      from?: string;
      to?: string;
      granularity: 'week' | 'month';
    };
    const result = await trendsService.trends({
      ...(query.teamId ? { teamId: query.teamId } : {}),
      ...(query.trackId ? { trackId: query.trackId } : {}),
      ...(query.levelId ? { levelId: query.levelId } : {}),
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
      granularity: query.granularity,
    });
    res.status(200).json(result);
  }

  /** `PF-07` */
  async contentUsage(req: Request, res: Response): Promise<void> {
    const query = req.query as { trackId?: string; levelId?: string };
    const result = await contentUsageService.contentUsage({
      organizationId: req.auth!.orgId,
      ...(query.trackId ? { trackId: query.trackId } : {}),
      ...(query.levelId ? { levelId: query.levelId } : {}),
    });
    res.status(200).json(result);
  }

  /** `PF-08` */
  async export(req: Request, res: Response): Promise<void> {
    const query = req.query as {
      format: 'pdf' | 'xlsx';
      scope: 'team' | 'organization';
      teamId?: string;
    };
    const result = await exportService.export(query);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.status(200).send(result.buffer);
  }
}

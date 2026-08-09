import type { Request, Response } from 'express';

import { publicCatalogueService } from '../services/public-catalogue.service.js';
import { publicService, type SubmitDemoRequestInput } from '../services/public.service.js';

export class PublicController {
  async listTracks(_req: Request, res: Response): Promise<void> {
    const tracks = await publicCatalogueService.listTracks();
    res.status(200).json({ data: tracks });
  }

  async getTrack(req: Request, res: Response): Promise<void> {
    const { key } = req.params as { key: string };
    const track = await publicCatalogueService.getTrackByKey(key);
    res.status(200).json(track);
  }

  async submitDemoRequest(req: Request, res: Response): Promise<void> {
    const dto = req.body as SubmitDemoRequestInput;
    await publicService.submitDemoRequest(dto);
    res.status(202).json({ received: true });
  }
}

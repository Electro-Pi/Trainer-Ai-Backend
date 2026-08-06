import type { Request, Response } from 'express';

import { DirectoryService } from '../services/directory.service.js';

const service = new DirectoryService();

export class DirectoryController {
  async search(req: Request, res: Response): Promise<void> {
    const { q } = req.query as unknown as { q: string };
    const users = await service.searchUsers(req.auth!.sub, q);
    res.status(200).json({ data: users });
  }

  async groupMembers(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const members = await service.getGroupMembers(req.auth!.sub, id);
    res.status(200).json({ data: members });
  }
}

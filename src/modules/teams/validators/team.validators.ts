import { z } from 'zod';

import { cuidSchema, nameSchema, paginationSchema } from '@/common/validators/primitives.js';

const descriptionSchema = z.string().trim().max(2000);

export const createTeamSchema = z
  .object({
    name: nameSchema.optional(),
    nameEn: nameSchema.optional(),
    nameAr: nameSchema.optional(),
    description: descriptionSchema.optional(),
    departmentId: cuidSchema,
    managerId: cuidSchema.optional(),
    pendingManagerInviteId: cuidSchema.optional(),
  })
  .refine((dto) => !(dto.managerId && dto.pendingManagerInviteId), {
    message: 'Provide either managerId or pendingManagerInviteId, not both',
    path: ['managerId'],
  })
  .superRefine((dto, ctx) => {
    if (dto.name || (dto.nameEn && dto.nameAr)) return;
    if (!dto.nameEn) {
      ctx.addIssue({ code: 'custom', path: ['nameEn'], message: 'English team name is required' });
    }
    if (!dto.nameAr) {
      ctx.addIssue({ code: 'custom', path: ['nameAr'], message: 'Arabic team name is required' });
    }
  });

export const updateTeamSchema = z
  .object({
    name: nameSchema.optional(),
    nameEn: nameSchema.optional(),
    nameAr: nameSchema.optional(),
    description: descriptionSchema.optional(),
    departmentId: cuidSchema.optional(),
    managerId: cuidSchema.optional(),
    pendingManagerInviteId: cuidSchema.optional(),
  })
  .refine((dto) => !(dto.managerId && dto.pendingManagerInviteId), {
    message: 'Provide either managerId or pendingManagerInviteId, not both',
    path: ['managerId'],
  });

export const teamFilterSchema = paginationSchema;

export const teamIdParamsSchema = z.object({
  id: cuidSchema,
});

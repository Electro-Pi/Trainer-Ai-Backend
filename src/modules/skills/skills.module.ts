import { openApiRegistry } from '@/swagger/swagger.js';

import { SkillRepository } from './repositories/skill.repository.js';
import { createLevelSkillsRouter, createSkillsRouter } from './skills.routes.js';

export type { Skill } from './repositories/skill.repository.js';

export const skillsRouter = createSkillsRouter();
export const levelSkillsRouter = createLevelSkillsRouter();

export const skillRepository = new SkillRepository();

openApiRegistry.registerPath({
  method: 'get',
  path: '/skills',
  tags: ['Skills'],
  summary: 'Lists skills',
  responses: { 200: { description: 'Skill list' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/skills',
  tags: ['Skills'],
  summary: 'Creates a skill (MANAGER, CONTENT_MANAGER, ADMIN)',
  responses: { 201: { description: 'Created skill' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/skills/{id}',
  tags: ['Skills'],
  summary: 'Gets a skill by id',
  responses: { 200: { description: 'Skill' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/skills/{id}',
  tags: ['Skills'],
  summary: 'Updates a skill’s fields',
  responses: { 200: { description: 'Updated skill' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/skills/{id}/enabled',
  tags: ['Skills'],
  summary: 'Enables/disables a skill without deleting it',
  responses: { 200: { description: 'Updated skill' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/skills/{id}/duplicate',
  tags: ['Skills'],
  summary: 'Copies a skill into a new (disabled) row',
  responses: { 201: { description: 'New (disabled) skill copy' } },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/skills/{id}',
  tags: ['Skills'],
  summary: 'Hard-deletes a skill',
  responses: { 204: { description: 'Deleted' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/levels/{levelId}/skills',
  tags: ['Skills'],
  summary: 'Lists a level’s skills (`Skill.levelId`)',
  responses: { 200: { description: 'Skill list' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/levels/{levelId}/skills',
  tags: ['Skills'],
  summary: 'Creates a skill on a level (MANAGER, CONTENT_MANAGER, ADMIN)',
  responses: { 201: { description: 'Created skill' } },
});

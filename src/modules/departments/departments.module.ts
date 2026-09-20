import { openApiRegistry } from '@/swagger/swagger.js';

import { createDepartmentsRouter } from './departments.routes.js';
import { DepartmentRepository } from './repositories/department.repository.js';

export const departmentsRouter = createDepartmentsRouter();

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `tracks`,
// `teams` and `learners` resolve a `departmentId` through this instead of
// deep-importing `modules/departments/repositories/*`.
export const departmentRepository = new DepartmentRepository();

openApiRegistry.registerPath({
  method: 'get',
  path: '/departments',
  tags: ['Departments'],
  summary: "Lists departments in the caller's organization (ADMIN only)",
  responses: { 200: { description: 'Department list' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/departments',
  tags: ['Departments'],
  summary: 'Creates a department (ADMIN only)',
  responses: { 201: { description: 'Created department' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/departments/{id}',
  tags: ['Departments'],
  summary: 'Gets a department by id (ADMIN only)',
  responses: { 200: { description: 'Department' }, 404: { description: 'Not found' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/departments/{id}',
  tags: ['Departments'],
  summary: 'Renames or enables/disables a department (ADMIN only)',
  responses: { 200: { description: 'Updated department' } },
});

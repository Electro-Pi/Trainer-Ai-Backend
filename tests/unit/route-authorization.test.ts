import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Regression guard for ARCHITECTURE §7.2.
 *
 * A CONTENT_CREATOR could read every learner's reports in the organization by
 * typing `/portal/reports`, and any signed-in user could list org-wide
 * sessions. The cause was structural, not a one-off: `requireTeamAccess`
 * protects a single resource named in the URL, so COLLECTION routes had
 * nothing but `authenticate` + `tenantScope` — which narrows to the
 * organization, never to the team.
 *
 * This test reads the route files and fails when a route has neither a role
 * gate (`authorize`, router-level or per-route) nor an ownership guard
 * (`requireTeamAccess` / `requireTeamScopedList`), so the next list endpoint
 * can't ship open. Routes that are deliberately unauthenticated or
 * authenticated by another scheme are listed explicitly below, with why.
 */

const ROUTES_DIR = path.resolve(import.meta.dirname, '../../src/modules');

/**
 * Deliberately not portal-role gated. Each entry is a decision, not an
 * oversight — adding a route here should be a conscious act.
 */
const INTENTIONALLY_UNGATED = new Set([
  // Service-token authenticated (`P8-2`): the AI agent, not a portal user.
  'agent.routes.ts',
  // Pre-authentication endpoints — there is no role yet.
  'auth.routes.ts',
  // Public marketing/demo-request surface.
  'public.routes.ts',
  // Unauthenticated by explicit product decision — the AI team calls it
  // directly. Documented in the router's own doc comment.
  'ai-trainer-webhook.routes.ts',
  // Invite acceptance is reached from an emailed token, pre-role.
  'invites.routes.ts',
]);

interface RouteRow {
  file: string;
  method: string;
  route: string;
  gated: boolean;
}

function collectRoutes(): RouteRow[] {
  const rows: RouteRow[] = [];

  for (const moduleName of fs.readdirSync(ROUTES_DIR)) {
    const moduleDir = path.join(ROUTES_DIR, moduleName);
    if (!fs.statSync(moduleDir).isDirectory()) continue;

    for (const file of fs.readdirSync(moduleDir)) {
      if (!file.endsWith('.routes.ts')) continue;
      const src = fs.readFileSync(path.join(moduleDir, file), 'utf8');

      // One router factory at a time: a `router.use(authorize(...))` applies
      // to that factory's routes only, so it can't be read file-globally.
      for (const factory of src.split(/export function create/).slice(1)) {
        const routerUse = factory.match(/router\.use\(([^;]*)\);/s);
        const gatedAtRouterLevel = /authorize\(/.test(routerUse?.[1] ?? '');

        const routeRe =
          /router\.(get|post|put|patch|delete)\(\s*([\s\S]*?)\n {2}\);|router\.(get|post|put|patch|delete)\(([^\n]*)\);/g;
        let match: RegExpExecArray | null;
        while ((match = routeRe.exec(factory)) !== null) {
          const method = (match[1] ?? match[3] ?? '').toUpperCase();
          const body = match[2] ?? match[4] ?? '';
          const route = body.match(/['"]([^'"]*)['"]/)?.[1] ?? '?';
          const gated =
            gatedAtRouterLevel ||
            /authorize\(/.test(body) ||
            /requireTeamAccess\(|requireTeamScopedList\(/.test(body);
          rows.push({ file, method, route, gated });
        }
      }
    }
  }

  return rows;
}

describe('route authorization — ARCHITECTURE §7.2', () => {
  const routes = collectRoutes();

  it('parses the route table', () => {
    // Guards the parser itself: a regex that silently stops matching would
    // make every assertion below vacuously pass.
    expect(routes.length).toBeGreaterThan(100);
  });

  it('every route has a role gate or an ownership guard', () => {
    const unguarded = routes
      .filter((r) => !r.gated && !INTENTIONALLY_UNGATED.has(r.file))
      .map((r) => `${r.file} ${r.method} ${r.route}`);

    expect(
      unguarded,
      `These routes have neither authorize() nor an ownership guard. A collection ` +
        `route needs requireTeamScopedList(); a single-resource route needs ` +
        `requireTeamAccess(). If it is genuinely public, add the file to ` +
        `INTENTIONALLY_UNGATED with a reason.\n`,
    ).toEqual([]);
  });

  it('learner-data collections are team-scoped, not merely role-gated', () => {
    // A role gate alone still lets one manager read another manager's team,
    // which is the exact bug reported against GET /reports — and again, later,
    // against GET /learners, which this test missed because it only checked a
    // hardcoded list of three routes. The modules holding learner data are
    // enumerated instead, and every collection route in them must carry the
    // scoping guard, so a new one cannot ship role-gated only.
    const LEARNER_DATA_MODULES = ['analytics', 'learners', 'reports', 'sessions'];

    /**
     * Collections in these modules that are legitimately not team-scoped.
     * Each is a decision, not an oversight.
     */
    const NOT_TEAM_SCOPED = new Set([
      // ADMIN-only org-wide reads (§7.2's HR row, `AU-05`/`PF-02`/`PF-08`) —
      // there is no narrower scope to apply.
      'analytics.routes.ts GET /organization/performance',
      'analytics.routes.ts GET /export',
      // Catalog analytics — content usage counts, carrying no learner identity.
      'analytics.routes.ts GET /content-usage',
    ]);

    const offenders: string[] = [];
    for (const moduleName of LEARNER_DATA_MODULES) {
      const moduleDir = path.join(ROUTES_DIR, moduleName);
      for (const file of fs.readdirSync(moduleDir)) {
        if (!file.endsWith('.routes.ts')) continue;
        const src = fs.readFileSync(path.join(moduleDir, file), 'utf8');

        for (const factory of src.split(/export function create/).slice(1)) {
          const routeRe = /router\.(get)\(\s*([\s\S]*?)\n {2}\);|router\.(get)\(([^\n]*)\);/g;
          let match: RegExpExecArray | null;
          while ((match = routeRe.exec(factory)) !== null) {
            const body = match[2] ?? match[4] ?? '';
            const route = body.match(/['"]([^'"]*)['"]/)?.[1] ?? '?';
            // Only collections: a route with an `:id` is a single resource and
            // is covered by `requireTeamAccess` instead.
            if (route.includes(':')) continue;
            const id = `${file} GET ${route}`;
            if (NOT_TEAM_SCOPED.has(id)) continue;
            if (!/requireTeamScopedList\(/.test(body)) {
              offenders.push(id);
            }
          }
        }
      }
    }

    expect(
      offenders,
      `These learner-data collection routes are not team-scoped. A role gate ` +
        `alone still lets one DEPARTMENT_MANAGER read another's team — add ` +
        `requireTeamScopedList() and apply listScopeFilter() in the handler.\n`,
    ).toEqual([]);
  });

  it('scopes the live external-session reads to the owning manager', () => {
    // These proxy a learner's live transcript/evaluation straight to the AI
    // service without reading our own database, so a role gate alone left the
    // caller-supplied `externalSessionId` unchecked against their team — or
    // their organization.
    const src = fs.readFileSync(
      path.join(ROUTES_DIR, 'ai-trainer', 'ai-trainer.routes.ts'),
      'utf8',
    );
    const factory = src.split('export function createExternalSessionsRouter')[1] ?? '';

    for (const route of ['/:id', '/:id/transcript', '/:id/evaluation']) {
      const body =
        factory.match(
          new RegExp(`router\\.get\\(\\s*'${route.replace(/[/:]/g, '\\$&')}'[\\s\\S]*?\\n {2}\\);`),
        )?.[0] ?? '';
      expect(body, `${route} should be declared`).not.toBe('');
      expect(
        /requireTeamAccess\(/.test(body),
        `GET /external-sessions${route} must resolve ownership with requireTeamAccess`,
      ).toBe(true);
    }
  });

  it('does not grant CONTENT_CREATOR access to learner-data reads', () => {
    for (const file of ['learners.routes.ts', 'reports.routes.ts', 'sessions.routes.ts']) {
      const src = fs.readFileSync(
        path.join(ROUTES_DIR, file.replace('.routes.ts', ''), file),
        'utf8',
      );
      const readRoles = src.match(/const READ_ROLES = \[([^\]]*)\]/);
      expect(readRoles, `${file} should declare READ_ROLES`).not.toBeNull();
      expect(readRoles?.[1]).not.toContain('CONTENT_CREATOR');
    }
  });
});

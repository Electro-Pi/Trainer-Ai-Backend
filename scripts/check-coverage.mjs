#!/usr/bin/env node
// Coverage gate on critical paths (P11-8) — a single repo-wide percentage is
// easy to satisfy by testing lots of trivial CRUD glue while leaving the
// modules that actually decide something (scoring, verdicts, tenancy) thin.
// This checks line coverage on the handful of files where a silent
// regression would be worst: the recommendation signals/services (the
// product's differentiator), verdict scoring (§9.1's non-negotiable "we own
// judgement" boundary), and the tenant-isolation extension (§7.3's whole
// security model). Reads vitest's `json-summary` coverage reporter output.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const THRESHOLD_PCT = 80;

const CRITICAL_PATH_PREFIXES = [
  'src/modules/recommendations/signals/',
  'src/modules/recommendations/services/scorer.service.ts',
  'src/modules/recommendations/services/ordering.service.ts',
  'src/modules/recommendations/services/duration-fit.service.ts',
  'src/modules/agent/services/verdict.service.ts',
  'src/database/tenant.extension.ts',
  'src/common/repositories/base.repository.ts',
  'src/common/validators/primitives.ts',
];

const summaryPath = path.resolve('coverage/coverage-summary.json');
let summary;
try {
  summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
} catch (error) {
  console.error(`Could not read ${summaryPath} — did the test run with --coverage?`);
  console.error(error.message);
  process.exit(1);
}

const failures = [];
const checked = [];

for (const [filePath, metrics] of Object.entries(summary)) {
  if (filePath === 'total') continue;
  const relative = path.relative(process.cwd(), filePath).replaceAll('\\', '/');

  const isCritical = CRITICAL_PATH_PREFIXES.some((prefix) => relative.startsWith(prefix));
  if (!isCritical) continue;

  const linePct = metrics.lines.pct;
  checked.push(relative);
  if (linePct < THRESHOLD_PCT) {
    failures.push(`${relative}: ${linePct}% line coverage (needs ${THRESHOLD_PCT}%)`);
  }
}

const uncoveredCriticalFiles = CRITICAL_PATH_PREFIXES.filter(
  (prefix) => !checked.some((file) => file.startsWith(prefix)),
);

if (uncoveredCriticalFiles.length > 0) {
  console.error('Critical path(s) with ZERO coverage data (not exercised by any test):');
  for (const file of uncoveredCriticalFiles) console.error(`  - ${file}`);
  failures.push(...uncoveredCriticalFiles.map((f) => `${f}: no coverage data`));
}

if (failures.length > 0) {
  console.error(`\nCoverage gate failed on ${failures.length} critical path(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Coverage gate passed — ${checked.length} critical file(s) all >= ${THRESHOLD_PCT}%.`);

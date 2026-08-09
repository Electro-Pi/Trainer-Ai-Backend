import type {
  OrganizationPerformanceResponseDto,
  TeamPerformanceResponseDto,
} from '../dto/analytics.dto.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function baseStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; margin: 0; }
    h1 { font-size: 16pt; margin: 0 0 4pt; }
    .subtitle { color: #5a5a5a; font-size: 9pt; margin-block-end: 16pt; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin-block-end: 18pt; }
    .summary-item { padding: 10pt; background: #f6f7f9; border-radius: 6pt; }
    .summary-item .label { font-size: 8pt; color: #5a5a5a; text-transform: uppercase; }
    .summary-item .value { font-size: 14pt; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-block-end: 16pt; }
    th, td { text-align: start; padding: 5pt 8pt; border-bottom: 1px solid #dcdcdc; }
    th { color: #5a5a5a; font-weight: 600; font-size: 8.5pt; text-transform: uppercase; }
    h2 { font-size: 11pt; margin-block: 12pt 6pt; }
  `;
}

function pct(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function num(value: number | null): string {
  return value === null ? '—' : String(Math.round(value));
}

export function renderTeamPerformanceHtml(data: TeamPerformanceResponseDto): string {
  const rows = data.learners
    .map(
      (l) => `
      <tr>
        <td>${escapeHtml(l.displayName)}</td>
        <td>${escapeHtml(l.trackNameEn ?? '—')}</td>
        <td>${escapeHtml(l.levelNameEn ?? '—')}</td>
        <td>${l.sessionsAttended}/${l.sessionsScheduled}</td>
        <td>${num(l.averageScore)}</td>
        <td>${l.outcomesAchieved}/${l.outcomesTotal}</td>
        <td>${l.status}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en" dir="ltr">
<head><meta charset="utf-8" /><title>Team Performance</title><style>${baseStyles()}</style></head>
<body>
  <h1>Team Performance Report</h1>
  <div class="subtitle">Team ${escapeHtml(data.teamId)} · Generated ${new Date().toISOString().slice(0, 10)}</div>
  <div class="summary-grid">
    <div class="summary-item"><div class="label">Learners</div><div class="value">${data.learnerCount}</div></div>
    <div class="summary-item"><div class="label">Average score</div><div class="value">${num(data.averageScore)}</div></div>
    <div class="summary-item"><div class="label">Outcome achievement</div><div class="value">${pct(data.outcomeAchievementRate)}</div></div>
  </div>
  <table>
    <thead><tr><th>Learner</th><th>Track</th><th>Level</th><th>Sessions</th><th>Avg score</th><th>Outcomes</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

export function renderOrganizationPerformanceHtml(
  data: OrganizationPerformanceResponseDto,
): string {
  const rows = data.teams
    .map(
      (t) => `
      <tr>
        <td>${escapeHtml(t.teamName)}</td>
        <td>${t.learnerCount}</td>
        <td>${num(t.averageScore)}</td>
        <td>${pct(t.outcomeAchievementRate)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en" dir="ltr">
<head><meta charset="utf-8" /><title>Organization Performance</title><style>${baseStyles()}</style></head>
<body>
  <h1>Organization Performance Report</h1>
  <div class="subtitle">Generated ${new Date().toISOString().slice(0, 10)}</div>
  <div class="summary-grid">
    <div class="summary-item"><div class="label">Teams</div><div class="value">${data.teamCount}</div></div>
    <div class="summary-item"><div class="label">Learners</div><div class="value">${data.learnerCount}</div></div>
    <div class="summary-item"><div class="label">Average score</div><div class="value">${num(data.averageScore)}</div></div>
    <div class="summary-item"><div class="label">Outcome achievement</div><div class="value">${pct(data.outcomeAchievementRate)}</div></div>
  </div>
  <h2>By team</h2>
  <table>
    <thead><tr><th>Team</th><th>Learners</th><th>Avg score</th><th>Outcome achievement</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

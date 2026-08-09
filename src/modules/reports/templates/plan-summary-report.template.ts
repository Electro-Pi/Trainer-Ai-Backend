import type { PlanSummaryReportData } from '../services/plan-summary-data.service.js';

type Language = 'EN' | 'AR';

const COPY = {
  EN: {
    title: 'Training Plan Summary Report',
    learner: 'Learner',
    manager: 'Manager',
    track: 'Track',
    level: 'Level',
    period: 'Plan period',
    summary: 'Summary',
    outcomesAchieved: 'Outcomes achieved',
    sessions: 'Sessions',
    sequence: '#',
    outcome: 'Outcome',
    date: 'Date',
    status: 'Status',
    verdict: 'Verdict',
    score: 'Score',
    verdicts: {
      ACHIEVED: 'Achieved',
      PARTIALLY_ACHIEVED: 'Partially achieved',
      NOT_ACHIEVED: 'Not achieved',
    },
  },
  AR: {
    title: 'تقرير ملخص الخطة التدريبية',
    learner: 'المتدرب',
    manager: 'المدير',
    track: 'المسار',
    level: 'المستوى',
    period: 'مدة الخطة',
    summary: 'ملخص',
    outcomesAchieved: 'المخرجات المحققة',
    sessions: 'الجلسات',
    sequence: '#',
    outcome: 'المخرج',
    date: 'التاريخ',
    status: 'الحالة',
    verdict: 'التقييم',
    score: 'الدرجة',
    verdicts: {
      ACHIEVED: 'محقَّق',
      PARTIALLY_ACHIEVED: 'محقَّق جزئياً',
      NOT_ACHIEVED: 'غير محقَّق',
    },
  },
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso: string, locale: Language): string {
  return new Date(iso).toLocaleDateString(locale === 'AR' ? 'ar-EG' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function verdictBadgeClass(verdict: string | null): string {
  if (verdict === 'ACHIEVED') return 'badge badge-achieved';
  if (verdict === 'PARTIALLY_ACHIEVED') return 'badge badge-partial';
  return 'badge badge-not-achieved';
}

function baseStyles(branding: PlanSummaryReportData['branding']): string {
  const accent = branding.primaryColor ?? '#1f5fb0';
  return `
    :root {
      --color-accent: ${accent};
      --color-text: #1a1a1a;
      --color-muted: #5a5a5a;
      --color-border: #dcdcdc;
      --color-bg-subtle: #f6f7f9;
      --color-achieved: #1a7f37;
      --color-achieved-bg: #eaf7ee;
      --color-partial: #9a6700;
      --color-partial-bg: #fff6e0;
      --color-not-achieved: #b3261e;
      --color-not-achieved-bg: #fbeaea;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      color: var(--color-text);
      font-size: 12pt;
      line-height: 1.6;
      margin: 0;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 3px solid var(--color-accent);
      padding-block-end: 12pt;
      margin-block-end: 16pt;
    }
    .header img { max-height: 48pt; }
    .header h1 { font-size: 16pt; margin: 0; color: var(--color-accent); }
    .org-name { font-size: 10pt; color: var(--color-muted); }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6pt 24pt;
      margin-block-end: 18pt;
      padding: 12pt;
      background: var(--color-bg-subtle);
      border-radius: 6pt;
    }
    .meta-item .label { font-size: 9pt; color: var(--color-muted); text-transform: uppercase; }
    .meta-item .value { font-size: 11pt; font-weight: 600; }
    section { margin-block-end: 18pt; }
    h2 {
      font-size: 12pt;
      color: var(--color-accent);
      border-inline-start: 4pt solid var(--color-accent);
      padding-inline-start: 8pt;
      margin-block-end: 8pt;
    }
    .stat-row { display: flex; gap: 24pt; }
    .stat { font-size: 11pt; }
    .stat .num { font-size: 20pt; font-weight: 700; color: var(--color-accent); }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    th, td {
      text-align: start;
      padding: 6pt 8pt;
      border-bottom: 1px solid var(--color-border);
    }
    th { color: var(--color-muted); font-weight: 600; font-size: 9pt; text-transform: uppercase; }
    .badge {
      display: inline-block;
      padding: 2pt 8pt;
      border-radius: 10pt;
      font-size: 9pt;
      font-weight: 600;
    }
    .badge-achieved { color: var(--color-achieved); background: var(--color-achieved-bg); }
    .badge-partial { color: var(--color-partial); background: var(--color-partial-bg); }
    .badge-not-achieved { color: var(--color-not-achieved); background: var(--color-not-achieved-bg); }
    .footer { margin-block-start: 24pt; padding-block-start: 8pt; border-top: 1px solid var(--color-border); font-size: 8pt; color: var(--color-muted); text-align: center; }
  `;
}

export function renderPlanSummaryReportHtml(
  data: PlanSummaryReportData,
  language: Language,
): string {
  const t = COPY[language];
  const dir = language === 'AR' ? 'rtl' : 'ltr';

  const sessionRows = data.sessions
    .map(
      (session) => `
      <tr>
        <td>${session.sequence}</td>
        <td>${escapeHtml(language === 'AR' ? session.outcomeTitleAr : session.outcomeTitleEn)}</td>
        <td>${formatDate(session.scheduledStart, language)}</td>
        <td>${escapeHtml(session.status)}</td>
        <td><span class="${verdictBadgeClass(session.verdict)}">${session.verdict ? t.verdicts[session.verdict] : '—'}</span></td>
        <td>${session.score ?? '—'}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="${language.toLowerCase()}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${t.title}</title>
<style>${baseStyles(data.branding)}</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${t.title}</h1>
      <div class="org-name">${escapeHtml(data.branding.organizationName)}</div>
    </div>
    ${data.branding.logoUrl ? `<img src="${escapeHtml(data.branding.logoUrl)}" alt="" />` : ''}
  </div>

  <div class="meta-grid">
    <div class="meta-item"><div class="label">${t.learner}</div><div class="value">${escapeHtml(data.learnerName)}</div></div>
    <div class="meta-item"><div class="label">${t.manager}</div><div class="value">${escapeHtml(data.managerName)}</div></div>
    <div class="meta-item"><div class="label">${t.track}</div><div class="value">${escapeHtml(language === 'AR' ? data.trackNameAr : data.trackNameEn)}</div></div>
    <div class="meta-item"><div class="label">${t.level}</div><div class="value">${escapeHtml(language === 'AR' ? data.levelNameAr : data.levelNameEn)}</div></div>
    <div class="meta-item"><div class="label">${t.period}</div><div class="value">${formatDate(data.startDate, language)} – ${formatDate(data.endDate, language)}</div></div>
  </div>

  <section>
    <h2>${t.summary}</h2>
    <div class="stat-row">
      <div class="stat"><div class="num">${data.achievedCount}/${data.totalCount}</div>${t.outcomesAchieved}</div>
    </div>
  </section>

  <section>
    <h2>${t.sessions}</h2>
    <table>
      <thead><tr><th>${t.sequence}</th><th>${t.outcome}</th><th>${t.date}</th><th>${t.status}</th><th>${t.verdict}</th><th>${t.score}</th></tr></thead>
      <tbody>${sessionRows}</tbody>
    </table>
  </section>

  <div class="footer">${escapeHtml(data.branding.organizationName)} · ${t.title}</div>
</body>
</html>`;
}

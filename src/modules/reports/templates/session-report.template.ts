import type { SessionReportData } from '../services/report-data.service.js';

type Language = 'EN' | 'AR';

const COPY = {
  EN: {
    title: 'Training Session Report',
    learner: 'Learner',
    manager: 'Manager',
    track: 'Track',
    level: 'Level',
    date: 'Session date',
    overallVerdict: 'Overall verdict',
    overallScore: 'Overall score',
    outcomes: 'Outcomes covered',
    outcome: 'Outcome',
    verdict: 'Verdict',
    score: 'Score',
    carriedOver: 'Carried over',
    newOutcome: 'New',
    content: 'Content covered',
    contentTitle: 'Title',
    contentType: 'Type',
    delivered: 'Delivered',
    notDelivered: 'Not delivered',
    strengths: 'Strengths',
    gaps: 'Gaps',
    notes: 'Agent notes',
    questionsAnswered: 'Questions answered',
    summary: 'Summary',
    areasForImprovement: 'Areas for improvement',
    questionBreakdown: 'Question breakdown',
    yourAnswer: 'Your answer',
    feedback: 'Feedback',
    correct: 'Correct',
    incorrect: 'Needs work',
    readiness: 'Readiness',
    readinessLevels: {
      ready: 'Ready',
      needs_practice: 'Needs practice',
      not_ready: 'Not ready',
    },
    riskAreas: 'Risk areas',
    outcomeCoverage: 'Outcome coverage',
    verdicts: {
      ACHIEVED: 'Achieved',
      PARTIALLY_ACHIEVED: 'Partially achieved',
      NOT_ACHIEVED: 'Not achieved',
    },
  },
  AR: {
    title: 'تقرير جلسة تدريبية',
    learner: 'المتدرب',
    manager: 'المدير',
    track: 'المسار',
    level: 'المستوى',
    date: 'تاريخ الجلسة',
    overallVerdict: 'التقييم العام',
    overallScore: 'الدرجة الإجمالية',
    outcomes: 'المخرجات المستهدفة',
    outcome: 'المخرج',
    verdict: 'التقييم',
    score: 'الدرجة',
    carriedOver: 'مرحّل من جلسة سابقة',
    newOutcome: 'جديد',
    content: 'المحتوى المقدم',
    contentTitle: 'العنوان',
    contentType: 'النوع',
    delivered: 'تم تقديمه',
    notDelivered: 'لم يُقدَّم',
    strengths: 'نقاط القوة',
    gaps: 'نقاط الضعف',
    notes: 'ملاحظات المدرب الذكي',
    questionsAnswered: 'عدد الأسئلة المجابة',
    summary: 'الملخص',
    areasForImprovement: 'مجالات التحسين',
    questionBreakdown: 'تفصيل الأسئلة',
    yourAnswer: 'إجابتك',
    feedback: 'الملاحظات',
    correct: 'صحيحة',
    incorrect: 'تحتاج تحسين',
    readiness: 'مستوى الجاهزية',
    readinessLevels: {
      ready: 'جاهز',
      needs_practice: 'يحتاج تدريب إضافي',
      not_ready: 'غير جاهز',
    },
    riskAreas: 'مجالات الخطورة',
    outcomeCoverage: 'تغطية المخرجات',
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

/** Verdict is never conveyed by color alone — always paired with the localized label text. */
function verdictBadgeClass(verdict: string | null): string {
  if (verdict === 'ACHIEVED') return 'badge badge-achieved';
  if (verdict === 'PARTIALLY_ACHIEVED') return 'badge badge-partial';
  return 'badge badge-not-achieved';
}

/**
 * `RP-03` — logical CSS properties (`margin-inline`, `text-align: start`) so
 * the layout mirrors correctly under `dir="rtl"` without a second stylesheet.
 * Font stack relies on the renderer host's installed fonts (`Tahoma`/`Segoe
 * UI` on Windows render Arabic correctly, live-verified) rather than a
 * bundled webfont — production Linux containers need an Arabic-capable font
 * package installed (e.g. `fonts-noto`), flagged for the deploy runbook (P12).
 */
// Brand tokens mirrored from Trainer-Ai's `styles/landing.css` light theme —
// kept in sync manually since the PDF renderer runs outside the app and
// can't consume its CSS variables. `branding.primaryColor` (per-org override)
// still wins when an organization has customized it.
function baseStyles(branding: SessionReportData['branding']): string {
  const accent = branding.primaryColor ?? '#172378';
  return `
    :root {
      --color-accent: ${accent};
      --color-accent-soft: #EEF0FB;
      --color-text: #1D252C;
      --color-muted: #66717A;
      --color-border: #D9E1E8;
      --color-bg-subtle: #F3F5F8;
      --color-achieved: #1A7F37;
      --color-achieved-bg: #EAF7EE;
      --color-partial: #9A6700;
      --color-partial-bg: #FFF6E0;
      --color-not-achieved: #B3261E;
      --color-not-achieved-bg: #FBEAEA;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'IBM Plex Sans', 'Segoe UI', Tahoma, Arial, sans-serif;
      color: var(--color-text);
      font-size: 12pt;
      line-height: 1.6;
      margin: 0;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--color-accent);
      padding: 20pt 28pt;
      margin-block-end: 20pt;
    }
    .header img { max-height: 40pt; }
    .header h1 { font-size: 15pt; margin: 0 0 3pt; color: #FFFFFF; font-weight: 600; }
    .org-name { font-size: 9pt; color: rgba(255,255,255,.75); letter-spacing: .04em; }
    .body-inset { padding: 0 28pt; }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6pt 24pt;
      margin-block-end: 18pt;
      padding: 14pt 16pt;
      background: var(--color-bg-subtle);
      border: 1px solid var(--color-border);
      border-radius: 10pt;
    }
    .meta-item .label { font-size: 8.5pt; color: var(--color-muted); text-transform: uppercase; letter-spacing: .04em; }
    .meta-item .value { font-size: 11pt; font-weight: 600; color: var(--color-text); }
    section { margin-block-end: 18pt; }
    h2 {
      font-size: 11.5pt;
      font-weight: 600;
      color: var(--color-accent);
      border-inline-start: 4pt solid var(--color-accent);
      padding-inline-start: 8pt;
      margin-block-end: 8pt;
    }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    th, td {
      text-align: start;
      padding: 7pt 8pt;
      border-bottom: 1px solid var(--color-border);
    }
    th { color: var(--color-muted); font-weight: 600; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .03em; }
    .badge {
      display: inline-block;
      padding: 2pt 9pt;
      border-radius: 999pt;
      font-size: 8.5pt;
      font-weight: 600;
    }
    .badge-achieved { color: var(--color-achieved); background: var(--color-achieved-bg); }
    .badge-partial { color: var(--color-partial); background: var(--color-partial-bg); }
    .badge-not-achieved { color: var(--color-not-achieved); background: var(--color-not-achieved-bg); }
    .prose { white-space: pre-wrap; font-size: 10.5pt; }
    .qa { padding: 10pt 12pt; border: 1px solid var(--color-border); border-radius: 8pt; background: var(--color-accent-soft); margin-block-end: 8pt; }
    .qa:last-child { margin-block-end: 0; }
    .qa .q { font-size: 10.5pt; font-weight: 600; margin-block-end: 4pt; color: var(--color-text); }
    .qa .a { font-size: 10pt; color: var(--color-muted); margin-block-end: 4pt; }
    .qa .fb { font-size: 10pt; }
    ul.plain { margin: 0; padding-inline-start: 18pt; font-size: 10.5pt; }
    ul.plain li { margin-block-end: 4pt; }
    .footer { margin: 24pt 28pt 0; padding-block-start: 10pt; border-top: 1px solid var(--color-border); font-size: 8pt; color: var(--color-muted); text-align: center; }
  `;
}

function listOrDash(items: string[]): string {
  if (items.length === 0) return '<div class="prose">—</div>';
  return `<ul class="plain">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

export function renderSessionReportHtml(
  data: SessionReportData,
  language: Language,
  recipientRole: 'LEARNER' | 'DEPARTMENT_MANAGER',
): string {
  const t = COPY[language];
  const dir = language === 'AR' ? 'rtl' : 'ltr';

  const outcomeRows = data.outcomes
    .map(
      (outcome) => `
      <tr>
        <td>${escapeHtml(language === 'AR' ? outcome.titleAr : outcome.titleEn)}</td>
        <td><span class="${verdictBadgeClass(outcome.verdict)}">${outcome.verdict ? t.verdicts[outcome.verdict] : '—'}</span></td>
        <td>${outcome.score ?? '—'}</td>
        <td>${outcome.isCarriedOver ? t.carriedOver : t.newOutcome}</td>
      </tr>`,
    )
    .join('');

  const contentRows = data.content
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${item.delivered ? t.delivered : t.notDelivered}</td>
      </tr>`,
    )
    .join('');

  // Manager reports get `managerEvaluation` (readiness/risk-toned feedback,
  // `readiness`/`risk_areas`) when the AI Trainer has one; learner reports
  // get `traineeEvaluation` (coaching-toned). Either falls back to the plain
  // `strengths`/`gaps`/`agentNotes` fields when the AI Trainer evaluation
  // isn't available for this session yet.
  const evaluationSectionsHtml =
    recipientRole === 'DEPARTMENT_MANAGER' && data.managerEvaluation
      ? renderManagerEvaluationSections(data.managerEvaluation, t, language)
      : recipientRole === 'LEARNER' && data.traineeEvaluation
        ? renderTraineeEvaluationSections(data.traineeEvaluation, t, language)
        : renderPlainNotesSections(data, t);

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

  <div class="body-inset">
  <div class="meta-grid">
    <div class="meta-item"><div class="label">${t.learner}</div><div class="value">${escapeHtml(data.learnerName)}</div></div>
    <div class="meta-item"><div class="label">${t.manager}</div><div class="value">${escapeHtml(data.managerName)}</div></div>
    <div class="meta-item"><div class="label">${t.track}</div><div class="value">${escapeHtml(language === 'AR' ? data.trackNameAr : data.trackNameEn)}</div></div>
    <div class="meta-item"><div class="label">${t.level}</div><div class="value">${escapeHtml(language === 'AR' ? data.levelNameAr : data.levelNameEn)}</div></div>
    <div class="meta-item"><div class="label">${t.date}</div><div class="value">${formatDate(data.sessionDate, language)}</div></div>
    <div class="meta-item"><div class="label">${t.overallScore}</div><div class="value">${data.overallScore}</div></div>
  </div>

  <section>
    <h2>${t.overallVerdict}</h2>
    <span class="${verdictBadgeClass(data.overallVerdict)}">${t.verdicts[data.overallVerdict]}</span>
  </section>

  <section>
    <h2>${t.outcomes}</h2>
    <table>
      <thead><tr><th>${t.outcome}</th><th>${t.verdict}</th><th>${t.score}</th><th></th></tr></thead>
      <tbody>${outcomeRows}</tbody>
    </table>
  </section>

  <section>
    <h2>${t.content}</h2>
    <table>
      <thead><tr><th>${t.contentTitle}</th><th></th></tr></thead>
      <tbody>${contentRows}</tbody>
    </table>
  </section>

  ${evaluationSectionsHtml}
  </div>

  <div class="footer">${escapeHtml(data.branding.organizationName)} · ${t.title}</div>
</body>
</html>`;
}

type Copy = typeof COPY.EN | typeof COPY.AR;

function renderPlainNotesSections(data: SessionReportData, t: Copy): string {
  return `
  <section>
    <h2>${t.strengths}</h2>
    <div class="prose">${escapeHtml(data.strengths || '—')}</div>
  </section>

  <section>
    <h2>${t.gaps}</h2>
    <div class="prose">${escapeHtml(data.gaps || '—')}</div>
  </section>

  <section>
    <h2>${t.notes}</h2>
    <div class="prose">${escapeHtml(data.agentNotes || '—')}</div>
    <div class="prose" style="margin-block-start: 6pt; color: var(--color-muted);">${t.questionsAnswered}: ${data.answerCount}</div>
  </section>`;
}

function renderTraineeEvaluationSections(
  evaluation: NonNullable<SessionReportData['traineeEvaluation']>,
  t: Copy,
  _language: Language,
): string {
  const questionRows = evaluation.questions
    .map(
      (q) => `
      <div class="qa">
        <div class="q">${escapeHtml(q.question_text)}</div>
        <div class="a">${t.yourAnswer}: ${escapeHtml(q.trainee_answer_text)}</div>
        <div class="fb"><span class="${q.is_correct ? 'badge badge-achieved' : 'badge badge-not-achieved'}">${q.is_correct ? t.correct : t.incorrect}</span> ${escapeHtml(q.ai_feedback)}</div>
      </div>`,
    )
    .join('');

  return `
  <section>
    <h2>${t.summary}</h2>
    <div class="prose">${escapeHtml(evaluation.summary_feedback)}</div>
  </section>

  <section>
    <h2>${t.strengths}</h2>
    ${listOrDash(evaluation.strengths)}
  </section>

  <section>
    <h2>${t.areasForImprovement}</h2>
    ${listOrDash(evaluation.areas_for_improvement)}
  </section>

  <section>
    <h2>${t.questionBreakdown}</h2>
    ${questionRows || '<div class="prose">—</div>'}
  </section>`;
}

function renderManagerEvaluationSections(
  evaluation: NonNullable<SessionReportData['managerEvaluation']>,
  t: Copy,
  _language: Language,
): string {
  const questionRows = evaluation.questions
    .map(
      (q) => `
      <div class="qa">
        <div class="q">${escapeHtml(q.question_text)}</div>
        <div class="a">${t.yourAnswer}: ${escapeHtml(q.trainee_answer_text)}</div>
        <div class="fb"><span class="${q.is_correct ? 'badge badge-achieved' : 'badge badge-not-achieved'}">${q.is_correct ? t.correct : t.incorrect}</span> ${escapeHtml(q.manager_feedback)}</div>
      </div>`,
    )
    .join('');

  return `
  <section>
    <h2>${t.readiness}</h2>
    <div class="prose">${t.readinessLevels[evaluation.readiness]}</div>
  </section>

  <section>
    <h2>${t.riskAreas}</h2>
    ${listOrDash(evaluation.risk_areas)}
  </section>

  <section>
    <h2>${t.outcomeCoverage}</h2>
    <div class="prose">${escapeHtml(evaluation.outcome_coverage_comparison)}</div>
  </section>

  <section>
    <h2>${t.questionBreakdown}</h2>
    ${questionRows || '<div class="prose">—</div>'}
  </section>`;
}

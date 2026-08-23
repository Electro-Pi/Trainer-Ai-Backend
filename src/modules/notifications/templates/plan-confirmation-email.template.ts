type Language = 'EN' | 'AR';

const COPY = {
  EN: {
    subject: () => 'Your training plan is confirmed',
    preheader: (count: number) => `${count} session${count === 1 ? '' : 's'} scheduled.`,
    greeting: (learnerName: string) => `Hi ${learnerName},`,
    body: () =>
      'Your training plan has been scheduled. Here’s every session — each also has its own calendar invite in your Outlook mailbox.',
    sessionLabel: (n: number) => `Session ${n}`,
    dateLabel: 'Date',
    timeLabel: 'Time',
    durationLabel: 'Duration',
    minutes: (n: number) => `${n} minutes`,
    calendarNote:
      'Calendar invitations for every session above have also been sent to your Outlook mailbox.',
    signOff: 'This is an automated message from MODRB — please don’t reply to this email.',
  },
  AR: {
    subject: () => 'تم تأكيد خطتك التدريبية',
    preheader: (count: number) => `تم جدولة ${count} جلسة.`,
    greeting: (learnerName: string) => `مرحباً ${learnerName}،`,
    body: () =>
      'تم جدولة خطتك التدريبية. فيما يلي جميع الجلسات — كل جلسة لها أيضاً دعوة تقويم خاصة بها في بريدك على Outlook.',
    sessionLabel: (n: number) => `الجلسة ${n}`,
    dateLabel: 'التاريخ',
    timeLabel: 'الوقت',
    durationLabel: 'المدة',
    minutes: (n: number) => `${n} دقيقة`,
    calendarNote:
      'تم أيضاً إرسال دعوات التقويم لجميع الجلسات أعلاه إلى بريدك الإلكتروني على Outlook.',
    signOff: 'هذه رسالة آلية من منصة MODRB — يرجى عدم الرد على هذا البريد.',
  },
} as const;

// Brand tokens mirrored from session-confirmation-email.template.ts — email
// clients can't read the app's CSS vars, so values are inlined the same way.
const BRAND = {
  primary: '#172378',
  primary700: '#0D164F',
  primaryTint: '#EEF0FA',
  bg: '#F7F8FC',
  card: '#FFFFFF',
  ink: '#1D252C',
  ink2: '#66717A',
  line: '#D8DDEE',
  font: "'IBM Plex Sans','Segoe UI',Tahoma,Arial,sans-serif",
};

export type PlanConfirmationSessionRow = {
  skillName: string;
  outcomeTitle: string;
  date: string;
  time: string;
  durationMinutes: number;
};

export function renderPlanConfirmationEmailHtml(params: {
  learnerName: string;
  sessions: PlanConfirmationSessionRow[];
  language: Language;
}): string {
  const t = COPY[params.language];
  const dir = params.language === 'AR' ? 'rtl' : 'ltr';
  const align = dir === 'rtl' ? 'right' : 'left';

  const sessionRows = params.sessions
    .map(
      (s, i) => `
                <tr>
                  <td style="padding:16px 0;border-top:1px solid ${BRAND.line};">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:0 0 6px;font-size:13px;font-weight:700;color:${BRAND.ink};">${t.sessionLabel(i + 1)} — ${s.skillName}</td>
                      </tr>
                      <tr>
                        <td style="padding:0 0 8px;font-size:12.5px;color:${BRAND.ink2};">${s.outcomeTitle}</td>
                      </tr>
                      <tr>
                        <td style="padding:2px 0;font-size:13px;color:${BRAND.primary700};"><strong>${t.dateLabel}:</strong> ${s.date} &nbsp;·&nbsp; <strong>${t.timeLabel}:</strong> ${s.time} &nbsp;·&nbsp; <strong>${t.durationLabel}:</strong> ${t.minutes(s.durationMinutes)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="${params.language.toLowerCase()}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${t.subject()}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:${BRAND.font};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${t.preheader(params.sessions.length)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:32px 36px 0;text-align:${align};">
              <span style="font-family:${BRAND.font};font-weight:700;font-size:22px;letter-spacing:.14em;color:${BRAND.primary};">MODRB</span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 36px 8px;text-align:${align};">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.ink};">${t.greeting(params.learnerName)}</p>
              <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${BRAND.ink};">${t.body()}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 36px 8px;text-align:${align};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${sessionRows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px;background:${BRAND.primaryTint};text-align:${align};margin-top:12px;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.primary700};">${t.calendarNote}</p>
            </td>
          </tr>
        </table>
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
          <tr>
            <td style="padding:20px 36px 0;text-align:${align};">
              <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.ink2};">${t.signOff}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function planConfirmationEmailSubject(language: Language): string {
  return COPY[language].subject();
}

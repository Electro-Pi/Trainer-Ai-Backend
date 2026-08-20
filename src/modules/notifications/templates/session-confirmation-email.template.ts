type Language = 'EN' | 'AR';

const COPY = {
  EN: {
    subject: (skillName: string) => `Your training session is confirmed — ${skillName}`,
    preheader: (date: string, time: string) => `Confirmed for ${date} at ${time}.`,
    greeting: (learnerName: string) => `Hi ${learnerName},`,
    body: (skillName: string, outcomeTitle: string) =>
      `Your training session on <strong>${skillName}</strong> has been scheduled.<br/>Focus outcome: <strong>${outcomeTitle}</strong>.`,
    dateLabel: 'Date',
    timeLabel: 'Time',
    durationLabel: 'Duration',
    minutes: (n: number) => `${n} minutes`,
    cta: 'Join meeting',
    fallback: "If the button doesn't work, copy and paste this link into your browser:",
    calendarNote:
      'A calendar invitation for this session has also been sent to your Outlook mailbox.',
    signOff: 'This is an automated message from MODRB — please don’t reply to this email.',
  },
  AR: {
    subject: (skillName: string) => `تم تأكيد جلستك التدريبية — ${skillName}`,
    preheader: (date: string, time: string) => `تم التأكيد في ${date} الساعة ${time}.`,
    greeting: (learnerName: string) => `مرحباً ${learnerName}،`,
    body: (skillName: string, outcomeTitle: string) =>
      `تم جدولة جلستك التدريبية على <strong>${skillName}</strong>.<br/>الهدف من الجلسة: <strong>${outcomeTitle}</strong>.`,
    dateLabel: 'التاريخ',
    timeLabel: 'الوقت',
    durationLabel: 'المدة',
    minutes: (n: number) => `${n} دقيقة`,
    cta: 'الانضمام إلى الاجتماع',
    fallback: 'إذا لم يعمل الزر، انسخ الرابط التالي والصقه في متصفحك:',
    calendarNote: 'تم أيضاً إرسال دعوة تقويم لهذه الجلسة إلى بريدك الإلكتروني على Outlook.',
    signOff: 'هذه رسالة آلية من منصة MODRB — يرجى عدم الرد على هذا البريد.',
  },
} as const;

// Brand tokens mirrored from Trainer-Ai/styles/portal.css (light theme),
// kept identical to invite-email.template.ts — email clients can't read the
// app's CSS vars, so values are inlined the same way here.
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

export function renderSessionConfirmationEmailHtml(params: {
  learnerName: string;
  skillName: string;
  outcomeTitle: string;
  date: string;
  time: string;
  durationMinutes: number;
  joinUrl: string;
  language: Language;
}): string {
  const t = COPY[params.language];
  const dir = params.language === 'AR' ? 'rtl' : 'ltr';
  const align = dir === 'rtl' ? 'right' : 'left';

  return `<!doctype html>
<html lang="${params.language.toLowerCase()}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${t.subject(params.skillName)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:${BRAND.font};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${t.preheader(params.date, params.time)}</div>
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
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.ink};">${t.body(params.skillName, params.outcomeTitle)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 36px 24px;text-align:${align};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.primaryTint};border-radius:10px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:4px 0;font-size:13px;color:${BRAND.primary700};"><strong>${t.dateLabel}:</strong> ${params.date}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;font-size:13px;color:${BRAND.primary700};"><strong>${t.timeLabel}:</strong> ${params.time}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;font-size:13px;color:${BRAND.primary700};"><strong>${t.durationLabel}:</strong> ${t.minutes(params.durationMinutes)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 36px 28px;text-align:${align};">
              <a href="${params.joinUrl}" style="display:inline-block;padding:12px 28px;background:${BRAND.primary};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:9px;">${t.cta}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 36px 28px;text-align:${align};">
              <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${BRAND.ink2};">${t.fallback}</p>
              <p style="margin:0;font-size:12px;line-height:1.6;word-break:break-all;">
                <a href="${params.joinUrl}" style="color:${BRAND.primary};text-decoration:underline;">${params.joinUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px;background:${BRAND.primaryTint};text-align:${align};">
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

export function sessionConfirmationEmailSubject(skillName: string, language: Language): string {
  return COPY[language].subject(skillName);
}

type Language = 'EN' | 'AR';

const COPY = {
  EN: {
    subject: 'Your training session report is ready',
    preheader: 'Your training session report is ready to view.',
    greeting: (name: string) => `Hi ${name},`,
    body: 'Your training session report is ready — the full breakdown, including outcomes and feedback, is attached as a PDF.',
    cta: 'View attached report',
    signOff: 'This is an automated message from MODRB. Please don’t reply to this email.',
  },
  AR: {
    subject: 'تقرير جلستك التدريبية جاهز',
    preheader: 'تقرير جلستك التدريبية جاهز للاطلاع عليه.',
    greeting: (name: string) => `مرحباً ${name}،`,
    body: 'تقرير جلستك التدريبية جاهز — التفاصيل الكاملة، بما في ذلك المخرجات والملاحظات، مرفقة بصيغة PDF.',
    cta: 'عرض التقرير المرفق',
    signOff: 'هذه رسالة آلية من منصة MODRB. برجاء عدم الرد على هذا البريد.',
  },
} as const;

// Brand tokens mirrored from Trainer-Ai's `styles/landing.css` light theme —
// keep in sync manually since email HTML can't consume the app's CSS
// variables (most mail clients strip <style>/custom-property support).
const BRAND = {
  accent: '#172378',
  accentSoft: '#EEF0FB',
  text: '#1D252C',
  muted: '#66717A',
  divider: '#D9E1E8',
  surface: '#FFFFFF',
  bg: '#F3F5F8',
  fontStack: "'IBM Plex Sans', 'Segoe UI', Tahoma, Arial, sans-serif",
};

export function renderReportEmailHtml(recipientName: string, language: Language): string {
  const t = COPY[language];
  const dir = language === 'AR' ? 'rtl' : 'ltr';
  const align = language === 'AR' ? 'right' : 'left';

  return `<!doctype html>
<html lang="${language.toLowerCase()}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${t.subject}</title>
</head>
<body style="margin:0; padding:0; background:${BRAND.bg}; font-family:${BRAND.fontStack};">
  <span style="display:none; max-height:0; overflow:hidden; opacity:0;">${t.preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg}; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background:${BRAND.surface}; border-radius:16px; overflow:hidden; border:1px solid ${BRAND.divider};">
          <tr>
            <td style="background:${BRAND.accent}; padding:28px 32px;">
              <span style="font-family:${BRAND.fontStack}; font-weight:600; font-size:19px; letter-spacing:.22em; color:#FFFFFF;">MODRB</span>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 8px; text-align:${align};">
              <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:${BRAND.text};">${t.greeting(recipientName)}</p>
              <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:${BRAND.text};">${t.body}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px; text-align:${align};">
              <table role="presentation" cellpadding="0" cellspacing="0" style="border-radius:10px; background:${BRAND.accentSoft}; border:1px solid ${BRAND.divider};">
                <tr>
                  <td style="padding:14px 20px; font-family:${BRAND.fontStack}; font-weight:600; font-size:13px; color:${BRAND.accent};">
                    &#128206; ${t.cta}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px; border-top:1px solid ${BRAND.divider}; text-align:${align};">
              <p style="margin:0; font-size:11.5px; line-height:1.6; color:${BRAND.muted};">${t.signOff}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function reportEmailSubject(language: Language): string {
  return COPY[language].subject;
}

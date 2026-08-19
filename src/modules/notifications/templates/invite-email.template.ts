type Language = 'EN' | 'AR';
type InviteRole = 'DEPARTMENT_MANAGER' | 'CONTENT_CREATOR';

const ROLE_LABEL: Record<Language, Record<InviteRole, string>> = {
  EN: { DEPARTMENT_MANAGER: 'Department Manager', CONTENT_CREATOR: 'Content Creator' },
  AR: { DEPARTMENT_MANAGER: 'مدير قسم', CONTENT_CREATOR: 'منشئ محتوى' },
};

const COPY = {
  EN: {
    subject: (org: string) => `You're invited to join ${org} on MODRB`,
    preheader: (org: string) => `${org} invited you to join their MODRB training portal.`,
    greeting: 'Hi,',
    body: (org: string, role: string) =>
      `<strong>${org}</strong> has invited you to join their MODRB training portal as a <strong>${role}</strong>.`,
    cta: 'Accept invitation',
    fallback: "If the button doesn't work, copy and paste this link into your browser:",
    expiry: 'This invitation expires in 7 days.',
    signOff: 'This is an automated message from MODRB — please don’t reply to this email.',
  },
  AR: {
    subject: (org: string) => `تمت دعوتك للانضمام إلى ${org} على منصة MODRB`,
    preheader: (org: string) => `دعتك ${org} للانضمام إلى بوابة التدريب MODRB.`,
    greeting: 'مرحباً،',
    body: (org: string, role: string) =>
      `دعتك <strong>${org}</strong> للانضمام إلى بوابة التدريب MODRB بصفة <strong>${role}</strong>.`,
    cta: 'قبول الدعوة',
    fallback: 'إذا لم يعمل الزر، انسخ الرابط التالي والصقه في متصفحك:',
    expiry: 'تنتهي صلاحية هذه الدعوة خلال 7 أيام.',
    signOff: 'هذه رسالة آلية من منصة MODRB — يرجى عدم الرد على هذا البريد.',
  },
} as const;

// Brand tokens mirrored from Trainer-Ai/styles/portal.css (light theme) —
// email clients can't read the app's CSS vars, so values are inlined.
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

export function renderInviteEmailHtml(params: {
  organizationName: string;
  role: InviteRole;
  acceptUrl: string;
  language: Language;
}): string {
  const t = COPY[params.language];
  const dir = params.language === 'AR' ? 'rtl' : 'ltr';
  const align = dir === 'rtl' ? 'right' : 'left';
  const roleLabel = ROLE_LABEL[params.language][params.role];

  return `<!doctype html>
<html lang="${params.language.toLowerCase()}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${t.subject(params.organizationName)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:${BRAND.font};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${t.preheader(params.organizationName)}</div>
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
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.ink};">${t.greeting}</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.ink};">${t.body(params.organizationName, roleLabel)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 36px 28px;text-align:${align};">
              <a href="${params.acceptUrl}" style="display:inline-block;padding:12px 28px;background:${BRAND.primary};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:9px;">${t.cta}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 36px 28px;text-align:${align};">
              <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${BRAND.ink2};">${t.fallback}</p>
              <p style="margin:0;font-size:12px;line-height:1.6;word-break:break-all;">
                <a href="${params.acceptUrl}" style="color:${BRAND.primary};text-decoration:underline;">${params.acceptUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px;background:${BRAND.primaryTint};text-align:${align};">
              <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.primary700};">${t.expiry}</p>
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

export function inviteEmailSubject(organizationName: string, language: Language): string {
  return COPY[language].subject(organizationName);
}

type Language = 'EN' | 'AR';
type InviteRole = 'DEPARTMENT_MANAGER' | 'CONTENT_CREATOR';

const ROLE_LABEL: Record<Language, Record<InviteRole, string>> = {
  EN: { DEPARTMENT_MANAGER: 'Department Manager', CONTENT_CREATOR: 'Content Creator' },
  AR: { DEPARTMENT_MANAGER: 'مدير قسم', CONTENT_CREATOR: 'منشئ محتوى' },
};

const COPY = {
  EN: {
    subject: (org: string) => `You're invited to join ${org} on MODRB`,
    greeting: 'Hi,',
    body: (org: string, role: string) =>
      `${org} has invited you to join their MODRB training portal as a <strong>${role}</strong>.`,
    cta: 'Accept invitation',
    expiry: 'This invitation expires in 7 days.',
    signOff: 'This is an automated message from MODRB.',
  },
  AR: {
    subject: (org: string) => `تمت دعوتك للانضمام إلى ${org} على منصة MODRB`,
    greeting: 'مرحباً،',
    body: (org: string, role: string) =>
      `دعتك ${org} للانضمام إلى بوابة التدريب MODRB بصفة <strong>${role}</strong>.`,
    cta: 'قبول الدعوة',
    expiry: 'تنتهي صلاحية هذه الدعوة خلال 7 أيام.',
    signOff: 'هذه رسالة آلية من منصة MODRB.',
  },
} as const;

export function renderInviteEmailHtml(params: {
  organizationName: string;
  role: InviteRole;
  acceptUrl: string;
  language: Language;
}): string {
  const t = COPY[params.language];
  const dir = params.language === 'AR' ? 'rtl' : 'ltr';
  const roleLabel = ROLE_LABEL[params.language][params.role];

  return `<!doctype html>
<html lang="${params.language.toLowerCase()}" dir="${dir}">
<head><meta charset="utf-8" /></head>
<body style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #1a1a1a;">
  <p>${t.greeting}</p>
  <p>${t.body(params.organizationName, roleLabel)}</p>
  <p><a href="${params.acceptUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">${t.cta}</a></p>
  <p style="color: #5a5a5a; font-size: 9pt;">${t.expiry}</p>
  <p style="color: #5a5a5a; font-size: 9pt;">${t.signOff}</p>
</body>
</html>`;
}

export function inviteEmailSubject(organizationName: string, language: Language): string {
  return COPY[language].subject(organizationName);
}

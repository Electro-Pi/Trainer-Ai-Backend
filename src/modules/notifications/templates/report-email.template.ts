type Language = 'EN' | 'AR';

const COPY = {
  EN: {
    subject: 'Your training session report is ready',
    greeting: (name: string) => `Hi ${name},`,
    body: 'A new training session report is attached as a PDF.',
    signOff: 'This is an automated message from MODRB.',
  },
  AR: {
    subject: 'تقرير جلستك التدريبية جاهز',
    greeting: (name: string) => `مرحباً ${name}،`,
    body: 'تقرير الجلسة التدريبية الجديد مرفق بصيغة PDF.',
    signOff: 'هذه رسالة آلية من منصة MODRB.',
  },
} as const;

export function renderReportEmailHtml(recipientName: string, language: Language): string {
  const t = COPY[language];
  const dir = language === 'AR' ? 'rtl' : 'ltr';
  return `<!doctype html>
<html lang="${language.toLowerCase()}" dir="${dir}">
<head><meta charset="utf-8" /></head>
<body style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #1a1a1a;">
  <p>${t.greeting(recipientName)}</p>
  <p>${t.body}</p>
  <p style="color: #5a5a5a; font-size: 9pt;">${t.signOff}</p>
</body>
</html>`;
}

export function reportEmailSubject(language: Language): string {
  return COPY[language].subject;
}

import type { I18nDictionary } from './en.js';

export const ar: I18nDictionary = {
  errors: {
    validationFailed: {
      title: 'فشل التحقق من صحة البيانات',
      detail: 'فشل التحقق من صحة حقل واحد أو أكثر.',
    },
    unauthorized: {
      title: 'غير مصرح',
      detail: 'يلزم تسجيل الدخول للوصول إلى هذا المورد.',
    },
    forbidden: {
      title: 'ممنوع',
      detail: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
    },
    notFound: {
      title: 'غير موجود',
      detail: 'تعذر العثور على المورد المطلوب.',
    },
    conflict: {
      title: 'تعارض',
      detail: 'تعذر إكمال الطلب بسبب تعارض في البيانات.',
    },
    rateLimited: {
      title: 'طلبات كثيرة جدًا',
      detail: 'لقد قمت بإرسال عدد كبير جدًا من الطلبات. حاول مرة أخرى لاحقًا.',
    },
    externalService: {
      title: 'خطأ في خدمة خارجية',
      detail: 'إحدى الخدمات التي يعتمد عليها هذا النظام غير متاحة حاليًا.',
    },
    internal: {
      title: 'خطأ في الخادم الداخلي',
      detail: 'حدث خطأ غير متوقع. حاول مرة أخرى لاحقًا.',
    },
  },
  health: {
    ok: 'الخدمة تعمل بشكل سليم',
    notReady: 'الخدمة غير جاهزة',
  },
};

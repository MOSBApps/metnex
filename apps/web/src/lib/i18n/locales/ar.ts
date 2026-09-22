import type { tr } from './tr'

export const ar: typeof tr = {
  common: {
    welcome: 'أهلاً بك',
    search: 'بحث...',
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    edit: 'تعديل',
    loading: 'جارٍ التحميل...',
    language: 'اللغة',
    selectLanguage: 'اختر اللغة',
  },
  nav: {
    dashboard: 'لوحة التحكم',
    system: 'إدارة العقود',
    tenants: 'المستأجرون',
    users: 'المستخدمون',
    roles: 'الأدوار',
    audit: 'سجل التدقيق',
    settings: 'الإعدادات',
  },
  auth: {
    login: 'تسجيل الدخول',
    logout: 'تسجيل الخروج',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    mfaCode: 'رمز المصادقة',
  },
}

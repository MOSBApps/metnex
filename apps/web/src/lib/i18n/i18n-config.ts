export type TextDirection = 'ltr' | 'rtl'

export interface LanguageDefinition {
  code: string
  name: string
  nativeName: string
  dir: TextDirection
  flag: string
}

export const SUPPORTED_LANGUAGES: Record<string, LanguageDefinition> = {
  tr: { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', dir: 'ltr', flag: '🇹🇷' },
  en: { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', flag: '🇬🇧' },
  ar: { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl', flag: '🇸🇦' },
  de: { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr', flag: '🇩🇪' },
  fr: { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr', flag: '🇫🇷' },
  es: { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr', flag: '🇪🇸' },
}

// Projede aktif olan dillerin listesi.
// Tek bir dil tanımlıysa (örn: ['tr']), topbar'daki dil seçici otomatik gizlenir.
// Birden fazla dil tanımlıysa (örn: ['tr', 'en', 'ar']), topbar'da profil yanına dil seçici gelir.
export const ACTIVE_LANGUAGES: string[] = ['tr', 'en', 'ar']

export const DEFAULT_LANGUAGE = 'tr'
export const STORAGE_KEY = 'metnex_language'

import { ar } from './locales/ar'
import { en } from './locales/en'
import { tr } from './locales/tr'

export const dictionaries: Record<string, typeof tr> = {
  tr,
  en,
  ar,
}

export * from './i18n-config'

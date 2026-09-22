'use client'

import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { dictionaries } from './index'
import {
  ACTIVE_LANGUAGES,
  DEFAULT_LANGUAGE,
  STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  type LanguageDefinition,
  type TextDirection,
} from './i18n-config'

export interface I18nContextType {
  locale: string
  setLocale: (lang: string) => void
  currentLanguage: LanguageDefinition
  availableLanguages: LanguageDefinition[]
  dir: TextDirection
  isRtl: boolean
  isSelectorVisible: boolean
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextType | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<string>(DEFAULT_LANGUAGE)

  const availableLanguages: LanguageDefinition[] = ACTIVE_LANGUAGES.map(
    code => SUPPORTED_LANGUAGES[code] ?? { code, name: code, nativeName: code, dir: 'ltr' as TextDirection, flag: '🌐' },
  )

  const isSelectorVisible = availableLanguages.length > 1

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && ACTIVE_LANGUAGES.includes(saved)) {
        setLocaleState(saved)
      }
    }
  }, [])

  const setLocale = (lang: string) => {
    if (!ACTIVE_LANGUAGES.includes(lang)) return
    setLocaleState(lang)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang)
    }
  }

  const currentLanguage: LanguageDefinition =
    SUPPORTED_LANGUAGES[locale] ??
    SUPPORTED_LANGUAGES[DEFAULT_LANGUAGE] ??
    { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', dir: 'ltr' as TextDirection, flag: '🇹🇷' }

  const dir = currentLanguage.dir
  const isRtl = dir === 'rtl'

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale
      document.documentElement.dir = dir
    }
  }, [locale, dir])

  const t = (path: string, params?: Record<string, string | number>): string => {
    const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LANGUAGE]
    const fallbackDict = dictionaries[DEFAULT_LANGUAGE]

    const keys = path.split('.')
    let current: unknown = dict
    let fallback: unknown = fallbackDict

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = (current as Record<string, unknown>)[key]
      } else {
        current = undefined
      }

      if (fallback && typeof fallback === 'object' && key in fallback) {
        fallback = (fallback as Record<string, unknown>)[key]
      } else {
        fallback = undefined
      }
    }

    let result = typeof current === 'string' ? current : typeof fallback === 'string' ? fallback : path

    if (params && typeof result === 'string') {
      Object.entries(params).forEach(([paramKey, paramVal]) => {
        result = (result as string).replace(new RegExp(`{\\s*${paramKey}\\s*}`, 'g'), String(paramVal))
      })
    }

    return result as string
  }

  return (
    <I18nContext.Provider
      value={{
        locale,
        setLocale,
        currentLanguage,
        availableLanguages,
        dir,
        isRtl,
        isSelectorVisible,
        t,
      }}
    >
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext)
  if (!context) {
    // Fallback default context if used outside I18nProvider
    const currentLanguage = SUPPORTED_LANGUAGES[DEFAULT_LANGUAGE]!
    return {
      locale: DEFAULT_LANGUAGE,
      setLocale: () => {},
      currentLanguage,
      availableLanguages: [currentLanguage],
      dir: 'ltr',
      isRtl: false,
      isSelectorVisible: false,
      t: (key: string) => key,
    }
  }
  return context
}

export function useTranslation() {
  const { t, locale, dir, isRtl } = useI18n()
  return { t, locale, dir, isRtl }
}

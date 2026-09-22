'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../lib/i18n/i18n-context'

export function GlassLanguageSelector() {
  const { locale, setLocale, currentLanguage, availableLanguages, isSelectorVisible } = useI18n()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Tek dil aktif ise (ACTIVE_LANGUAGES.length <= 1), seçici arayüzde görünmez
  if (!isSelectorVisible) return null

  return (
    <div ref={menuRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Dil seç"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg border border-glass-border-subtle bg-glass-subtle px-2.5 py-1 text-xs font-medium text-glass-text-secondary transition-colors hover:border-glass-border-focus hover:text-glass-text-primary focus-visible:outline-none focus-visible:shadow-glass-focus"
      >
        <span className="text-sm leading-none" aria-hidden="true">
          {currentLanguage.flag}
        </span>
        <span className="uppercase tracking-wider font-semibold">{currentLanguage.code}</span>
        <svg viewBox="0 0 20 20" aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-40 rounded-xl border border-glass-border-focus bg-glass-panel p-1 shadow-glass backdrop-blur-glass z-50 animate-in fade-in zoom-in-95 duration-100">
          {availableLanguages.map(lang => {
            const isSelected = lang.code === locale
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  setLocale(lang.code)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-glass-accent-primary/15 text-glass-accent-primary font-semibold'
                    : 'text-glass-text-secondary hover:bg-glass-subtle hover:text-glass-text-primary'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm" aria-hidden="true">
                    {lang.flag}
                  </span>
                  <span>{lang.nativeName}</span>
                </div>
                {lang.dir === 'rtl' && <span className="text-[10px] text-glass-text-muted px-1 rounded bg-glass-subtle">RTL</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

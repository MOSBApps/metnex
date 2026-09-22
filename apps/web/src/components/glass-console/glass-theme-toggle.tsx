'use client'

import { useGlassTheme } from './theme'

export function GlassThemeToggle() {
  const { theme, toggleTheme } = useGlassTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? 'Açık temaya geç' : 'Koyu temaya geç'}
      title={isDark ? 'Açık temaya geç' : 'Koyu temaya geç'}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-glass-border-default bg-glass-elevated text-glass-text-secondary shadow-glass transition-colors duration-150 ease-in-out hover:bg-glass-subtle hover:text-glass-text-primary focus-visible:outline-none focus-visible:shadow-glass-focus"
    >
      {isDark ? (
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
          <path
            d="M10 2.5a7.5 7.5 0 1 0 7.48 8.13.5.5 0 0 0-.63-.53 6 6 0 0 1-7.45-7.45.5.5 0 0 0-.53-.63A7.53 7.53 0 0 0 10 2.5z"
            fill="currentColor"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
          <circle cx="10" cy="10" r="3.5" fill="currentColor" />
          <path
            d="M10 1.5v2M10 16.5v2M18.5 10h-2M3.5 10h-2M15.6 4.4l-1.4 1.4M5.8 14.2l-1.4 1.4M15.6 15.6l-1.4-1.4M5.8 5.8 4.4 4.4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  )
}

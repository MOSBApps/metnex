import type { ReactElement } from 'react'
import type { GlassStatusTone } from './primitives'

export const GLASS_STATUS_ICON: Record<GlassStatusTone, ReactElement> = {
  success: (
    <svg viewBox="0 0 16 16" fill="none">
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5l7 12.5H1L8 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.5v3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="12" r="0.75" fill="currentColor" />
    </svg>
  ),
  danger: (
    <svg viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  unsupported: (
    <svg viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.5 4.5l7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  neutral: (
    <svg viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="3" fill="currentColor" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.25v4M8 5.25v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
}

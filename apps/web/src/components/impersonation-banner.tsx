'use client'

import { useEffect, useState } from 'react'
import { endImpersonation, getImpersonationMeta, type ImpersonationMeta } from '@/lib/impersonation'

export function ImpersonationBanner() {
  const [meta, setMeta] = useState<ImpersonationMeta | null>(null)

  useEffect(() => {
    setMeta(getImpersonationMeta())
  }, [])

  if (!meta) return null

  return (
    <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
      <div>
        <span className="font-semibold">{meta.impersonatedUserDisplayName}</span>
        <span className="ml-2">({meta.impersonatedUserEmail}) olarak sistemi görüntülüyorsun.</span>
      </div>
      <button
        type="button"
        onClick={() => {
          endImpersonation()
          window.location.href = '/system/users'
        }}
        className="app-button-outline border-amber-300 bg-white px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
      >
        Super Admin&apos;e Dön
      </button>
    </div>
  )
}

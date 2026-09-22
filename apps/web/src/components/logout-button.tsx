'use client'

import { useState } from 'react'
import { logout } from '../lib/auth'

export function LogoutButton({ label = 'Çıkış Yap' }: { label?: string }) {
  const [pending, setPending] = useState(false)

  async function handleClick() {
    if (pending) return
    setPending(true)
    await logout()
  }

  return (
    <button onClick={handleClick} disabled={pending} className="app-button-outline w-full">
      {pending ? 'Çıkılıyor...' : label}
    </button>
  )
}

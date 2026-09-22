import { clearAccessToken } from './refresh'
import { clearActiveTenant } from './tenant-context'
import { getApiBase } from './api-base'

export async function logout(): Promise<void> {
  const apiBase = getApiBase()

  try {
    await fetch(`${apiBase}/api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
  } catch {
    // best effort
  }

  clearAccessToken()
  clearActiveTenant()
  window.location.href = '/login'
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function composeTenantSlug(baseSlug: string, parentSlug?: string | null): string {
  const normalizedBase = slugify(baseSlug)
  const normalizedParent = slugify(parentSlug ?? '')
  if (!normalizedParent) return normalizedBase
  if (!normalizedBase) return normalizedParent
  return `${normalizedParent}-${normalizedBase}`
}

export function validateTenantCreation(input: { name: string; slug?: string }) {
  const errors: string[] = []
  const name = input.name.trim()
  const resolvedSlug = slugify(input.slug?.trim() || name)

  if (name.length < 2) errors.push('Kiracı adı en az 2 karakter olmalıdır')
  if (name.length > 100) errors.push('Kiracı adı en fazla 100 karakter olabilir')
  if (!resolvedSlug) errors.push('Geçerli bir slug üretilemedi')

  return { valid: errors.length === 0, errors, resolvedSlug }
}

export function canSuspendTenant(status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED') {
  if (status === 'SUSPENDED') return { allowed: false, reason: 'ALREADY_SUSPENDED' as const }
  if (status === 'ARCHIVED') return { allowed: false, reason: 'ARCHIVED' as const }
  return { allowed: true }
}

export function canArchiveTenant(
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED',
  activeMemberCount: number,
) {
  if (status === 'ARCHIVED') return { allowed: false, reason: 'ALREADY_ARCHIVED' as const }
  if (activeMemberCount > 0) return { allowed: false, reason: 'ACTIVE_MEMBERS' as const }
  return { allowed: true }
}

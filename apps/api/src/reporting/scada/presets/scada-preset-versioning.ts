import type { PresetStatus, ScadaPreset } from './scada-preset.contract'

/** Allowed status changes of ONE version. ARCHIVED is terminal: an archived version is never re-activated. */
const TRANSITIONS: Readonly<Record<PresetStatus, readonly PresetStatus[]>> = {
  DRAFT: ['ACTIVE', 'DISABLED', 'ARCHIVED'],
  ACTIVE: ['DISABLED', 'BLOCKED', 'ARCHIVED'],
  DISABLED: ['ACTIVE', 'ARCHIVED'],
  BLOCKED: ['DISABLED', 'ARCHIVED'],
  ARCHIVED: [],
}

export const canTransition = (from: PresetStatus, to: PresetStatus): boolean => from === to || TRANSITIONS[from].includes(to)

const lo = (p: Pick<ScadaPreset, 'effectiveFrom'>) => (p.effectiveFrom ? Date.parse(p.effectiveFrom) : Number.NEGATIVE_INFINITY)
const hi = (p: Pick<ScadaPreset, 'effectiveTo'>) => (p.effectiveTo ? Date.parse(p.effectiveTo) : Number.POSITIVE_INFINITY)

/**
 * The versions of ONE presetId. Any ambiguity is PRESET_VERSION_CONFLICT (nothing is resolved):
 *  - versions of different presets / tenants / scopes / owners are mixed;
 *  - a version number repeats;
 *  - version numbers are not monotonic with creation time (a higher version created EARLIER);
 *  - two ACTIVE versions have overlapping [effectiveFrom, effectiveTo) windows (open ends included).
 */
export function checkVersionSet(versions: readonly ScadaPreset[]): { ok: true; active: ScadaPreset[] } | { ok: false; code: 'PRESET_VERSION_CONFLICT' } {
  if (versions.length === 0) return { ok: false, code: 'PRESET_VERSION_CONFLICT' }
  const first = versions[0]!
  if (versions.some(v => v.presetId !== first.presetId || v.customerRootTenantId !== first.customerRootTenantId || v.scope !== first.scope || v.ownerUserId !== first.ownerUserId)) return { ok: false, code: 'PRESET_VERSION_CONFLICT' }
  const numbers = versions.map(v => v.version)
  if (new Set(numbers).size !== numbers.length) return { ok: false, code: 'PRESET_VERSION_CONFLICT' }
  const ordered = [...versions].sort((a, b) => a.version - b.version)
  for (let i = 1; i < ordered.length; i += 1) if (Date.parse(ordered[i]!.createdAt) < Date.parse(ordered[i - 1]!.createdAt)) return { ok: false, code: 'PRESET_VERSION_CONFLICT' }
  const active = ordered.filter(v => v.status === 'ACTIVE')
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) if (lo(active[i]!) < hi(active[j]!) && lo(active[j]!) < hi(active[i]!)) return { ok: false, code: 'PRESET_VERSION_CONFLICT' }
  }
  return { ok: true, active }
}

/** The ACTIVE version effective at `ms`: [effectiveFrom, effectiveTo). */
export function versionAt(active: readonly ScadaPreset[], ms: number): ScadaPreset | null {
  return active.find(v => ms >= lo(v) && ms < hi(v)) ?? null
}

const strip = (p: ScadaPreset) => JSON.stringify({ ...p, status: null, updatedAt: null })

/**
 * Append-only rule for storing `incoming` next to the `stored` versions (the caller persists; nothing is written here):
 *  - a NEW version must be higher than every stored one;
 *  - an existing version may only change STATUS (along the allowed transitions) and `updatedAt` — its content is never
 *    silently rewritten; an ARCHIVED version never changes at all.
 */
export function checkAppendOnly(stored: readonly ScadaPreset[], incoming: ScadaPreset): { ok: true } | { ok: false; code: 'PRESET_VERSION_CONFLICT' } {
  const same = stored.find(s => s.version === incoming.version)
  if (!same) return incoming.version > Math.max(0, ...stored.map(s => s.version)) ? { ok: true } : { ok: false, code: 'PRESET_VERSION_CONFLICT' }
  if (strip(same) !== strip(incoming)) return { ok: false, code: 'PRESET_VERSION_CONFLICT' }
  return canTransition(same.status, incoming.status) ? { ok: true } : { ok: false, code: 'PRESET_VERSION_CONFLICT' }
}

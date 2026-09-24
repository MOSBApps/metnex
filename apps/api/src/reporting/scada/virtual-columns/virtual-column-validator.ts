import { collectRefs, ExpressionError, type ExprNode } from './virtual-column-expression'
import { limitsValid, parseExpression } from './virtual-column-parser'
import { VIRTUAL_COLUMN_STATUSES, type VirtualColumnDefinition, type VirtualColumnLimits } from './virtual-column.contract'

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !CONTROL.test(v)
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v))

/** Structural validity of a definition (bounded printable texts, enums, a positive integer version, sane windows). */
export function definitionShapeValid(d: unknown): d is VirtualColumnDefinition {
  if (!d || typeof d !== 'object') return false
  const x = d as Record<string, unknown>
  if (!(text(x['virtualColumnId'], 128) && text(x['catalogId'], 128) && text(x['customerRootTenantId'], 128) && text(x['seriesKey'], 128) && text(x['label'], 128) && text(x['unit'], 32) && text(x['createdBy'], 128))) return false
  if (typeof x['expression'] !== 'string' || !isIso(x['updatedAt'])) return false
  if (!Array.isArray(x['inputSeriesKeys']) || x['inputSeriesKeys'].length === 0 || !x['inputSeriesKeys'].every(k => text(k, 128)) || new Set(x['inputSeriesKeys']).size !== x['inputSeriesKeys'].length) return false
  if (x['valueType'] !== 'INDEX' && x['valueType'] !== 'REAL_VALUE') return false
  if (typeof x['version'] !== 'number' || !Number.isSafeInteger(x['version']) || x['version'] < 1) return false
  if (!(VIRTUAL_COLUMN_STATUSES as readonly string[]).includes(x['status'] as string)) return false
  for (const k of ['effectiveFrom', 'effectiveTo'] as const) if (x[k] !== null && !isIso(x[k])) return false
  if (x['effectiveFrom'] && x['effectiveTo'] && Date.parse(x['effectiveFrom'] as string) >= Date.parse(x['effectiveTo'] as string)) return false
  return true
}

type Ty = 'num' | 'bool'
const invalid = () => new ExpressionError('VIRTUAL_COLUMN_EXPRESSION_INVALID')

/** Static typing: arithmetic/functions take numbers, comparisons give booleans, AND/OR/NOT/IF-condition take booleans. */
function typeOf(node: ExprNode, limits: VirtualColumnLimits): Ty {
  switch (node.t) {
    case 'num':
    case 'ref':
      return 'num'
    case 'neg':
      if (typeOf(node.a, limits) !== 'num') throw invalid()
      return 'num'
    case 'not':
      if (typeOf(node.a, limits) !== 'bool') throw invalid()
      return 'bool'
    case 'bin':
      if (typeOf(node.a, limits) !== 'num' || typeOf(node.b, limits) !== 'num') throw invalid()
      return 'num'
    case 'cmp':
      if (typeOf(node.a, limits) !== 'num' || typeOf(node.b, limits) !== 'num') throw invalid()
      return 'bool'
    case 'logic':
      if (typeOf(node.a, limits) !== 'bool' || typeOf(node.b, limits) !== 'bool') throw invalid()
      return 'bool'
    case 'call': {
      const args = node.args
      const nums = (list: ExprNode[]) => list.every(a => typeOf(a, limits) === 'num')
      if (node.name === 'MIN' || node.name === 'MAX') {
        if (args.length < 2 || !nums(args)) throw invalid()
        return 'num'
      }
      if (node.name === 'ABS') {
        if (args.length !== 1 || !nums(args)) throw invalid()
        return 'num'
      }
      if (node.name === 'ROUND') {
        const d = args[1]
        // the precision is a plain non-negative integer LITERAL within the external bound
        if (args.length !== 2 || typeOf(args[0]!, limits) !== 'num' || !d || d.t !== 'num' || !Number.isInteger(d.v) || d.v < 0 || d.v > limits.maxRoundDecimals) throw invalid()
        return 'num'
      }
      // IF(condition, whenTrue, whenFalse)
      if (args.length !== 3 || typeOf(args[0]!, limits) !== 'bool' || typeOf(args[1]!, limits) !== 'num' || typeOf(args[2]!, limits) !== 'num') throw invalid()
      return 'num'
    }
  }
}

export interface Compiled {
  ast: ExprNode
  refs: string[]
}

/**
 * Parse + validate ONE definition version. Throws only ExpressionError (a static code). Unknown input references, inputs that
 * are not available to this tenant/source, a reference to the column itself (no recursion) and wrong types are refused.
 */
export function compileDefinition(def: VirtualColumnDefinition, limits: VirtualColumnLimits, availableInputs: ReadonlySet<string>): Compiled {
  if (!limitsValid(limits)) throw new ExpressionError('VIRTUAL_COLUMN_EXPRESSION_TOO_COMPLEX') // no limits ⇒ nothing is accepted
  if (!definitionShapeValid(def)) throw invalid()
  let ast: ExprNode
  let refs: string[]
  try {
    ast = parseExpression(def.expression, limits)
    if (typeOf(ast, limits) !== 'num') throw invalid()
    refs = [...collectRefs(ast)].sort()
  } catch (e) {
    if (e instanceof ExpressionError) throw e
    throw new ExpressionError('VIRTUAL_COLUMN_EXPRESSION_TOO_COMPLEX') // e.g. a stack overflow while walking a huge tree
  }
  const declared = new Set(def.inputSeriesKeys)
  if (refs.some(r => !declared.has(r) || r === def.seriesKey)) throw new ExpressionError('VIRTUAL_COLUMN_UNKNOWN_INPUT')
  if (def.inputSeriesKeys.some(k => !availableInputs.has(k) || k === def.seriesKey)) throw new ExpressionError('VIRTUAL_COLUMN_UNKNOWN_INPUT')
  return { ast, refs }
}

/**
 * ACTIVE versions of ONE virtualColumnId. Any ambiguity is VERSION_CONFLICT (nothing is computed): the same version twice,
 * two ACTIVE versions whose [effectiveFrom, effectiveTo) windows overlap, or versions that disagree on seriesKey /
 * catalog / tenant / value type (they are one identity).
 */
export function activeVersions(versions: readonly VirtualColumnDefinition[]): { ok: true; active: VirtualColumnDefinition[] } | { ok: false; code: 'VIRTUAL_COLUMN_VERSION_CONFLICT' | 'VIRTUAL_COLUMN_NOT_ACTIVE' } {
  const numbers = versions.map(v => v.version)
  if (new Set(numbers).size !== numbers.length) return { ok: false, code: 'VIRTUAL_COLUMN_VERSION_CONFLICT' }
  const active = versions.filter(v => v.status === 'ACTIVE')
  if (active.length === 0) return { ok: false, code: 'VIRTUAL_COLUMN_NOT_ACTIVE' }
  const [first] = active
  if (active.some(v => v.seriesKey !== first!.seriesKey || v.catalogId !== first!.catalogId || v.customerRootTenantId !== first!.customerRootTenantId || v.valueType !== first!.valueType)) return { ok: false, code: 'VIRTUAL_COLUMN_VERSION_CONFLICT' }
  const lo = (v: VirtualColumnDefinition) => (v.effectiveFrom ? Date.parse(v.effectiveFrom) : Number.NEGATIVE_INFINITY)
  const hi = (v: VirtualColumnDefinition) => (v.effectiveTo ? Date.parse(v.effectiveTo) : Number.POSITIVE_INFINITY)
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      if (lo(active[i]!) < hi(active[j]!) && lo(active[j]!) < hi(active[i]!)) return { ok: false, code: 'VIRTUAL_COLUMN_VERSION_CONFLICT' }
    }
  }
  return { ok: true, active: [...active].sort((a, b) => a.version - b.version) }
}

/** The version effective at `ms`: [effectiveFrom, effectiveTo). */
export function versionAt(active: readonly VirtualColumnDefinition[], ms: number): VirtualColumnDefinition | null {
  return active.find(v => (!v.effectiveFrom || ms >= Date.parse(v.effectiveFrom)) && (!v.effectiveTo || ms < Date.parse(v.effectiveTo))) ?? null
}

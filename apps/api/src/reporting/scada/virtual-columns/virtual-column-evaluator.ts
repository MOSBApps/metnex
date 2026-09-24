import type { ExprNode } from './virtual-column-expression'

export type EvalResult = { ok: true; value: number } | { ok: false; reason: 'DIVISION' | 'NUMERIC' }

class Fail extends Error {
  constructor(readonly reason: 'DIVISION' | 'NUMERIC') {
    super(reason)
  }
}

/** Half away from zero at `decimals` places. */
export function roundHalfAway(value: number, decimals: number): number {
  const f = 10 ** decimals
  const r = Math.round(Math.abs(value) * f) / f
  return value < 0 ? -r : r
}

/**
 * Evaluates the AST — and ONLY the AST: no eval, no Function, no dynamic code, no I/O, no clock, no randomness, no access
 * to anything but the given numbers. Every intermediate and final result must be finite and within `maxAbsoluteResult`
 * (NaN / ±Infinity / overflow / out of bound ⇒ NUMERIC). Division by 0 ⇒ DIVISION (never 0, never Infinity, never the
 * previous value). IF / AND / OR are lazy (only the taken branch is evaluated). Failures are values, never exceptions.
 */
export function evaluate(ast: ExprNode, values: ReadonlyMap<string, number>, maxAbsoluteResult: number): EvalResult {
  const bound = (v: number): number => {
    if (!Number.isFinite(v) || Math.abs(v) > maxAbsoluteResult) throw new Fail('NUMERIC')
    return v
  }
  const num = (n: ExprNode): number => {
    switch (n.t) {
      case 'num':
        return bound(n.v)
      case 'ref': {
        const v = values.get(n.name)
        if (v === undefined) throw new Fail('NUMERIC') // cannot happen after validation; still never a guess
        return bound(v)
      }
      case 'neg':
        return bound(-num(n.a))
      case 'bin': {
        const a = num(n.a)
        const b = num(n.b)
        if (n.op === '+') return bound(a + b)
        if (n.op === '-') return bound(a - b)
        if (n.op === '*') return bound(a * b)
        if (b === 0) throw new Fail('DIVISION')
        return bound(a / b)
      }
      case 'call': {
        if (n.name === 'IF') return bool(n.args[0]!) ? num(n.args[1]!) : num(n.args[2]!)
        if (n.name === 'ABS') return bound(Math.abs(num(n.args[0]!)))
        if (n.name === 'ROUND') return bound(roundHalfAway(num(n.args[0]!), (n.args[1] as { v: number }).v))
        const list = n.args.map(num)
        return bound(n.name === 'MIN' ? list.reduce((a, b) => (b < a ? b : a)) : list.reduce((a, b) => (b > a ? b : a)))
      }
      default:
        throw new Fail('NUMERIC')
    }
  }
  const bool = (n: ExprNode): boolean => {
    switch (n.t) {
      case 'not':
        return !bool(n.a)
      case 'logic':
        return n.op === 'AND' ? bool(n.a) && bool(n.b) : bool(n.a) || bool(n.b)
      case 'cmp': {
        const a = num(n.a)
        const b = num(n.b)
        return n.op === '>' ? a > b : n.op === '>=' ? a >= b : n.op === '<' ? a < b : n.op === '<=' ? a <= b : n.op === '==' ? a === b : a !== b
      }
      default:
        throw new Fail('NUMERIC')
    }
  }
  try {
    return { ok: true, value: num(ast) }
  } catch (e) {
    return { ok: false, reason: e instanceof Fail ? e.reason : 'NUMERIC' } // nothing raw ever leaves
  }
}

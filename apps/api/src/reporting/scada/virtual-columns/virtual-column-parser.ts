import { ExpressionError, isAllowedFunction, type ExprNode } from './virtual-column-expression'
import type { VirtualColumnLimits } from './virtual-column.contract'

type Token = { k: 'num'; v: number } | { k: 'id'; v: string } | { k: 'ref'; v: string } | { k: 'op'; v: string } | { k: 'end' }

const bad = () => new ExpressionError('VIRTUAL_COLUMN_EXPRESSION_INVALID')
const complex = () => new ExpressionError('VIRTUAL_COLUMN_EXPRESSION_TOO_COMPLEX')

/** All limits must be present and sane, otherwise NOTHING is accepted (fail-closed; no default is invented). */
export function limitsValid(l: unknown): l is VirtualColumnLimits {
  if (!l || typeof l !== 'object') return false
  const x = l as Record<string, unknown>
  const posInt = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0
  return posInt(x['maxExpressionLength']) && posInt(x['maxAstDepth']) && posInt(x['maxOperatorCount']) && typeof x['maxRoundDecimals'] === 'number' && Number.isSafeInteger(x['maxRoundDecimals']) && x['maxRoundDecimals'] >= 0 && typeof x['maxAbsoluteResult'] === 'number' && Number.isFinite(x['maxAbsoluteResult']) && x['maxAbsoluteResult'] > 0
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      i += 1
    } else if (c >= '0' && c <= '9') {
      const m = /^\d+(?:\.\d+)?/.exec(text.slice(i))!
      tokens.push({ k: 'num', v: Number(m[0]) })
      i += m[0].length
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i))!
      tokens.push({ k: 'id', v: m[0] })
      i += m[0].length
    } else if (c === '"') {
      // a QUOTED SERIES REFERENCE, not a string literal: the language has no strings
      const end = text.indexOf('"', i + 1)
      const body = end < 0 ? '' : text.slice(i + 1, end)
      // eslint-disable-next-line no-control-regex
      if (end < 0 || body === '' || /[\u0000-\u001f\u007f\\]/.test(body)) throw bad()
      tokens.push({ k: 'ref', v: body })
      i = end + 1
    } else if (c === '=' || c === '!') {
      if (text[i + 1] !== '=') throw bad() // a single "=" (assignment) or "!" is not part of the language
      tokens.push({ k: 'op', v: `${c}=` })
      i += 2
    } else if (c === '<' || c === '>') {
      if (text[i + 1] === '=') {
        tokens.push({ k: 'op', v: `${c}=` })
        i += 2
      } else {
        tokens.push({ k: 'op', v: c })
        i += 1
      }
    } else if ('+-*/(),'.includes(c)) {
      tokens.push({ k: 'op', v: c })
      i += 1
    } else {
      throw bad() // any other character: braces, brackets, dots, quotes, semicolons, $, #, backticks … are rejected
    }
  }
  tokens.push({ k: 'end' })
  return tokens
}

/**
 * Recursive-descent parser: text → AST, for the allowlist grammar ONLY. It never evaluates anything. Limits (length, AST
 * depth, operator/function count) come from the caller; exceeding one is TOO_COMPLEX, a stack overflow is caught and is
 * TOO_COMPLEX too. Unknown function names are FUNCTION_NOT_ALLOWED (eval, Function, user-defined …).
 */
export function parseExpression(text: string, limits: VirtualColumnLimits): ExprNode {
  if (typeof text !== 'string' || text.trim() === '') throw bad()
  if (text.length > limits.maxExpressionLength) throw complex()
  const tokens = tokenize(text)
  let pos = 0
  let depth = 0
  let operators = 0
  const peek = () => tokens[pos]!
  const isOp = (v: string) => peek().k === 'op' && (peek() as { v: string }).v === v
  const isWord = (v: string) => peek().k === 'id' && (peek() as { v: string }).v === v
  const count = () => {
    operators += 1
    if (operators > limits.maxOperatorCount) throw complex()
  }
  const enter = () => {
    depth += 1
    if (depth > limits.maxAstDepth) throw complex()
  }
  const leave = () => {
    depth -= 1
  }

  function parseOr(): ExprNode {
    let left = parseAnd()
    while (isWord('OR')) {
      pos += 1
      count()
      left = { t: 'logic', op: 'OR', a: left, b: parseAnd() }
    }
    return left
  }
  function parseAnd(): ExprNode {
    let left = parseNot()
    while (isWord('AND')) {
      pos += 1
      count()
      left = { t: 'logic', op: 'AND', a: left, b: parseNot() }
    }
    return left
  }
  function parseNot(): ExprNode {
    enter()
    let node: ExprNode
    if (isWord('NOT')) {
      pos += 1
      count()
      node = { t: 'not', a: parseNot() }
    } else {
      node = parseCmp()
    }
    leave()
    return node
  }
  function parseCmp(): ExprNode {
    const left = parseAdd()
    const t = peek()
    if (t.k === 'op' && ['>', '>=', '<', '<=', '==', '!='].includes(t.v)) {
      pos += 1
      count()
      const right = parseAdd()
      const next = peek()
      if (next.k === 'op' && ['>', '>=', '<', '<=', '==', '!='].includes(next.v)) throw bad() // no chained comparisons
      return { t: 'cmp', op: t.v as '>', a: left, b: right }
    }
    return left
  }
  function parseAdd(): ExprNode {
    let left = parseMul()
    while (isOp('+') || isOp('-')) {
      const op = (peek() as { v: string }).v as '+' | '-'
      pos += 1
      count()
      left = { t: 'bin', op, a: left, b: parseMul() }
    }
    return left
  }
  function parseMul(): ExprNode {
    let left = parseUnary()
    while (isOp('*') || isOp('/')) {
      const op = (peek() as { v: string }).v as '*' | '/'
      pos += 1
      count()
      left = { t: 'bin', op, a: left, b: parseUnary() }
    }
    return left
  }
  function parseUnary(): ExprNode {
    enter()
    let node: ExprNode
    if (isOp('-')) {
      pos += 1
      count()
      node = { t: 'neg', a: parseUnary() }
    } else {
      node = parsePrimary()
    }
    leave()
    return node
  }
  function parsePrimary(): ExprNode {
    const t = peek()
    if (t.k === 'num') {
      pos += 1
      return { t: 'num', v: t.v }
    }
    if (t.k === 'ref') {
      pos += 1
      return { t: 'ref', name: t.v }
    }
    if (t.k === 'id') {
      pos += 1
      if (isOp('(')) {
        enter()
        if (!isAllowedFunction(t.v)) throw new ExpressionError('VIRTUAL_COLUMN_FUNCTION_NOT_ALLOWED')
        pos += 1
        count()
        const args: ExprNode[] = []
        if (!isOp(')')) {
          args.push(parseOr())
          while (isOp(',')) {
            pos += 1
            args.push(parseOr())
          }
        }
        if (!isOp(')')) throw bad()
        pos += 1
        leave()
        return { t: 'call', name: t.v, args }
      }
      if (t.v === 'AND' || t.v === 'OR' || t.v === 'NOT') throw bad()
      return { t: 'ref', name: t.v }
    }
    if (t.k === 'op' && t.v === '(') {
      pos += 1
      enter() // nesting guard: a runaway nesting is stopped before it can exhaust the stack
      const inner = parseOr()
      if (!isOp(')')) throw bad() // parentheses must balance
      pos += 1
      leave()
      return inner
    }
    throw bad()
  }

  try {
    const ast = parseOr()
    if (peek().k !== 'end') throw bad() // trailing tokens (unbalanced ")", adjacent identifiers, "a.b", …)
    if (astDepth(ast) > limits.maxAstDepth) throw complex()
    return ast
  } catch (e) {
    if (e instanceof ExpressionError) throw e
    throw complex() // RangeError (stack) and anything unexpected: never leaked, never a raw error
  }
}

/** True AST depth (a chain a+b+c… counts its length). */
export function astDepth(node: ExprNode): number {
  switch (node.t) {
    case 'neg':
    case 'not':
      return 1 + astDepth(node.a)
    case 'bin':
    case 'cmp':
    case 'logic':
      return 1 + Math.max(astDepth(node.a), astDepth(node.b))
    case 'call':
      return 1 + node.args.reduce((m, a) => Math.max(m, astDepth(a)), 0)
    default:
      return 1
  }
}

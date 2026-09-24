/** AST of the allowlist expression language. There is deliberately NO node for property access, calls of arbitrary
 * functions, literals other than numbers, assignments, loops or anything dynamic. */
export type ExprNode =
  | { t: 'num'; v: number }
  | { t: 'ref'; name: string }
  | { t: 'neg'; a: ExprNode }
  | { t: 'not'; a: ExprNode }
  | { t: 'bin'; op: '+' | '-' | '*' | '/'; a: ExprNode; b: ExprNode }
  | { t: 'cmp'; op: '>' | '>=' | '<' | '<=' | '==' | '!='; a: ExprNode; b: ExprNode }
  | { t: 'logic'; op: 'AND' | 'OR'; a: ExprNode; b: ExprNode }
  | { t: 'call'; name: AllowedFunction; args: ExprNode[] }

export const ALLOWED_FUNCTIONS = ['MIN', 'MAX', 'ABS', 'ROUND', 'IF'] as const
export type AllowedFunction = (typeof ALLOWED_FUNCTIONS)[number]

export const isAllowedFunction = (name: string): name is AllowedFunction => (ALLOWED_FUNCTIONS as readonly string[]).includes(name)

/** Static parse/validation failure: only a code, never a fragment of the expression. */
export class ExpressionError extends Error {
  constructor(readonly code: 'VIRTUAL_COLUMN_EXPRESSION_INVALID' | 'VIRTUAL_COLUMN_EXPRESSION_TOO_COMPLEX' | 'VIRTUAL_COLUMN_FUNCTION_NOT_ALLOWED' | 'VIRTUAL_COLUMN_UNKNOWN_INPUT') {
    super(code)
    this.name = 'ExpressionError'
  }
}

export function collectRefs(node: ExprNode, into = new Set<string>()): Set<string> {
  switch (node.t) {
    case 'ref':
      into.add(node.name)
      break
    case 'neg':
    case 'not':
      collectRefs(node.a, into)
      break
    case 'bin':
    case 'cmp':
    case 'logic':
      collectRefs(node.a, into)
      collectRefs(node.b, into)
      break
    case 'call':
      node.args.forEach(a => collectRefs(a, into))
      break
    default:
      break
  }
  return into
}

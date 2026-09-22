/**
 * `noUncheckedIndexedAccess` means `rows[0]` (and destructuring `const [row] = rows`) is always
 * `T | undefined` to TypeScript, even when the calling code already knows the row must exist
 * (an insert/update `.returning()` on a row it just confirmed exists, a lookup right after an
 * existence check). This asserts that expectation explicitly instead of silently trusting it —
 * fails loudly if it's ever wrong rather than proceeding with `undefined`.
 */
export function assertRow<T>(rows: T[], message = 'Expected row not found'): T {
  const row = rows[0]
  if (row === undefined) throw new Error(message)
  return row
}

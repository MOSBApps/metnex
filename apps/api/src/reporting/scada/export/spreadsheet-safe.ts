/** Formula triggers of Excel / Sheets / LibreOffice (OWASP CSV injection): = + - @ and a leading TAB / CR. */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/
// eslint-disable-next-line no-control-regex
const XML_ILLEGAL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g

/**
 * A TEXT cell that starts with a formula trigger is neutralised with a leading apostrophe. Applied to text only: a real number
 * (a typed `number`, never a string that looks like one) is written as a number, so a negative delta stays a negative number.
 */
export function neutraliseFormula(text: string): string {
  return FORMULA_TRIGGER.test(text) ? `'${text}` : text
}

export function stripXmlIllegal(text: string): string {
  return text.replace(XML_ILLEGAL, '')
}

/** RFC 4180 field: quoted when it holds a comma, a double quote or a line break; quotes doubled. */
export function csvField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Header-safe, path-free file name segment. */
export function safeFileSegment(input: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned === '' ? 'export' : cleaned.slice(0, 64)
}

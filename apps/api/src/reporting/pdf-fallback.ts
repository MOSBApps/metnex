/** Minimal built-in PDF used only when no Jasper renderer is configured (moved out of reporting.service.ts unchanged). */
export function buildSimplePdf(title: string, lines: string[]) {
  const bodyText = [title, '', ...lines].join('\\n').replace(/[()\\]/g, '')
  const stream = `BT /F1 12 Tf 50 780 Td (${bodyText}) Tj ET`
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
  ]
  const chunks = ['%PDF-1.4\n']
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(chunks.join('')))
    chunks.push(`${object}\n`)
  }
  const xrefAt = Buffer.byteLength(chunks.join(''))
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`)
  for (let i = 1; i <= objects.length; i += 1) {
    chunks.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  }
  chunks.push(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`)
  return Buffer.from(chunks.join(''), 'utf8')
}

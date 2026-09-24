/**
 * TASK-027.55 — SVG → PNG conversion for the Recharts line chart, using only native browser APIs
 * (XMLSerializer, Image, Canvas). No new dependency added: this is a single static chart snapshot,
 * not a full DOM screenshot (which is what libraries like html2canvas/dom-to-image are for), so
 * `canvas.drawImage()` of the chart's own `<svg>` is sufficient and keeps the dependency surface
 * unchanged.
 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Grafik görseli yüklenemedi'))
    img.src = src
  })
}

export interface RenderChartPngOptions {
  captionLines: string[]
  width: number
  height: number
}

/** Renders `svg` onto a canvas with `captionLines` drawn above it, returning a PNG Blob. Throws a
 * plain, user-safe Error (never a raw browser/canvas error) on failure. */
export async function renderSvgToPngBlob(svg: SVGSVGElement, options: RenderChartPngOptions): Promise<Blob> {
  const svgString = new XMLSerializer().serializeToString(svg)
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  try {
    const img = await loadImage(url)
    const captionHeight = options.captionLines.length * 18 + 16
    const canvas = document.createElement('canvas')
    canvas.width = options.width
    canvas.height = options.height + captionHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('PNG oluşturulamadı')

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#0f172a'
    ctx.font = '13px sans-serif'
    options.captionLines.forEach((line, index) => ctx.fillText(line, 12, 18 + index * 18))
    ctx.drawImage(img, 0, captionHeight, options.width, options.height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('PNG oluşturulamadı'))
      }, 'image/png')
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export interface AnalysisCaptionInput {
  title: string
  q: string
  status: string
  isDevFixture: boolean
}

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Tamamlandı',
  PENDING: 'Beklemede',
  FAILED: 'Başarısız',
}

/** Pure — the active filter summary line(s) drawn onto the exported PNG, so the image is
 * self-describing without needing the screen it came from. */
export function buildPngCaptionLines(input: AnalysisCaptionInput): string[] {
  const lines = [input.title]
  const filterParts: string[] = []
  if (input.q) filterParts.push(`Arama: ${input.q}`)
  if (input.status) filterParts.push(`Durum: ${STATUS_LABEL[input.status] ?? input.status}`)
  lines.push(filterParts.length > 0 ? filterParts.join(' · ') : 'Tüm kayıtlar')
  lines.push(`Oluşturma: ${new Date().toLocaleString('tr-TR')}`)
  if (input.isDevFixture) lines.push('Geliştirme simülasyon verisi')
  return lines
}

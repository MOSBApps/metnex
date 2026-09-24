import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPngCaptionLines, renderSvgToPngBlob } from './png-export'

describe('buildPngCaptionLines', () => {
  it('includes the title and "Tüm kayıtlar" when no filters are active', () => {
    const lines = buildPngCaptionLines({ title: 'İşlem Kayıtları', q: '', status: '', isDevFixture: false })
    expect(lines[0]).toBe('İşlem Kayıtları')
    expect(lines[1]).toBe('Tüm kayıtlar')
  })

  it('summarizes active q/status filters', () => {
    const lines = buildPngCaptionLines({ title: 'İşlem Kayıtları', q: 'vardiya', status: 'FAILED', isDevFixture: false })
    expect(lines[1]).toBe('Arama: vardiya · Durum: Başarısız')
  })

  it('includes the "Geliştirme simülasyon verisi" label only when isDevFixture is true', () => {
    const withFixture = buildPngCaptionLines({ title: 'X', q: '', status: '', isDevFixture: true })
    const withoutFixture = buildPngCaptionLines({ title: 'X', q: '', status: '', isDevFixture: false })
    expect(withFixture).toContain('Geliştirme simülasyon verisi')
    expect(withoutFixture).not.toContain('Geliştirme simülasyon verisi')
  })

  it('never contains a secret/token-shaped value', () => {
    const lines = buildPngCaptionLines({ title: 'X', q: 'password=abc', status: '', isDevFixture: false })
    expect(lines.join(' ')).not.toMatch(/secret|token|hash|postgres:\/\//i)
  })
})

/**
 * TASK-027.55 R1 (AI1 review): `apps/web` gained a `canvas` (node-canvas) devDependency so jsdom's
 * `HTMLCanvasElement`/`CanvasRenderingContext2D` are backed by real rasterization instead of a stub
 * — see the "REAL rasterization" describe block below, which exercises `renderSvgToPngBlob` with
 * genuinely no canvas/context mocking and asserts on real PNG bytes (magic number, IHDR dimensions,
 * byte size). One seam still can't be made real in this sandbox: node-canvas's `Image` does not
 * decode `blob:`/`data:` SVG sources in this environment (confirmed by direct experiment — both
 * hang and never fire `onload`/`onerror`; likely missing librsvg support in the prebuilt binary).
 * That step is substituted with a real `<canvas>` element standing in for "the decoded image" (a
 * genuine `HTMLCanvasElement`, not a plain mock object, so it passes jsdom's own `drawImage`
 * argument-type validation and gets drawn for real) — this is a disclosed environment limitation of
 * SVG image decoding specifically, not of PNG file production, which this suite now proves is real.
 *
 * This block below (kept from before that devDependency was added) still mocks the canvas context
 * itself — precise call-count assertions on the drawing order, plus two error paths real
 * rasterization can't easily force: a null `getContext` result and a null `toBlob` callback.
 */
describe('renderSvgToPngBlob — mocked context (orchestration + error paths)', () => {
  let fillRect: ReturnType<typeof vi.fn>
  let fillText: ReturnType<typeof vi.fn>
  let drawImage: ReturnType<typeof vi.fn>
  let toBlobMock: ReturnType<typeof vi.fn>
  let getContextSpy: ReturnType<typeof vi.spyOn>
  let toBlobSpy: ReturnType<typeof vi.spyOn>
  let createObjectURLSpy: ReturnType<typeof vi.fn>
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>
  const fakeBlob = new Blob(['png-bytes'], { type: 'image/png' })

  beforeEach(() => {
    fillRect = vi.fn()
    fillText = vi.fn()
    drawImage = vi.fn()
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      font: '',
      fillRect,
      fillText,
      drawImage,
    } as unknown as CanvasRenderingContext2D)
    toBlobMock = vi.fn((cb: (blob: Blob | null) => void) => cb(fakeBlob))
    toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(toBlobMock as never)

    createObjectURLSpy = vi.fn(() => 'blob:mock-url')
    revokeObjectURLSpy = vi.fn()
    global.URL.createObjectURL = createObjectURLSpy as never
    global.URL.revokeObjectURL = revokeObjectURLSpy as never

    // jsdom's Image never fires load/error on its own — resolve on next tick, like a real (fast) load.
    class MockImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      width = 400
      height = 200
      set src(_value: string) {
        setTimeout(() => this.onload?.(), 0)
      }
    }
    vi.stubGlobal('Image', MockImage as unknown as typeof Image)
  })

  afterEach(() => {
    getContextSpy.mockRestore()
    toBlobSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  function fakeSvg(): SVGSVGElement {
    return document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  }

  it('serializes the SVG into an object URL, draws it after the caption, and resolves with the canvas Blob', async () => {
    const blob = await renderSvgToPngBlob(fakeSvg(), { captionLines: ['Title', 'Arama: x'], width: 800, height: 360 })
    expect(blob).toBe(fakeBlob)
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
    expect(fillRect).toHaveBeenCalled() // white background painted first
    expect(fillText).toHaveBeenCalledTimes(2) // one call per caption line
    expect(drawImage).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url') // object URL cleaned up
  })

  it('sizes the canvas to fit width/height plus room for the caption lines', async () => {
    await renderSvgToPngBlob(fakeSvg(), { captionLines: ['A', 'B', 'C'], width: 640, height: 300 })
    const [drawnImg, , drawnHeight] = drawImage.mock.calls[0] as [unknown, number, number]
    expect(drawnImg).toBeDefined()
    expect(drawnHeight).toBeGreaterThan(0) // caption offset pushes the chart image down, never to 0/negative
  })

  it('throws a plain, safe error (never the raw canvas/browser error) when the canvas context is unavailable', async () => {
    getContextSpy.mockReturnValue(null)
    await expect(renderSvgToPngBlob(fakeSvg(), { captionLines: [], width: 100, height: 100 })).rejects.toThrow('PNG oluşturulamadı')
  })

  it('still revokes the object URL even when rendering fails (no leaked blob: URL)', async () => {
    getContextSpy.mockReturnValue(null)
    await renderSvgToPngBlob(fakeSvg(), { captionLines: [], width: 100, height: 100 }).catch(() => undefined)
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url')
  })

  it('rejects with a safe error when canvas.toBlob produces no blob', async () => {
    toBlobSpy.mockImplementation(((cb: (blob: Blob | null) => void) => cb(null)) as never)
    await expect(renderSvgToPngBlob(fakeSvg(), { captionLines: [], width: 100, height: 100 })).rejects.toThrow('PNG oluşturulamadı')
  })
})

function readPngIhdr(bytes: Uint8Array) {
  const signature = Array.from(bytes.slice(0, 8))
  const width = new DataView(bytes.buffer, bytes.byteOffset + 16, 4).getUint32(0, false)
  const height = new DataView(bytes.buffer, bytes.byteOffset + 20, 4).getUint32(0, false)
  return { signature, width, height }
}

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  const buffer: ArrayBuffer = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
  return new Uint8Array(buffer)
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * TASK-027.55 R1 — no canvas/context mocking here at all. `Image` is still stubbed (the one
 * unavoidable seam, explained in the file-level comment above), but its `src` setter hands back a
 * real, painted `<canvas>` element instead of a plain object — `drawImage`/`fillRect`/`fillText`/
 * `toBlob` all run their genuine node-canvas implementation. The resulting Blob is read back with
 * `FileReader` (jsdom's real Blob→bytes path) and parsed as an actual PNG file: magic number, IHDR
 * width/height, and a byte size only real (non-trivial) image content could produce.
 */
describe('renderSvgToPngBlob — REAL rasterization (canvas devDependency, no context mocking)', () => {
  function stubImageWithRealCanvas(width: number, height: number, fillStyle: string) {
    function FakeImageCtor() {
      const canvas = document.createElement('canvas') as unknown as { width: number; height: number }
      canvas.width = width
      canvas.height = height
      const ctx = (canvas as unknown as HTMLCanvasElement).getContext('2d')!
      ctx.fillStyle = fillStyle
      ctx.fillRect(0, 0, width, height)
      let onloadFn: (() => void) | null = null
      Object.defineProperty(canvas, 'onload', {
        set(fn: (() => void) | null) {
          onloadFn = fn
        },
        get() {
          return onloadFn
        },
      })
      Object.defineProperty(canvas, 'src', {
        set(value: string) {
          void value
          setTimeout(() => onloadFn?.(), 0)
        },
      })
      return canvas
    }
    vi.stubGlobal('Image', FakeImageCtor as unknown as typeof Image)
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('produces a real, valid PNG file with the exact requested + caption-offset dimensions', async () => {
    stubImageWithRealCanvas(40, 30, '#0000ff')
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')

    const blob = await renderSvgToPngBlob(svg, { captionLines: ['Test Başlık', 'Arama: vardiya'], width: 40, height: 30 })

    expect(blob.type).toBe('image/png')
    const bytes = await readBlobBytes(blob)
    const { signature, width, height } = readPngIhdr(bytes)
    expect(signature).toEqual(PNG_SIGNATURE)
    expect(width).toBe(40)
    expect(height).toBe(30 + (2 * 18 + 16)) // chart height + this exact caption-offset formula
    expect(bytes.length).toBeGreaterThan(200) // a blank/broken PNG stub would be well under 100 bytes
  })

  it('the IHDR height grows with the number of caption lines (real math, not a stubbed constant)', async () => {
    stubImageWithRealCanvas(40, 30, '#0000ff')
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')

    const oneLine = await renderSvgToPngBlob(svg, { captionLines: ['Title'], width: 40, height: 30 })
    const threeLines = await renderSvgToPngBlob(svg, { captionLines: ['Title', 'Line 2', 'Line 3'], width: 40, height: 30 })

    const oneLineHeight = readPngIhdr(await readBlobBytes(oneLine)).height
    const threeLinesHeight = readPngIhdr(await readBlobBytes(threeLines)).height
    expect(threeLinesHeight).toBeGreaterThan(oneLineHeight)
  })

  it('never contains the caption text or a secret/token-shaped string as raw bytes (it is a real compressed PNG, not a text file)', async () => {
    stubImageWithRealCanvas(40, 30, '#0000ff')
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')

    const blob = await renderSvgToPngBlob(svg, { captionLines: ['password=super-secret-value'], width: 40, height: 30 })
    const bytes = await readBlobBytes(blob)
    const asLatin1 = Array.from(bytes)
      .map(b => String.fromCharCode(b))
      .join('')
    expect(asLatin1).not.toContain('super-secret-value')
  })
})

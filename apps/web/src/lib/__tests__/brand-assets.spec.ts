import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * TASK-027.61 — filesystem-level checks that don't fit a component test: the generated assets
 * actually exist and are valid PNGs, their filenames never carry the old brand name, and the two
 * original source files (repo root) are untouched — a requirement the task states explicitly
 * ("orijinal dosyalar değişmeden korunmalı").
 */
const REPO_ROOT = path.resolve(__dirname, '../../../../..')
const BRAND_DIR = path.join(REPO_ROOT, 'apps/web/public/brand')
const ICON_PATH = path.join(REPO_ROOT, 'apps/web/src/app/icon.png')

const OLD_BRAND_NAME_PATTERN = /botc|metdc/i // this platform's prior working names, per repo history

function isValidPng(filePath: string): boolean {
  const buf = readFileSync(filePath)
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  return buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
}

describe('brand assets (TASK-027.61)', () => {
  it.each(['metnex-logo.png', 'metnex-mark.png', 'metnex-login.png', 'metnex-firma.png'])('%s exists in public/brand and is a valid PNG', filename => {
    const filePath = path.join(BRAND_DIR, filename)
    expect(() => readFileSync(filePath)).not.toThrow()
    expect(isValidPng(filePath)).toBe(true)
  })

  it('app/icon.png exists and is a valid PNG', () => {
    expect(() => readFileSync(ICON_PATH)).not.toThrow()
    expect(isValidPng(ICON_PATH)).toBe(true)
  })

  it('no generated asset filename carries an old/prior brand name', () => {
    const names = ['metnex-logo.png', 'metnex-mark.png', 'metnex-login.png', 'metnex-firma.png', 'icon.png']
    for (const name of names) {
      expect(name).not.toMatch(OLD_BRAND_NAME_PATTERN)
    }
  })

  it('the original source files at the repo root are byte-identical to what they were before this task', () => {
    const originalTransparent = readFileSync(path.join(REPO_ROOT, 'metnex_transparent.png'))
    const originalHero = readFileSync(path.join(REPO_ROOT, 'metnex_png.png'))
    const originalFirma = readFileSync(path.join(REPO_ROOT, 'Metnex_Firma.png'))

    const copiedLogo = readFileSync(path.join(BRAND_DIR, 'metnex-logo.png'))
    const copiedHero = readFileSync(path.join(BRAND_DIR, 'metnex-login.png'))
    const copiedFirma = readFileSync(path.join(BRAND_DIR, 'metnex-firma.png'))

    expect(copiedLogo.equals(originalTransparent)).toBe(true)
    expect(copiedHero.equals(originalHero)).toBe(true)
    expect(copiedFirma.equals(originalFirma)).toBe(true)
  })
})

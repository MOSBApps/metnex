import { describe, expect, it } from 'vitest'
import { ACTIVE_LANGUAGES, SUPPORTED_LANGUAGES } from '../i18n-config'
import { dictionaries } from '../index'

describe('i18n infrastructure', () => {
  it('should define active languages and map them to supported language definitions', () => {
    expect(ACTIVE_LANGUAGES).toBeDefined()
    expect(ACTIVE_LANGUAGES.length).toBeGreaterThan(0)
    ACTIVE_LANGUAGES.forEach(langCode => {
      expect(SUPPORTED_LANGUAGES[langCode]).toBeDefined()
    })
  })

  it('should have direction defined for all supported languages', () => {
    expect(SUPPORTED_LANGUAGES['tr']?.dir).toBe('ltr')
    expect(SUPPORTED_LANGUAGES['en']?.dir).toBe('ltr')
    expect(SUPPORTED_LANGUAGES['ar']?.dir).toBe('rtl')
  })

  it('should contain matching keys across dictionaries', () => {
    const trKeys = Object.keys(dictionaries['tr']?.common ?? {})
    const enKeys = Object.keys(dictionaries['en']?.common ?? {})
    const arKeys = Object.keys(dictionaries['ar']?.common ?? {})

    expect(enKeys).toEqual(trKeys)
    expect(arKeys).toEqual(trKeys)
  })
})

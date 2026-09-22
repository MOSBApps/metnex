import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_1_TOKEN = 'header.eyJzdWIiOiJ1c2VyLTEifQ.sig' // { sub: 'user-1' }
const USER_2_TOKEN = 'header.eyJzdWIiOiJ1c2VyLTIifQ.sig' // { sub: 'user-2' }

let currentToken: string | null = USER_1_TOKEN

vi.mock('./api', () => ({
  getAccessToken: () => currentToken,
}))

function installLocalStorageStub() {
  const store = new Map<string, string>()
  const localStorageStub = {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  }
  ;(globalThis as unknown as { window: { localStorage: typeof localStorageStub } }).window = {
    localStorage: localStorageStub,
  }
  ;(globalThis as unknown as { localStorage: typeof localStorageStub }).localStorage = localStorageStub
  return store
}

describe('nav-storage', () => {
  beforeEach(() => {
    currentToken = USER_1_TOKEN
    installLocalStorageStub()
    vi.resetModules()
  })

  it('round-trips accordion open state for a given tenant', async () => {
    const { loadNavOpenState, saveNavOpenState } = await import('./nav-storage')
    expect(loadNavOpenState('tenant-a')).toEqual({})

    saveNavOpenState('tenant-a', { SAMPLE_MODULE: true })
    expect(loadNavOpenState('tenant-a')).toEqual({ SAMPLE_MODULE: true })
  })

  it('keeps state isolated per tenant so switching tenants never mixes state', async () => {
    const { loadNavOpenState, saveNavOpenState } = await import('./nav-storage')

    saveNavOpenState('tenant-a', { SAMPLE_MODULE: true })
    saveNavOpenState('tenant-b', { SAMPLE_MODULE: false, CUSTOMER_ADMIN: true })

    expect(loadNavOpenState('tenant-a')).toEqual({ SAMPLE_MODULE: true })
    expect(loadNavOpenState('tenant-b')).toEqual({ SAMPLE_MODULE: false, CUSTOMER_ADMIN: true })
  })

  it('keeps state isolated per user on the same tenant', async () => {
    const { loadNavOpenState, saveNavOpenState } = await import('./nav-storage')

    currentToken = USER_1_TOKEN
    saveNavOpenState('tenant-a', { SAMPLE_MODULE: true })

    currentToken = USER_2_TOKEN
    expect(loadNavOpenState('tenant-a')).toEqual({})
    saveNavOpenState('tenant-a', { SAMPLE_MODULE: false })

    currentToken = USER_1_TOKEN
    expect(loadNavOpenState('tenant-a')).toEqual({ SAMPLE_MODULE: true })
  })

  it('falls back to an empty state when storage holds corrupt JSON', async () => {
    const { loadNavOpenState } = await import('./nav-storage')
    ;(globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage.setItem(
      'metnex.nav.v1:user-1:tenant-a',
      'not-json{{',
    )
    expect(loadNavOpenState('tenant-a')).toEqual({})
  })

  it('returns an empty state when there is no active tenant', async () => {
    const { loadNavOpenState } = await import('./nav-storage')
    expect(loadNavOpenState('')).toEqual({})
  })
})

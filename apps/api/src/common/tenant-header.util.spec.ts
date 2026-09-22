import { BadRequestException } from '@nestjs/common'
import { requireTenantId } from './tenant-header.util'

describe('requireTenantId', () => {
  it('fails closed when the header is missing', () => {
    expect(() => requireTenantId(undefined)).toThrow(BadRequestException)
  })

  it('fails closed when the header is an empty string', () => {
    expect(() => requireTenantId('')).toThrow(BadRequestException)
  })

  it('returns the header value untouched when present', () => {
    expect(requireTenantId('tenant-1')).toBe('tenant-1')
  })
})

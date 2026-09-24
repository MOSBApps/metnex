import { assertReadOnlyStatement, buildSelectStatement, quoteIdentifier } from './sqlserver-query-builder'

const profile = (over: Record<string, unknown> = {}) =>
  ({
    catalogId: 'x',
    version: 1,
    physicalDatabase: 'MOSB ENERJI DB',
    sourceTimeZone: 'Europe/Istanbul',
    limitProfile: { timeoutMs: 1, maxRows: 5, maxColumns: 5, maxPayloadBytes: 1, maxRangeMs: 1, poolSize: 1, maxConcurrent: 1 },
    schema: 'S1',
    table: 'T1',
    dateColumn: 'D',
    timeColumn: 'D',
    columns: ['A', 'B'],
    ...over,
  }) as never

describe('sqlserver query builder', () => {
  it.each(['a]b', 'a;b', 'a b', "a'b", '', '1a', 'a-b', '[a]', 'a\nb'])('quoteIdentifier rejects %j', name => expect(() => quoteIdentifier(name)).toThrow())
  it('quotes a plain identifier', () => expect(quoteIdentifier('DEGER_1')).toBe('[DEGER_1]'))
  it('single DATETIME column orders by that column only', () => {
    const s = buildSelectStatement(profile(), { from: new Date(0), to: new Date(1000) })
    expect(s.text).toBe('SELECT TOP (@rowCap) [A], [B] FROM [S1].[T1] WHERE [D] >= @rangeFrom AND [D] < @rangeTo ORDER BY [D]')
    expect(s.params.rowCap).toBe(6)
  })
  it('refuses hostile identifiers reaching the builder', () => {
    expect(() => buildSelectStatement(profile({ schema: 'S1]; DROP TABLE x--' }), { from: new Date(0), to: new Date(1) })).toThrow()
    expect(() => buildSelectStatement(profile({ table: 'T1; DROP TABLE x' }), { from: new Date(0), to: new Date(1) })).toThrow()
    expect(() => buildSelectStatement(profile({ columns: ['A] FROM sys.objects--'] }), { from: new Date(0), to: new Date(1) })).toThrow()
  })
  it.each([
    'DELETE FROM [T]',
    'SELECT TOP (@rowCap) [A] FROM [T]; DROP TABLE x',
    'SELECT TOP (@rowCap) [A] INTO [Z] FROM [T]',
    'SELECT TOP (@rowCap) [A] FROM [T] WHERE 1=1 -- x',
    "SELECT TOP (@rowCap) [A] FROM [T] WHERE x = 'a'",
    'SELECT TOP (@rowCap) [A] FROM [T] WHERE EXEC sp_who',
  ])('assertReadOnlyStatement rejects %j', text => expect(() => assertReadOnlyStatement(text)).toThrow('STATEMENT_NOT_READ_ONLY'))
  it('identifiers that merely contain keywords are fine (they are bracketed)', () => {
    expect(() => assertReadOnlyStatement('SELECT TOP (@rowCap) [UPDATE_TIME] FROM [DELETE_LOG] WHERE [D] >= @rangeFrom')).not.toThrow()
  })
})

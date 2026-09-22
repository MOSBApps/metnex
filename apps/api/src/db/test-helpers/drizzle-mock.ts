/**
 * Test-only chainable mock for Drizzle's fluent query builder. Every builder method
 * (.from/.where/.orderBy/.limit/.values/.set/.returning/.onConflictDoUpdate/...) is a jest.fn()
 * that returns the same chainable (so calls can be asserted on), and the chainable itself is
 * thenable — `await` resolves to whatever result you configured. This lets a unit test stub
 * `db.select.mockReturnValue(chain(rows))` without replicating the exact chain shape a service
 * method happens to use.
 */
const CHAIN_METHODS = [
  'from',
  'where',
  'orderBy',
  'limit',
  'offset',
  'values',
  'set',
  'returning',
  'onConflictDoUpdate',
  'onConflictDoNothing',
  'leftJoin',
  'innerJoin',
  'groupBy',
  'for',
] as const

export interface Chain<T> {
  from: jest.Mock
  where: jest.Mock
  orderBy: jest.Mock
  limit: jest.Mock
  offset: jest.Mock
  values: jest.Mock
  set: jest.Mock
  returning: jest.Mock
  onConflictDoUpdate: jest.Mock
  onConflictDoNothing: jest.Mock
  leftJoin: jest.Mock
  innerJoin: jest.Mock
  groupBy: jest.Mock
  for: jest.Mock
  then: Promise<T>['then']
  catch: Promise<T>['catch']
}

/** Wrap a resolved value (array of rows, void, etc.) as a chainable, awaitable, spy-friendly query result. */
export function chain<T>(result: T): Chain<T> {
  const self = {} as Chain<T>
  for (const method of CHAIN_METHODS) {
    self[method] = jest.fn(() => self)
  }
  self.then = ((onfulfilled?: never, onrejected?: never) => Promise.resolve(result).then(onfulfilled, onrejected)) as Promise<T>['then']
  self.catch = ((onrejected?: never) => Promise.resolve(result).catch(onrejected)) as Promise<T>['catch']
  return self
}

export interface MockDb {
  select: jest.Mock
  insert: jest.Mock
  update: jest.Mock
  delete: jest.Mock
  transaction: jest.Mock
  execute: jest.Mock
}

/** A fresh mock `Db` — `transaction` runs the callback against this same mock by default. */
export function buildMockDb(): MockDb {
  const db: MockDb = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    transaction: jest.fn(async (fn: (tx: MockDb) => unknown) => fn(db)),
    execute: jest.fn(),
  }
  return db
}

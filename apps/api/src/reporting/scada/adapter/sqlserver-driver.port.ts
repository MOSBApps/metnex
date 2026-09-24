/**
 * What a real SQL Server driver wrapper must implement. TASK-027.64 ships NO driver and NO dependency
 * (the driver choice needs separate approval); specs supply a mock.
 *
 * Contract for implementers:
 *  - `database` is selected through the driver's connection option, never by concatenating it into `text`;
 *  - `params` are sent as bound parameters typed by `paramTypes`, never interpolated. Date/time values are NAIVE
 *    source-local strings (`YYYY-MM-DD` / `YYYY-MM-DDTHH:mm:ss.fff`): bind them as DATE / DATETIME2 without any
 *    time-zone conversion (no assumption about the driver's own date handling is made anywhere);
 *  - the connection uses a read-only credential from the secret store, never from the catalog;
 *  - honour `signal`: on abort cancel the request and release the connection.
 */
export interface SqlServerStatement {
  /** Exact physical database name from the catalog (may contain spaces); never normalised. */
  database: string
  /** SELECT text made only of bracket-quoted catalog identifiers and `@name` parameter markers. */
  text: string
  params: Readonly<Record<string, unknown>>
  /** Explicit type of every parameter, so the driver wrapper never has to infer one. */
  paramTypes: Readonly<Record<string, 'DATE' | 'DATETIME2' | 'INT'>>
}

export interface SqlServerDriver {
  run(statement: SqlServerStatement, signal: AbortSignal): Promise<{ rows: Record<string, unknown>[] }>
}

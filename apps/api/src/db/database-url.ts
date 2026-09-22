/**
 * Single source of truth for reading the database connection setting. There is deliberately no
 * default: a missing or malformed value must stop the process instead of silently pointing at
 * some other database (or at libpq/`PG*` defaults). Error messages never contain the value.
 */
export function requireDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.DATABASE_URL?.trim()
  if (!value) {
    throw new Error('DATABASE_URL is required')
  }
  let protocol: string
  try {
    protocol = new URL(value).protocol
  } catch {
    throw new Error('DATABASE_URL is invalid')
  }
  if (protocol !== 'postgresql:' && protocol !== 'postgres:') {
    throw new Error('DATABASE_URL is invalid')
  }
  return value
}

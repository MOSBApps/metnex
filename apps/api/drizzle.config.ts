import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'
import { requireDatabaseUrl } from './src/db/database-url'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle/migrations',
  dbCredentials: {
    url: requireDatabaseUrl(),
  },
})

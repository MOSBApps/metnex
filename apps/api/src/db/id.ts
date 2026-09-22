import { randomUUID } from 'crypto'

/** Application-side id generation, matching the previous Prisma `@default(uuid())` behavior
 * (Prisma generated ids client-side too — these columns have never had a DB-level default). */
export const generateId = () => randomUUID()

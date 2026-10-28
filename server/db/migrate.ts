import { useConfig } from '../config'
import { migrateDb } from './client'

// `npm run db:migrate`: applies pending migrations to DATABASE_URL.
await migrateDb(useConfig().databaseUrl)
console.log('Migrations applied.')

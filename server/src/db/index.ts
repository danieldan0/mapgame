import { config } from 'dotenv';
config();
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import path from 'path';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });
  console.log('Database migrations applied');
}

import { readFile } from 'node:fs/promises';
import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL gerekli.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  console.log('Veritabanı tabloları hazır.');
} finally {
  await client.end();
}

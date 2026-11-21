import 'dotenv/config';
import { Pool } from 'pg';

const auditUrlValue = process.env.AUDIT_DATABASE_URL;
if (!auditUrlValue) throw new Error('AUDIT_DATABASE_URL must be set');

const auditUrl = new URL(auditUrlValue);
const databaseName = decodeURIComponent(auditUrl.pathname.slice(1));
if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) throw new Error('AUDIT_DATABASE_URL has an invalid database name');

// Connect to PostgreSQL's maintenance database because the target database may not exist yet.
auditUrl.pathname = '/postgres';
const pool = new Pool({ connectionString: auditUrl.toString() });

async function main() {
  try {
    const result = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (result.rowCount === 0) {
      await pool.query(`CREATE DATABASE "${databaseName}"`);
      console.log(`Created audit database: ${databaseName}`);
    } else {
      console.log(`Audit database already exists: ${databaseName}`);
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error('Could not create audit database:', error);
  process.exitCode = 1;
});

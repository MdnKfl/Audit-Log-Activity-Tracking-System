import 'dotenv/config';
import { Pool } from 'pg';

// This setup command creates the separate database that Prisma migrations cannot create themselves.
const auditUrlValue = process.env.AUDIT_DATABASE_URL;
if (!auditUrlValue) throw new Error('AUDIT_DATABASE_URL must be set');

// Parse the configured target so its database name and host can be reused safely.
const auditUrl = new URL(auditUrlValue);
// Extract and restrict the database identifier before using it in CREATE DATABASE SQL.
const databaseName = decodeURIComponent(auditUrl.pathname.slice(1));
if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) throw new Error('AUDIT_DATABASE_URL has an invalid database name');

// Connect to PostgreSQL's maintenance database because the target database may not exist yet.
auditUrl.pathname = '/postgres';
const pool = new Pool({ connectionString: auditUrl.toString() });

/** Checks the PostgreSQL catalog and creates the target audit database only when absent. */
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

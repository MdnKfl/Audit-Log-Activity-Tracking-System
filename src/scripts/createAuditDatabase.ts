import 'dotenv/config';
import { Pool } from 'pg';

// This setup command creates the audit database and sets Nepal-time display defaults for both databases.
const mainUrlValue = process.env.DATABASE_URL;
if (!mainUrlValue) throw new Error('DATABASE_URL must be set');
const auditUrlValue = process.env.AUDIT_DATABASE_URL;
if (!auditUrlValue) throw new Error('AUDIT_DATABASE_URL must be set');

// Parse configured targets so database names can be validated before using them in SQL.
const mainUrl = new URL(mainUrlValue);
const auditUrl = new URL(auditUrlValue);
/** Extracts a conservative SQL identifier from a PostgreSQL connection URL. */
function getDatabaseName(url: URL, variableName: string) {
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error(`${variableName} has an invalid database name`);
  return name;
}
const mainDatabaseName = getDatabaseName(mainUrl, 'DATABASE_URL');
const auditDatabaseName = getDatabaseName(auditUrl, 'AUDIT_DATABASE_URL');

// Connect to each server's maintenance database because target databases may not exist yet.
mainUrl.pathname = '/postgres';
auditUrl.pathname = '/postgres';
const mainPool = new Pool({ connectionString: mainUrl.toString() });
const auditPool = new Pool({ connectionString: auditUrl.toString() });

/** Checks the PostgreSQL catalog and creates the target audit database only when absent. */
async function main() {
  try {
    const result = await auditPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [auditDatabaseName]);
    if (result.rowCount === 0) {
      await auditPool.query(`CREATE DATABASE "${auditDatabaseName}"`);
      console.log(`Created audit database: ${auditDatabaseName}`);
    } else {
      console.log(`Audit database already exists: ${auditDatabaseName}`);
    }

    // timestamptz keeps the real instant internally; PostgreSQL displays it in Nepal time.
    await mainPool.query(`ALTER DATABASE "${mainDatabaseName}" SET timezone TO 'Asia/Kathmandu'`);
    await auditPool.query(`ALTER DATABASE "${auditDatabaseName}" SET timezone TO 'Asia/Kathmandu'`);
    console.log('Configured database sessions to display timestamps in Asia/Kathmandu (+05:45).');
  } finally {
    await Promise.all([mainPool.end(), auditPool.end()]);
  }
}

void main().catch((error) => {
  console.error('Could not create audit database:', error);
  process.exitCode = 1;
});

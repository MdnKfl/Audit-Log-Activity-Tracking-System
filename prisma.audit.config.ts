import "dotenv/config";
import { defineConfig } from "prisma/config";

const auditDatabaseUrl = process.env["AUDIT_DATABASE_URL"];

if (!auditDatabaseUrl) {
  throw new Error("AUDIT_DATABASE_URL is not configured");
}

// Separate CLI configuration ensures audit migrations target AUDIT_DATABASE_URL only.
export default defineConfig({
  schema: "prisma/audit/schema.prisma",
  migrations: {
    path: "prisma/audit/migrations",
  },
  datasource: {
    url: auditDatabaseUrl,
  },
});
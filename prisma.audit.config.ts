import "dotenv/config";
import { defineConfig } from "prisma/config";

// Separate CLI configuration ensures audit migrations target AUDIT_DATABASE_URL only.
export default defineConfig({
  schema: "prisma/audit/schema.prisma",
  migrations: {
    path: "prisma/audit/migrations",
  },
  datasource: {
    url: process.env["AUDIT_DATABASE_URL"],
  },
});

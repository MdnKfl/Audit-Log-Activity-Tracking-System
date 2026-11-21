-- Docker runs this once for a fresh PostgreSQL volume so the separate audit database exists at startup.
CREATE DATABASE audit_logs_dev;

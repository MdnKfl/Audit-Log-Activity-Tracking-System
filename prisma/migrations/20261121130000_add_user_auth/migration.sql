-- Store password hashes and role names needed by JWT-protected user routes.
ALTER TABLE "users"
ADD COLUMN "password_hash" TEXT,
ADD COLUMN "role" VARCHAR(20) NOT NULL DEFAULT 'USER';

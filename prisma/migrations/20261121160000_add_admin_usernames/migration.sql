-- Admin accounts can sign in by unique username and do not need an email address.
ALTER TABLE "users" ADD COLUMN "username" VARCHAR(32);
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

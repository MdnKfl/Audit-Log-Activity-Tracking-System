-- Rename the old display name and add optional profile details without losing existing accounts.
ALTER TABLE "users" RENAME COLUMN "name" TO "full_name";

ALTER TABLE "users"
    ADD COLUMN "address" VARCHAR(500),
    ADD COLUMN "phone_number" VARCHAR(30);

ALTER TABLE "outbox_events"
ADD COLUMN "actor_id" UUID,
ADD COLUMN "actor_type" VARCHAR(20),
ADD COLUMN "resource_type" VARCHAR(100),
ADD COLUMN "resource_id" UUID,
ADD COLUMN "outcome" VARCHAR(20),
ADD COLUMN "metadata" JSONB,
ADD COLUMN "occurred_at" TIMESTAMPTZ(6);

UPDATE "outbox_events"
SET "actor_id" = NULLIF("payload" #>> '{actor,id}', '')::UUID,
    "actor_type" = "payload" #>> '{actor,type}',
    "resource_type" = "payload" #>> '{resource,type}',
    "resource_id" = NULLIF("payload" #>> '{resource,id}', '')::UUID,
    "outcome" = "payload" ->> 'outcome',
    "metadata" = "payload" -> 'metadata',
    "occurred_at" = NULLIF("payload" ->> 'occurredAt', '')::TIMESTAMPTZ;

ALTER TABLE "outbox_events"
ALTER COLUMN "actor_type" SET NOT NULL,
ALTER COLUMN "resource_type" SET NOT NULL,
ALTER COLUMN "outcome" SET NOT NULL,
ALTER COLUMN "occurred_at" SET NOT NULL;

ALTER TABLE "outbox_events" DROP COLUMN "payload";

-- Create the permanent audit store separately from user records and outbox delivery state.
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "actor_id" UUID,
    "actor_type" VARCHAR(20) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "resource_id" UUID,
    "outcome" VARCHAR(20) NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "audit_logs_event_id_key" ON "audit_logs"("event_id");
CREATE INDEX "audit_logs_event_type_occurred_at_idx" ON "audit_logs"("event_type", "occurred_at");
CREATE INDEX "audit_logs_actor_id_occurred_at_idx" ON "audit_logs"("actor_id", "occurred_at");
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs"("occurred_at");

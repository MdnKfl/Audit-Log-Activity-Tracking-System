# Audit Log Activity Tracking System

An asynchronous audit logging pipeline built with **Express (TypeScript)**, **BullMQ + Redis**, **Prisma 7** and **PostgreSQL**. It is a rebuild of the NestSMS audit log assignment on a different stack (NestJS replaced by Express, MariaDB replaced by PostgreSQL).

## Goal

Record who did what, to which entity, and when, without slowing down the user's request.

The API only drops an audit event into a Redis queue. A separate worker process validates the event and saves it to PostgreSQL. If saving fails, the job is retried with backoff. Duplicate events are rejected by a unique `eventId`.

## Architecture

```
business code ──▶ producer / AuditLogService ──▶ BullMQ queue (Redis)
                                                        │
                                                        ▼
                                              Worker (separate process)
                                              validate → insert → handle duplicates
                                                        │
                                                        ▼
                                              PostgreSQL (audit_logs table)
```

| Part | Role |
|---|---|
| Redis | Stores waiting jobs (temporary) |
| BullMQ | Queue logic: add jobs, retries, backoff, cleanup |
| Producer | Adds an event to the queue and returns immediately |
| Worker | Long-running process that takes jobs and saves them |
| PostgreSQL | Permanent source of truth |

### Key design decisions

- **Asynchronous:** the request only waits for Redis to store the job, not for the database write.
- **At-least-once delivery:** a job may run more than once (for example after a worker crash), so processing must be idempotent.
- **Idempotency:** `eventId` is a UUID with a unique constraint in PostgreSQL. A second insert fails with Prisma error `P2002`, which the worker treats as "already processed".
- **Validate at both ends:** the producer side validates the caller's input, and the worker validates again because the queue is a trust boundary.
- **Retries:** 3 attempts with exponential backoff (about 2s, then 4s). Invalid payloads throw `UnrecoverableError` and are not retried.

## Tech stack

| Area | Choice |
|---|---|
| Runtime | Node.js, TypeScript (run with `tsx`) |
| Framework | Express |
| Queue | BullMQ + ioredis + Redis 7 |
| Database | PostgreSQL 16 |
| ORM | Prisma 7 with the `@prisma/adapter-pg` driver adapter |
| Validation | zod |

## Project structure

```
.
├── docker-compose.yaml            # Postgres (host port 5433) and Redis (6379)
├── .env                           # DATABASE_URL, REDIS_URL (not committed)
├── prisma/
│   ├── schema.prisma              # AuditLog model
│   └── migrations/                # SQL migration history (commit this)
│       ├── 20261118051119_add_audit_log/migration.sql
│       └── migration_lock.toml    # locks the provider to PostgreSQL
├── prisma7.config.ts              # Prisma CLI config (reads DATABASE_URL)
├── generated/prisma/              # Generated Prisma Client (not committed)
└── src/
    ├── config/
    │   ├── redis.ts               # shared Redis connection
    │   └── prisma.ts              # Prisma client with the pg adapter
    ├── queues/
    │   └── audit-log.queue.ts     # queue name + default job options
    ├── modules/audit-log/
    │   └── audit-log.schema.ts    # zod schemas for input and full event
    ├── producer.ts                # test script that enqueues one event
    └── worker.ts                  # processes jobs and writes to Postgres
```

## Database model

Table `audit_logs` (Prisma model `AuditLog`):

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | primary key |
| `eventId` | UUID | **unique**, the idempotency key |
| `userId` | text, optional | who performed the action |
| `action` | text | for example `CLIENT_CREATED` |
| `entity` / `entityId` | text | what the action was done to |
| `description` | text, optional | |
| `metadata` | JSONB, optional | must never contain secrets |
| `ipAddress` / `userAgent` | text, optional | |
| `createdAt` | timestamptz | taken from the event's `occurredAt` |

Indexes (each matches an expected query pattern): `(userId, createdAt)`, `(action, createdAt)`, `(entity, entityId)`, `(createdAt)`, plus the unique index on `eventId`.

## Queue settings

Defined in `src/queues/audit-log.queue.ts` (queue name `nestsms-audit-logs`):

| Option | Value | Meaning |
|---|---|---|
| `attempts` | 3 | retry a failing job up to 3 times |
| `backoff` | exponential, 2000 ms | wait about 2s, then 4s between attempts |
| `removeOnComplete` | 1 day / 1000 jobs | keeps Redis memory bounded |
| `removeOnFail` | 7 days | failed jobs are kept for debugging |
| `jobId` | the event's `eventId` | prevents the same id being queued twice |

The worker runs with `concurrency: 5`.

## Setup

### Prerequisites

- Node.js
- Docker and Docker Compose

### 1. Start PostgreSQL and Redis

```bash
docker compose up -d
docker compose ps
```

PostgreSQL is published on host port **5433** (5432 was already in use on the development machine).

### 2. Environment variables

Create `.env`:

```env
DATABASE_URL="postgresql://nestsms:devpassword@localhost:5433/audit_dev"
REDIS_URL="redis://localhost:6379"
```

These are development-only credentials. Never commit `.env`.

### 3. Install dependencies

Pin the Prisma major version. At the time of writing, the npm `latest` tag of `prisma` points to Prisma 8, which has a different, incompatible setup.

```bash
npm install
npm i -D prisma@7 @types/pg
npm i @prisma/client@7 @prisma/adapter-pg pg dotenv
npx prisma --version      # should print 7.x
```

### 4. Create the table and generate the client

```bash
npx prisma migrate dev --name add_audit_log
npx prisma generate
```

If Prisma reports drift because the migrations folder and the database disagree, reset the **development** database (this deletes all its data):

```bash
npx prisma migrate reset
npx prisma migrate dev --name add_audit_log
```

### 5. Run the pipeline

```bash
npx tsx src/worker.ts      # terminal 1: stays running, waits for jobs
npx tsx src/producer.ts    # terminal 2: enqueues one test event and exits
```

Check the result:

```bash
docker compose exec postgres psql -U nestsms -d audit_dev -P pager=off \
  -c 'select "eventId", action, entity, "createdAt" from audit_logs;'
```

## Progress

| Item | Status |
|---|---|
| Docker Compose for PostgreSQL and Redis | Done |
| Node/TypeScript project and dependencies | Done |
| Prisma 7 setup (config, schema, generated client) | Done |
| `AuditLog` model with unique `eventId` and indexes | Done |
| Redis connection, queue and default job options | Done |
| Producer test script (events reach Redis) | Done |
| zod validation schemas | Done |
| Worker (validate, insert, duplicate handling, graceful shutdown) | Written, not yet run against the database |
| Migration `20261118051119_add_audit_log` created and applied (`audit_logs` table and indexes exist) | Done |
| End-to-end test: producer to Redis to worker to PostgreSQL row | Pending |

## Next steps

1. Run the worker and verify the first event travels Redis to the worker to a PostgreSQL row (the migration is already applied).
2. Test failure scenarios: worker stopped, invalid payload, PostgreSQL down, Redis down, duplicate `eventId`.
3. Build `AuditLogService.log()`: validate input, add `eventId`, `occurredAt`, IP and user agent, redact sensitive metadata, then enqueue.
4. Split the Redis connection: fail-fast for the producer, `maxRetriesPerRequest: null` for the worker.
5. Build the Express retrieval API with authentication, admin-only access, pagination and filters.
6. Add queue health reporting (`getJobCounts()`), tests, and API docs.

## Known limitations

- If Redis is down when an event is enqueued, the event can be lost. A transactional outbox would fix this.
- Two separate `log()` calls for the same real-world action produce two different `eventId` values, so they are not treated as duplicates.
- Audit rows appear shortly after the request finishes (eventual consistency), not instantly.

## Notes

- `prisma init` in newer versions may install AI agent skill folders (`.agents`, `.claude`, `.windsurf`, `skills-lock.json`). They are not needed and can be deleted.
- The VS Code Prisma extension bundles its own Prisma 7 CLI. It does not affect the version the project uses, which comes from `package.json`.
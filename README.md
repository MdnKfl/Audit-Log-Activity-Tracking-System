# Audit Log Activity Tracking System

An asynchronous audit logging pipeline built with **Express (TypeScript)**, **BullMQ + Redis**, **Prisma 7** and **PostgreSQL**. It is a rebuild of the NestSMS audit log assignment on a different stack (NestJS replaced by Express, MariaDB replaced by PostgreSQL).

## Goal

Build a reliable audit logging pipeline around business operations. The target design writes business data and an audit event to an outbox in the same transaction, publishes committed events through Redis, and stores them in a dedicated audit database.

The implementation follows the target flow: user mutations and outbox records commit together in the main database; a publisher sends committed records to Redis; a separate worker persists them in the audit database.

## Architecture

```
Client → Express API → User service ─┬─ transaction ─→ Main PostgreSQL database
                                     │                 ├─ users
                                     │                 └─ outbox_events
                                     │
                                     └─ Outbox publisher → Redis → Audit worker → Audit PostgreSQL database
                                                             queue       validate      audit_logs
```

| Part | Role |
|---|---|
| User API | CRUD endpoints split into controller, service, and repository layers |
| Backend application | Handles User CRUD and writes an audit event in the same transaction |
| Main database | Stores business users and pending/published outbox rows |
| Outbox publisher | Reads pending rows, queues them in Redis, then marks them published |
| Redis / BullMQ | Transports jobs and retries transient worker failures |
| Audit worker | Validates jobs and inserts them idempotently |
| Audit database | Separate PostgreSQL database containing permanent `audit_logs` records |
| JWT authentication | Verifies signed access tokens and loads the current role (`USER`, `ADMIN`, or `SUPERADMIN`) from the main database |

### Reliability decisions

- **Atomic business change and event:** the user write and outbox insert use one Prisma transaction.
- **Asynchronous persistence:** the API waits for the main database transaction, not for Redis or the audit database.
- **At-least-once delivery:** a job may run more than once (for example after a worker crash), so processing must be idempotent.
- **Idempotency:** each outbox event has a UUID `eventId`, used as the BullMQ job ID and a unique key in the audit database.
- **Validation:** the event is validated before the outbox insert and again in the worker.
- **Retries:** BullMQ retries transient persistence failures three times with exponential backoff. Invalid queue payloads are not retried; invalid outbox rows are marked `FAILED` for inspection.

## Tech stack

| Area | Choice |
|---|---|
| Runtime | Node.js and TypeScript (`tsx` loader, started with `node --import tsx`) |
| Framework | Express |
| Queue | BullMQ + ioredis + Redis 7 |
| Databases | Two PostgreSQL databases: `audit_dev` and `audit_logs_dev` |
| ORM | Prisma 7 with the `@prisma/adapter-pg` driver adapter |
| Validation | zod |

## Project structure

For a source-only guide that explains the purpose of each `src/` folder and how a request moves through the layers, see [src/README.md](src/README.md).

```text
.
├── docker-compose.yaml
├── prisma/
│   ├── main/schema.prisma          # users and outbox_events
│   ├── migrations/                 # main database migration history
│   ├── audit/schema.prisma         # audit_logs only
│   └── audit/migrations/           # audit database migration history
├── prisma7.config.ts               # main database
├── prisma.audit.config.ts          # audit database
├── generated/
│   ├── main-client/                 # generated Prisma client for users/outbox
│   └── audit-client/                # generated Prisma client for audit_logs
└── src/
    ├── app.ts
    ├── server.ts
    ├── routes/                      # Express route definitions
    ├── middleware/                  # JWT auth, request context, error handling
    ├── controllers/                 # HTTP request/response handling
    ├── services/                    # user, authentication, audit orchestration
    ├── repositories/                # main/outbox/audit database access
    ├── validators/                  # request validation schemas
    ├── security/                    # JWT and password helpers
    ├── infrastructure/              # Prisma clients, transaction, Redis queue
    ├── workers/                     # outbox publisher and audit consumer
    ├── types/                       # shared audit event contract
    ├── openapi/                     # Swagger/OpenAPI contract
    └── scripts/                     # database bootstrap and legacy audit transfer
```

## Database model

The main database contains `users` (UUID, full name, address, phone number, unique username, nullable unique email, password hash, role, created/updated timestamps) and `outbox_events`. The outbox mirrors the audit event columns in `audit_logs`—event ID/type, actor, resource, outcome, metadata, and occurrence time—with additional delivery status, creation/publication timestamps, and last error. The publisher maps those columns into the shared `AuditEvent` before sending it to Redis. The audit database stores the permanent `audit_logs` rows, uniquely keyed by event ID.

`generated/` contains Prisma-generated TypeScript clients for the two schemas. Application code imports these clients for typed database access. Do not edit generated files directly; `npm run db:generate` recreates them from the Prisma schemas. The obsolete single-client `generated/prisma/` directory has been removed.

The shared `AuditEvent` contract records `eventId`, `eventType`, actor, resource, outcome, optional metadata, and `occurredAt`. Metadata keys that look secret-bearing are removed before the event enters the outbox.

## Queue settings

Defined in `src/infrastructure/redis/audit.queue.ts` (queue name `nestsms-audit-logs`):

| Option | Value | Meaning |
|---|---|---|
| `attempts` | 3 | retry a failing job up to 3 times |
| `backoff` | exponential, 2000 ms | wait about 2s, then 4s between attempts |
| `removeOnComplete` | 1 day / 1000 jobs | keeps Redis memory bounded |
| `removeOnFail` | 7 days | failed jobs are kept for debugging |
| `jobId` | the event's `eventId` | deduplicates repeat publishes while the Redis job is retained |

The worker runs with `concurrency: 5`.

## Swagger UI

After starting the API, open [http://localhost:3000/api-docs](http://localhost:3000/api-docs). Use **Try it out** to call the endpoints. The raw OpenAPI document is at `/openapi.json`.

### Register and log in

Register a regular user at `POST /auth/register` with all five fields below. Registration creates a `USER` account but does not issue a token; log in next to receive a 15-minute JWT.

```json
{
  "fullName": "Avery Example",
  "address": "10 Main Street",
  "phoneNumber": "+1 555 0100",
  "email": "avery@example.com",
  "password": "a-strong-password"
}
```

Use `POST /auth/login` with either `email` or `username` and the password. Click **Authorize** in Swagger and enter the returned token. The API hashes passwords with bcryptjs; protected routes require a bearer token.

### Account roles

The bootstrap command creates the first `SUPERADMIN`. A superadmin can create multiple `ADMIN` accounts through `POST /users/admins`. Each admin requires a full name, a unique username, and a password; email, address, and phone number are optional for admin accounts. Admins can log in with their username and password.

```json
{
  "fullName": "Morgan Admin",
  "username": "morgan.admin",
  "password": "another-strong-password"
}
```

Admins can list and read users, update profile/login credentials, delete accounts, and reset passwords. Users can read their own profile. These reads and mutations are audited with the acting account's ID and role.

Only a `SUPERADMIN` can read permanent audit records through `GET /audit-logs`; those records come from the separate audit database. The main-database outbox is internal publisher storage and is not exposed as an audit-log endpoint. Superadmins can also inspect Redis queue counts through `GET /queue-stats`.

Registration and login successes/failures, admin creation attempts, rejected tokens, denied authorization, user reads and mutations, password resets, and audit-log reads are written to the main database outbox and later persisted in the audit database. Passwords and tokens are never included in audit metadata.

## HLD alignment

The outbox is part of the main application database, alongside `users`, so the business write and outbox insert can share one transaction. It should not live in a third database. The development setup uses two logical PostgreSQL databases on one local PostgreSQL server: `audit_dev` for users and outbox rows, and `audit_logs_dev` for permanent audit rows. The API, outbox publisher, Redis, and worker are separate processes. Production can place the databases and processes on separate servers and scale them independently.

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

Copy `.env.example` to `.env`:

```env
DATABASE_URL="postgresql://nestsms:devpassword@localhost:5433/audit_dev"
AUDIT_DATABASE_URL="postgresql://nestsms:devpassword@localhost:5433/audit_logs_dev"
REDIS_URL="redis://localhost:6379"
PORT="3000"
JWT_SECRET="replace-with-64-hex-characters-from-openssl-rand-hex-32"
BOOTSTRAP_ADMIN_EMAIL="admin@example.com"
BOOTSTRAP_ADMIN_PASSWORD="replace-with-a-strong-12-character-password"
```

Generate the JWT secret with `openssl rand -hex 32`. Set a strong bootstrap admin password. These are development-only credentials; never commit `.env`.

### 3. Install dependencies

```bash
npm install
```

### 4. Create databases and apply migrations

```bash
npm run db:setup
```

This generates both Prisma clients, creates `audit_logs_dev` if needed, applies the audit schema, copies any legacy audit rows from the old main database, then applies the main schema migrations. These migrations add the user/profile and admin-username fields and remove the old audit table after its rows are copied. The PostgreSQL init script creates the audit database on fresh Docker volumes; `db:setup` also handles existing volumes.

Stop any older API or worker processes before running this migration. The setup copies existing `audit_logs` rows into the audit database before dropping the legacy table from the main database; the copy is idempotent by `eventId`.

### 5. Create the first superadmin

Set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` in `.env`, then run:

```bash
npm run auth:bootstrap-admin
```

This creates or promotes that account to `SUPERADMIN` and sets its password. Running it again resets that superadmin's password to the configured value. Administrators can manage regular users; only the superadmin can inspect the audit trail.

### 6. Run the services

```bash
npm run api                 # HTTP API and Swagger UI
npm run outbox:publisher    # separate terminal: main DB outbox → Redis
npm run audit:worker        # separate terminal: Redis → audit database
```

The API and publisher need `DATABASE_URL`; the API and worker need `AUDIT_DATABASE_URL`; all three processes need `REDIS_URL`.

In Swagger, log in with the bootstrap superadmin account at `POST /auth/login` and click **Authorize** with the returned token. Use `POST /users/admins` to create an admin account, or `POST /auth/register` to register a regular user. An admin can also create regular users through `POST /users`. Successful user mutations create a `PENDING` outbox row in the same transaction as the user change. The publisher sends it to Redis and marks it `PUBLISHED`; the worker then writes it into `audit_logs`.

## Progress

| Item | Status |
|---|---|
| Docker Compose for PostgreSQL and Redis | Done |
| Node/TypeScript project and dependencies | Done |
| Prisma 7 setup (config, schema, generated client) | Done |
| Layered User CRUD with transactional outbox writes | Implemented |
| Outbox publisher and BullMQ queue | Implemented |
| Separate audit Prisma schema/database and idempotent worker | Implemented |
| Swagger UI and OpenAPI contract | Implemented |
| Public registration, JWT login by email/username, password hashing, and authentication audit events | Implemented |
| Superadmin provisioning of multiple audited admin accounts | Implemented |
| Legacy audit row copy before removing the main database table | Included in `db:setup` |

## Next steps

1. Add alerting and operational handling for outbox rows marked `FAILED` and jobs exhausted after retries.
2. Add refresh-token rotation or an identity provider if longer sessions are needed.
3. Add retention and archival policies for audit records.

## Known limitations

- Audit rows are eventually consistent: they appear after the request commits, publisher runs, and worker persists the event.
- Concurrent publishers can enqueue the same event more than once. BullMQ job IDs and the audit database's unique event ID make this safe.
- `FAILED` outbox rows need operator inspection; there is no automatic repair UI yet.
- JWTs expire after 15 minutes; there is no refresh-token flow yet.
- The bootstrap superadmin command can reset the configured superadmin's password; protect `.env` and run the command deliberately.

## Notes

- `prisma init` in newer versions may install AI agent skill folders (`.agents`, `.claude`, `.windsurf`, `skills-lock.json`). They are not needed and can be deleted.
- The VS Code Prisma extension bundles its own Prisma 7 CLI. It does not affect the version the project uses, which comes from `package.json`.

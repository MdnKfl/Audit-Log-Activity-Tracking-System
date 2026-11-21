# How to read the source code

This folder is split by responsibility. A request normally moves through **route → middleware → controller → service → repository → database**. Audit events created by a business operation then move through **outbox → publisher → Redis → audit worker → audit database**.

## Folders and when to use them

| Folder | Why it exists | Used in this part of the application |
|---|---|---|
| `routes/` | Declares HTTP paths, methods, and middleware order. | Express receives a request and decides which middleware/controller handles it. Keep SQL and business rules out of routes. |
| `middleware/` | Holds code that runs between the route and controller, or after a request fails. | JWT authentication/role checks, per-request metadata, and consistent error responses. |
| `controllers/` | Adapts Express requests and responses to service calls. | Reads params/body, gets the authenticated actor, calls a service, and chooses an HTTP status. |
| `services/` | Coordinates business rules and workflows. | User CRUD, login/registration, audit event creation, and audit-log queries. Transactions start here when multiple writes must be atomic. |
| `repositories/` | Keeps database queries in one place. | Reads/writes business users, the main database outbox, or permanent audit records. |
| `validators/` | Defines Zod schemas for values arriving from HTTP requests. | Rejects malformed user data and audit-log query parameters before services use them. |
| `types/` | Defines shared TypeScript types and runtime event schemas. | `audit.types.ts` is the event contract used by the API, publisher, and worker. It is the closest thing here to a shared interface between processes. |
| `security/` | Wraps authentication primitives. | Signs/verifies JWT access tokens and hashes/verifies passwords. It does not decide which routes a role may use. |
| `infrastructure/database/` | Creates database clients and transaction support. | Connects to the main database, the separate audit database, and runs main-database transactions. |
| `infrastructure/redis/` | Creates the Redis connection and BullMQ queue. | Shared queue setup used by the publisher, worker, API operational endpoints, and shutdown handlers. |
| `workers/` | Runs background processes outside the HTTP request lifecycle. | `outbox.publisher.ts` sends committed outbox rows to Redis; `audit.worker.ts` stores queue events permanently. |
| `openapi/` | Describes the HTTP API for Swagger UI. | Keeps endpoint/request/response documentation separate from route implementation. |
| `scripts/` | Holds explicit one-off setup and migration commands. | Creates the audit database, prepares the initial superadmin, and copies audit rows from the legacy schema. |

## Follow one request

For example, `PATCH /users/:id` is registered in `routes/user.route.ts`. Authentication and the admin check run first from `middleware/auth.middleware.ts`. `controllers/user.controller.ts` extracts the user ID and actor, then calls `services/user.service.ts`. The service validates input and starts a transaction. `repositories/user.repository.ts` updates the user and `repositories/outbox.repository.ts` inserts the audit event using that same transaction client. If either write fails, both roll back.

## Follow one audit event

`services/audit.service.ts` creates the event using the shared schema from `types/audit.types.ts`, adds safe request metadata, and removes secret-looking metadata keys. `repositories/outbox.repository.ts` stores it in the main database with the business change. `workers/outbox.publisher.ts` validates and sends it to the BullMQ queue. `workers/audit.worker.ts` validates it again and calls `repositories/audit.repository.ts`, which writes to the separate permanent audit database. Event IDs make retries safe against duplicate audit rows.

## Account roles

- `USER` accounts register through `POST /auth/register` and use email/password login.
- A `SUPERADMIN` creates one or more `ADMIN` accounts through `POST /users/admins`. Admins can log in with their unique username and password; email is optional for an admin account.
- `ADMIN` accounts manage regular user records. Their own actions are attributed by actor ID and role in audit metadata.
- Only `SUPERADMIN` can read `/audit-logs`. The query uses the audit database repository. Outbox rows remain internal to the publisher and are not exposed as an audit-log endpoint.

## Shared types versus validation

- Use `types/` for contracts that multiple parts/processes must agree on, especially the queued `AuditEvent`.
- Use `validators/` for API input rules. These schemas protect the HTTP boundary and may evolve separately from the queue event contract.
- Use `middleware/` for reusable HTTP behavior such as JWT authentication and authorization. Do not put domain workflows there.
- Use `services/` for workflows that coordinate multiple repositories or apply business decisions.

## Important entry points

- `app.ts` wires middleware and routers; `server.ts` starts the HTTP listener and closes connections on shutdown.
- `routes/` shows the available HTTP endpoints and the roles allowed to call them.
- `services/` shows what each endpoint actually does.
- `workers/` are started separately with the `outbox:publisher` and `audit:worker` npm scripts.
- Prisma-generated clients live in the top-level `generated/` folder. They are build output; update the Prisma schemas and run `npm run db:generate` instead of editing generated code.

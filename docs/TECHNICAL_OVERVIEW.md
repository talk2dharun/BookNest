# BookNest: technical overview for evaluators

This document explains what BookNest does, how its frontend, API, database, and live-update channel fit together, why important implementation choices were made, and how to inspect the behavior. It complements the setup instructions and requirement map in the [root README](../README.md).

## 1. Product summary

BookNest is a personal reading tracker with social library features. A registered reader can:

- Maintain a private catalog of books, reading statuses, ratings, notes, and page progress.
- Organize books into named shelves.
- Share a shelf with another registered reader as an **EDITOR** or **VIEWER**.
- Lend a physical book to another registered reader and record its return.
- See relevant activity, dashboard summaries, and live changes made by other people.

The central product distinction is that a book has one owner, while a shelf is a collection of links to books. Sharing a shelf shares access to the collection; it does not transfer ownership of the books.

## 2. Technology stack

Versions below are the versions pinned in the respective `package.json` files or deployment configuration.

| Area | Technology | Version / configuration | Purpose |
|---|---|---|---|
| Runtime | Node.js | 24+; Docker images use `node:24-alpine` | Runs the frontend and API; required by the project setup. |
| Language | TypeScript | Frontend 5.9.3; backend 6.0.2 | Typed application code across both applications. |
| Frontend framework | Next.js | 16.4.3, App Router | Page routing, layouts, and frontend build and development server. |
| UI library | React / React DOM | 19.3.0 | Renders the browser interface and manages interactive UI state. |
| Styling | Tailwind CSS | 4.3.3 | Utility styling, with project-specific CSS variables and components in `globals.css`. |
| Frontend build integration | `@tailwindcss/turbopack` | 4.3.3 | Tailwind/Turbopack development-build integration. |
| API-data state | TanStack React Query | 5.90.21 | Fetches and caches API data; socket events invalidate queries so views reload current server state. |
| Frontend live transport | Socket.IO client | 4.8.4 | Connects the authenticated browser to the API's Socket.IO gateway. |
| Backend framework | NestJS | 12.3.2 | Modular HTTP API, dependency injection, controllers, providers, guards, and WebSocket integration. |
| HTTP adapter | NestJS Express platform | 12.3.2 | Serves the REST API using Nest's Express adapter. |
| API documentation | NestJS Swagger | 12.0.5 | Generates OpenAPI documentation at `/api/docs`. |
| Validation | `class-validator` and `class-transformer` | 0.15.1 and 0.5.1 | Validates and transforms request DTOs at the API boundary. |
| Database | PostgreSQL | 18 Alpine image in Docker Compose | Persistent relational data, foreign keys, indexes, transactions, and the active-lending constraint. |
| ORM and generated client | Prisma | 7.10.1 | Relational schema, migrations, typed database operations, client generation, and seeding. |
| PostgreSQL adapter | `@prisma/adapter-pg` | 7.10.1 | Connects the Prisma client to PostgreSQL using Prisma's driver-adapter setup. |
| Authentication | NestJS JWT and `bcrypt` | JWT module 12.0.3; bcrypt 6.0.0 | Signs/verifies access tokens and hashes passwords. |
| Live transport server | Socket.IO | 4.8.4 | Authenticated realtime events and server-managed user/shelf rooms. |
| HTTP hardening and browser support | Helmet, `cookie-parser`, CORS | Helmet 8.3.0; cookie-parser 1.4.7 | Security-related HTTP headers, refresh-cookie parsing, and credentialed frontend/API requests. |
| Request throttling | NestJS Throttler | 6.7.1 | Applies a global request limit and a stricter authentication-controller limit. |
| Backend test runner | Vitest | 4.1.2 | Runs backend unit and API end-to-end tests. |
| HTTP test client | Supertest | 7.3.1 | Sends requests to the in-process Nest application in API end-to-end tests. |
| Container orchestration | Docker Compose | Compose configuration in `docker-compose.yml` | Starts PostgreSQL, then the migrated/seeded API, then the frontend. |
| JavaScript package manager | npm | Lockfiles committed separately for frontend and backend | Reproducible installation with `npm ci`. |

### Supporting development tools

- **ESLint 9.39.5** and `eslint-config-next` check frontend code.
- **oxlint 1.90.0** and `oxlint-tsgolint` check backend source and tests.
- **Prettier 3.9.10** is available for formatting backend source and tests.
- **NestJS CLI 12.0.11** builds and starts the API.
- **TypeScript type definitions** are installed for Node.js, React, Express, cookies, bcrypt, and Supertest where needed.
- **`dotenv`** loads environment configuration for Prisma's configuration file.

There is no separate microservice framework, message broker, frontend state-management library, or UI component library in the declared stack. The API is a modular monolith; TanStack Query handles remote/server data, and React context handles the signed-in user state.

## 3. Architecture at a glance

```text
┌───────────────────────────────────── Browser ──────────────────────────────────────┐
│ Next.js App Router + React                                                         │
│                                                                                     │
│ Pages ── REST calls ──> API helper ── access JWT in memory                          │
│   ▲                            │                                                    │
│   └──── TanStack Query <───────┘                                                    │
│              ▲                                                                      │
│              └──── Socket.IO client listens for events and invalidates queries      │
└───────────────────────────┬──────────────────────────┬─────────────────────────────┘
                            │ HTTP/JSON + cookie       │ authenticated Socket.IO
                            ▼                          ▼
┌──────────────────────────────────── NestJS API ────────────────────────────────────┐
│ Global JWT guard → controller → domain service → Prisma                             │
│ Auth · Books · Shelves · Lending · Dashboard · Activity · Realtime · Users          │
│                                            │                                        │
│                                            └──── emit to authorized rooms           │
└────────────────────────────────────────────┬───────────────────────────────────────┘
                                             │ Prisma PostgreSQL adapter
                                             ▼
                                    ┌─────────────────┐
                                    │   PostgreSQL    │
                                    │ schema + SQL    │
                                    │ constraints     │
                                    └─────────────────┘
```

In the Compose deployment the three runtime containers are `db`, `backend`, and `frontend`. The database health check gates backend startup; the backend health check gates frontend startup. The API entrypoint deploys migrations and runs the seed before starting Nest.

## 4. Application structure and implementation approach

### Frontend

The Next.js App Router organizes the interface into routes and shared layouts:

- `/login` and `/register` are the public account pages.
- The authenticated route group contains the dashboard, books, an individual book, shelves, an individual shelf, shared shelves, and borrowed books.
- Shared UI concerns live in components such as the application shell, query/auth providers, status badge, query-state display, and live-update listener.
- `src/lib/api.ts` is the central fetch/API helper. It attaches the in-memory bearer token, includes credentials for cookie-based refresh, converts API errors into a shared `ApiError`, and retries an eligible failed request once after refreshing the session.
- TanStack Query stores server responses. On a relevant realtime event, the client invalidates queries and lets the API provide the canonical updated state rather than attempting to maintain a second copy of domain rules in event payloads.
- React context exposes the current user, initial-session readiness, and login/register/logout actions.
- Tailwind is imported in the global stylesheet. Project CSS variables and a small set of reusable button, form-field, status-badge, and error styles define the visual vocabulary.

### Backend

The NestJS backend is a **modular monolith**, not a set of independently deployed services. Feature modules group HTTP controllers with services and DTOs:

- `AuthModule` � register, login, refresh, logout, and the current-user endpoint.
- `UsersModule` — user lookup and public-user projections.
- `BooksModule` — owned-book CRUD, filtering, progress, and book response shaping.
- `ShelvesModule` — shelf CRUD, membership, sharing, and role enforcement.
- `LendingModule` — lending, return, and borrowed-book views.
- `DashboardModule` and `ActivityModule` — personalized summaries and feed.
- `RealtimeModule` — Socket.IO gateway and event/room operations.
- `PrismaModule` — shared Prisma/PostgreSQL connection and lifecycle.

Controllers translate HTTP routes and DTOs into service calls. Services own domain behavior and data access. This keeps validation at the request boundary and core rules out of UI-only code. The backend also has shared guards, decorators, exception handling, and application configuration.

### Request validation and error handling

The configured global `ValidationPipe` transforms DTO input, removes no unknown input silently (`whitelist: true` plus `forbidNonWhitelisted: true`), and rejects invalid requests. Validation messages are returned with field details. A global exception filter standardizes API exception responses. HTTP security headers, cookie parsing, credentialed CORS, and shutdown hooks are configured centrally.

The global throttle permits at most 100 requests per 60 seconds under its configured default. The authentication controller has a stricter limit of 10 requests per 60 seconds; `/auth/me` opts out of that controller-level limit.

## 5. Data model and relational design

The Prisma schema is in `backend/prisma/schema.prisma`. Prisma 7 reads its connection URL from `backend/prisma.config.ts`, and the Prisma client is generated into `backend/src/generated/prisma`.

| Entity | What it represents | Important relationships / rules |
|---|---|---|
| `User` | Registered account | Owns books and shelves; can be a shelf collaborator, lender, borrower, activity actor, or activity recipient. Email is unique and normalized to lowercase in application code. |
| `Book` | A book record in one user's personal library | Has an owner, status, optional total pages/rating/notes, current page, and finish timestamp. A book can appear on many shelves and have lending history. |
| `Shelf` | A named collection owned by one user | Connected to books through `ShelfBook`; has collaborator rows in `ShelfShare`. |
| `ShelfBook` | A book-to-shelf membership, including who added it and when | Composite primary key `(shelfId, bookId)` prevents duplicate membership. Removing the link does not delete the book. |
| `ShelfShare` | A user's access to a shelf | Unique `(shelfId, userId)`; stored roles are `EDITOR` and `VIEWER`. The shelf owner is treated as `OWNER` by the access service rather than by a share row. |
| `Lending` | A book loan from its owner to another registered user | Retains a record after return using `returnedAt`; lender and borrower are separate user relations. |
| `RefreshToken` | A refresh session record | Stores an HMAC hash, expiry and revocation time—not the raw refresh token. |
| `Activity` | A domain event rendered as an activity item | Records event type, actor, optional book/shelf/target user, message, and time. |
| `ActivityRecipient` | A user's membership in an activity feed item | Composite primary key `(activityId, userId)`; recipient-oriented index supports feed lookup. |

Important enums are `BookStatus` (`WANT_TO_READ`, `READING`, `FINISHED`), `ShelfRole` (`EDITOR`, `VIEWER`), and `ActivityType` (book added/status changed/lent/returned and shelf shared/role changed/collaborator removed).

### Why the database is part of the correctness model

Application checks make failures understandable; relational constraints protect invariants even if requests race:

- Foreign keys and unique constraints express ownership relationships and prevent duplicate emails, shelf shares, and shelf membership.
- Cascades remove dependent join/share/token rows when their parent is deleted; deleting a shelf does not delete its books.
- Activity references to a deleted book, shelf, or target user can be set to null so the activity row can survive.
- One active loan per book is enforced by a PostgreSQL partial unique index:

  ```sql
  CREATE UNIQUE INDEX "Lending_bookId_active_key"
  ON "Lending" ("bookId")
  WHERE "returnedAt" IS NULL;
  ```

  Prisma schema does not express this conditional uniqueness directly in the current setup, so the SQL index is maintained in the migration. Returned loan rows remain as history and do not prevent a later loan.

## 6. Main behavior and domain rules

### Books and reading progress

- Book reads and writes are scoped to the signed-in owner. An inaccessible book is not exposed as another user's resource.
- The list endpoint supports search/filter/sort and pagination; null sort values are placed last and the ID acts as a stable tiebreaker.
- Progress has a dedicated `PATCH /books/:id/progress` operation rather than being an unrestricted field in general book updates.
- Progress is owner-only and requires `READING` status. It rejects missing total-page information, negative or non-integer page values, and a current page greater than total pages with a `400` response.
- Reaching the total page count automatically finishes the book, records `finishedAt`, and creates the corresponding status-change activity.

### Shelves and collaboration

`ShelfAccessService.requireRole(shelfId, userId, minimumRole)` is the shared permission check:

| Role | Read shelf | Add books | Remove books | Share/change roles/rename/delete |
|---|---:|---:|---:|---:|
| `VIEWER` | Yes | No | No | No |
| `EDITOR` | Yes | Books they own | Any book from the shelf | No |
| `OWNER` | Yes | Yes | Yes | Yes |

The UI can hide controls that a user cannot use, but it is not the security boundary. The API independently enforces the role for every operation. A missing shelf and a shelf the caller is not allowed to see both return `404`; a visible shelf with insufficient permission returns `403`. This avoids revealing the existence of an inaccessible shelf while still explaining an insufficient role to a collaborator who can see it.

### Lending and returns

- A lender can lend an owned physical book to an existing registered user by email; self-lending is rejected.
- A borrower can view the book in their borrowed list but does not become its owner and cannot edit the owner's book.
- The owner marks the book returned. The lending record is retained with `returnedAt`, and the partial unique index then permits a future active loan.
- The application checks for an active loan and maps a uniqueness conflict to a `409` response. The database index is the final protection against concurrent double-lending.

### Dashboard and activity

The dashboard endpoint combines per-user summaries (including status counts, finished-this-year and rated-book information, shelf/book information, and active loans/shares) with a recent activity feed. Activity rows have explicit recipients, enabling each user's feed to be queried independently.

## 7. Authentication and security approach

### Browser/API token lifecycle

1. Register or login returns a short-lived access JWT and sets a refresh cookie.
2. The access JWT is kept in a JavaScript module variable in the frontend—not in `localStorage` or a persistent browser store—and is sent as `Authorization: Bearer ...`.
3. The refresh token is generated from cryptographically random bytes. The browser receives it only as an `httpOnly` cookie scoped to `/auth`, with `SameSite` and `Secure` settings controlled by environment configuration.
4. The database stores an HMAC-SHA-256 of the refresh token, keyed by the refresh secret, with its expiry and revocation time.
5. On refresh, the presented token is checked, its old database record is revoked, and a new refresh cookie/access token is issued. Reuse of an already-revoked token is treated as possible theft and revokes remaining refresh sessions for that user.
6. If an API request receives `401`, the frontend coordinates refresh through one in-flight promise and retries that request at most once. If refresh fails, it clears the in-memory session and returns the user to the unauthenticated state.
7. Logout revokes the presented refresh record where possible and clears the cookie. It is intentionally callable without a valid access token so an expired session can still be cleaned up.

### Additional protections and boundaries

- Passwords are hashed with bcrypt cost 12; the API selects public-user fields so a password hash is not returned.
- Login uses the same error message for an unknown email and a bad password.
- A global JWT guard authenticates protected HTTP routes and loads the current user; public routes are explicitly marked.
- DTO validation rejects unexpected fields instead of silently accepting them.
- Helmet, a configured frontend CORS origin, request throttling, and cookie settings are centralized in application configuration.
- Shelf permissions and book ownership are checked in the API services; hiding a button in React is only a usability measure.
- The Swagger docs route is intentionally accessible without an application access token.

The values used by Docker Compose for JWT secrets and cookies are **local-development defaults**. They are not production secrets. A production deployment must provide distinct, high-entropy JWT secrets, use HTTPS and a secure cookie configuration, and set the allowed frontend origin correctly.

## 8. Realtime update methodology

HTTP remains the source of truth for reads and writes. Socket.IO is used to promptly tell relevant connected clients that data has changed:

1. The browser connects with its access JWT in `handshake.auth.token`.
2. Socket.IO middleware verifies the token and confirms the user exists before accepting the socket.
3. The server—not the client—joins the connection to `user:{userId}` and the rooms of shelves the user owns or can access.
4. A successful book, shelf, lending, or collaboration operation emits the corresponding event to an appropriate user or shelf room.
5. The frontend listens for those events and invalidates TanStack Query data. The subsequent HTTP read returns the authoritative state.
6. When collaboration is added or removed, the server updates connected sockets' room membership; a removed collaborator should no longer receive that shelf's events.
7. On reconnect, the client refreshes cached views. A disconnect banner communicates that live delivery is temporarily unavailable; normal HTTP operations remain usable.

Events include `lending:created`, `lending:returned`, `shelf:book-added`, `shelf:book-removed`, `shelf:shared`, `shelf:role-changed`, `shelf:access-removed`, and `activity:new`. This avoids periodic polling and avoids trusting client-selected room names.

## 9. API surface

All routes below are served by the NestJS API, normally at `http://localhost:4000`. Protected routes require a bearer access token unless stated otherwise.

| Area | Routes | Capability |
|---|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` | Account creation, login, session rotation/cleanup, and current user. Register/login/refresh/logout are public routes; `/auth/me` is protected. |
| Books | `POST /books`, `GET /books`, `GET /books/:id`, `PATCH /books/:id`, `DELETE /books/:id`, `PATCH /books/:id/progress` | Owned-library CRUD, list querying, and validated progress logging. |
| Shelves | `POST /shelves`, `GET /shelves`, `GET /shelves/shared-with-me`, `GET /shelves/:id`, `PATCH /shelves/:id`, `DELETE /shelves/:id` | Owned/shared shelf discovery, details, and owner shelf management. |
| Shelf membership | `POST /shelves/:id/books`, `DELETE /shelves/:id/books/:bookId` | Add or remove a book link under the caller's shelf role. |
| Shelf shares | `POST /shelves/:id/shares`, `PATCH /shelves/:id/shares/:userId`, `DELETE /shelves/:id/shares/:userId` | Owner-managed collaboration and role changes. |
| Lending | `POST /books/:id/lend`, `POST /books/:id/return`, `GET /books/borrowed` | Lend, return, and list books borrowed from other users. |
| Dashboard/activity | `GET /dashboard`, `GET /activity` | Signed-in user's aggregate dashboard and activity feed. |
| Health/docs | `GET /health`, `GET /api/docs` | Health check and generated Swagger/OpenAPI UI. |

Use the Swagger UI to inspect request DTOs and response shapes. The root `api.http` file also contains ready-to-run REST examples, including an action rejected for a viewer.

## 10. Testing and verification

### Current automated checks

- Backend unit tests use Vitest. The API critical-path suite is in `backend/test/critical-path.e2e-spec.ts` and uses Nest's testing module plus Supertest against a running test database.
- The critical paths exercise register/login, credential errors, authenticated access, refresh rotation and token reuse, progress validation and auto-finish, editor/viewer permissions, lending restrictions, duplicate active lending, return, and re-lending.
- The API end-to-end Vitest config is `backend/vitest.config.e2e.ts`; the configured test database is separate from the development database (`DATABASE_URL_TEST`).
- Backend linting is available through `npm --prefix backend run lint`; frontend linting through `npm --prefix frontend run lint`.
- Backend and frontend production builds are available through root scripts `npm run build:backend` and `npm run build:frontend`.
- API end-to-end tests can be run with `npm run test:e2e` from the project root (or `npm --prefix backend run test:e2e`).

The automated API suite verifies HTTP behavior and database-backed domain rules. A browser automation suite for the complete UI flow and a dedicated automated Socket.IO handshake/event test are not currently part of the project; the latter is listed as future work in the root README.

### Suggested evaluation path

1. **Start the app** using the root README's Compose instructions and confirm `GET /health` reports both the API and database as healthy.
2. **Inspect `/api/docs`** to see the documented HTTP surface and the distinction between public and authenticated operations.
3. **Create two accounts** or use the seeded test accounts from the README in two browser profiles.
4. **Create a book and a shelf**, add the book to that shelf, and share the shelf with the second account as `EDITOR`.
5. **Verify authorization twice:** use the UI to observe available actions, then attempt a forbidden viewer action through `api.http` or Swagger and confirm the API rejects it.
6. **Test a live collaboration update:** keep both accounts on the shelf and add a book as the editor; observe the other browser update without a manual refresh.
7. **Test progress and lending:** complete a reading book to its total page count, lend another book, verify it appears in the borrower's list, then return it.
8. **Run `npm run test:e2e`** to exercise the backend critical paths, including refresh-token reuse, invalid progress, role enforcement, and active-loan uniqueness.

The five-minute browser demonstration is also available in [DEMO_SCRIPT.md](./DEMO_SCRIPT.md), and a concise file-by-file explanation is in [WALKTHROUGH.md](./WALKTHROUGH.md).

## 11. What is distinctive about this implementation

The value is in how several ordinary technologies are combined to enforce domain rules end-to-end:

1. **A book is owned once but can be curated in many shared shelves.** The `ShelfBook` join row tracks who added the link, while shelf deletion/removal does not erase the underlying book. Editors may add their own books and remove books from that collection without gaining ownership of another user's library item.
2. **Active lending is a concurrency-safe invariant.** A service-level check produces a friendly conflict; a PostgreSQL partial unique index makes it impossible for two concurrent requests to create two active loans for the same book. Returned loans stay in history.
3. **Shelf authorization is centralized and server-side.** One access helper defines the owner/editor/viewer hierarchy. The intentional 404-versus-403 distinction limits existence leaks while retaining useful permission feedback for people who can see a shelf.
4. **Refresh tokens are rotated and stored only as keyed hashes.** The browser's long-lived credential is an `httpOnly` cookie, while the short-lived access credential stays in memory. Detected reuse revokes the user's active refresh sessions.
5. **Live room membership follows authorization.** Clients never request arbitrary rooms; the server verifies identity, derives accessible shelf rooms, and updates room membership when shares change.
6. **Events signal invalidation rather than replacing API state.** Socket.IO keeps other users' views current, while normal validated API reads remain canonical and usable if live transport disconnects.
7. **Progress, access, and persistence rules agree.** The UI can display progress and hide unavailable controls, but the API validates page/status/ownership rules and the database enforces relational integrity.

These are concrete trade-offs, not claims that the project uses microservices, event sourcing, or a distributed message bus. The project keeps a deployable single API process and a relational source of truth.

## 12. Deployment and configuration

### Local development

The root README documents copying the example environment files, starting PostgreSQL, deploying the schema, seeding data, and running the NestJS and Next.js development servers separately. The API reads its configuration from `backend/.env`; Prisma 7 obtains the database URL through `backend/prisma.config.ts`. The browser-facing API origin is configured for the frontend.

### Compose

`docker-compose.yml` defines:

- **`db`** — PostgreSQL 18 Alpine with a named persistent volume and `pg_isready` health check.
- **`backend`** — Node 24 Alpine image. Its entrypoint deploys migrations, seeds data, and then launches the compiled API. Compose waits for the database health check.
- **`frontend`** — Node 24 Alpine image. It builds the Next.js app with `NEXT_PUBLIC_API_URL` and starts the production server after the API health check passes.

The browser-facing Compose frontend uses `http://localhost:4000` for API calls; the backend container itself connects to the database host `db`. This difference between a browser URL and an in-network container hostname matters when changing ports or deployment topology.

The root `.env.example`, `backend/.env.example`, and `frontend/.env.example` describe the local configuration. Do not copy Compose's fallback JWT values into a public or production deployment.

## 13. Scope and current limitations

- Shelf sharing and lending are for already registered users; there is no email invitation delivery flow.
- There are no book-cover uploads or external catalog/metadata integrations.
- Backend HTTP end-to-end coverage exists, but automated browser-flow coverage and a dedicated automated realtime handshake/event test are future improvements.
- Compose's JWT defaults are only for local evaluation. Production operation needs managed secrets, HTTPS, secure cookie settings, an explicit origin, and operational database backup/monitoring practices.

See the [root README](../README.md) for full setup instructions, seeded test credentials, the detailed requirement-to-implementation map, and further design notes.

# Walkthrough (interview)

Eight files that carry the interesting behaviour. Read them in this order.

## 1. `backend/src/auth/auth.service.ts`

Signup hashes the password with bcrypt (cost 12) and stores the email lowercase. Login uses the same generic message for unknown email and bad password. `issueSession` signs a short JWT and stores only an HMAC of the refresh token. `refresh` rotates: revoke the presented row, then issue a new cookie. If `revokedAt` is already set, every session for that user is revoked.

## 2. Refresh cookie path — `backend/src/common/constants.ts` + `auth.service.ts`

The cookie is `httpOnly`, `SameSite=Lax`, path `/auth`. The browser will not attach it to `/books` or `/shelves`, so a stolen XSS payload on those pages cannot call refresh. `COOKIE_SAMESITE` and `COOKIE_SECURE` are env-driven for deployment.

## 3. `backend/src/shelves/shelf-access.service.ts`

`requireRole(shelfId, userId, minRole)` is the only shelf permission check. Missing shelf or no share → 404. Too low a role → 403 with a clear sentence. OWNER > EDITOR > VIEWER. Controllers do not invent their own if-owner checks.

## 4. `backend/src/lending/lending.service.ts`

Lend runs inside a transaction: look for an active row, then insert. Unique-index `P2002` is mapped to 409 `"This book is already lent to someone"`. Self-lend is 400. Unknown borrower email is 404. Return sets `returnedAt` so the partial unique index frees the book for a later lend.

## 5. Progress — `backend/src/books/books.service.ts` (`logProgress`)

Only the owner (not a borrower) and only when status is READING. Unset `totalPages`, page greater than total, negatives, and non-integers are 400 with `details: [{ field, message }]`. Hitting `totalPages` sets FINISHED, `finishedAt`, and a STATUS_CHANGED activity.

## 6. `backend/src/realtime/realtime.gateway.ts`

Socket.io middleware verifies `handshake.auth.token` before the socket is accepted. `handleConnection` joins `user:{id}` and every relevant `shelf:{id}`. `RealtimeService.joinUserToShelf` / `removeUserFromShelf` keep rooms in sync when shares change. Clients never send a room name.

## 7. `frontend/src/lib/api.ts`

`accessToken` is a module variable (memory). `api()` on 401 calls `refreshSession` once (`refreshInFlight` is the queue). Failed refresh dispatches `booknest:logout`. `credentials: 'include'` so the httpOnly cookie is sent to `/auth/refresh`.

## 8. `backend/src/dashboard/dashboard.service.ts`

One handler, database aggregations in parallel: `groupBy` status, count finished this year, average rating of rated books, shelf with most books, active lendings out, shares inward, plus the activity feed of 20.

## Five likely questions

**Why not put the access token in localStorage?**  
XSS can read localStorage. Memory plus a short TTL means a stolen XSS payload cannot keep a long-lived token. The refresh cookie is httpOnly and scoped to `/auth`.

**Why 404 for another user's book instead of 403?**  
403 would confirm the id exists. 404 matches "you cannot see this" for both missing and forbidden-to-know rows. Collaborators and borrowers are the explicit exceptions.

**How can two lend requests not double-lend?**  
The transaction checks `returnedAt IS NULL`, and PostgreSQL also has `CREATE UNIQUE INDEX ... WHERE returnedAt IS NULL`. The second insert fails even if both checks ran.

**Can a viewer add a book by calling the API directly?**  
No. The UI hides the button, but `requireRole(..., EDITOR)` still runs. Viewer gets 403.

**What happens if the websocket dies?**  
A banner shows. HTTP CRUD still works. Socket.io reconnects with backoff; on `connect` the client invalidates queries so the view catches up.

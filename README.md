# Assignment

A competition and registration backend with a matching React Native client, built as one vertical slice: read a competition, then register into it or cancel out of it without ever overselling a spot.

```
server/   Express 5 + Mongoose 9 + TypeScript API, MongoDB
mobile/   Expo 57 + Expo Router + NativeWind + TanStack Query, one screen
```

The scope is deliberately narrow. There is no auth flow, no home or explore screen, no payments. The backend serves one resource — competitions — and registration into it. The app is the single screen that consumes it.

- [server/README.md](./server/README.md) — API, endpoints, concurrency evidence
- [mobile/README.md](./mobile/README.md) — app setup, design-fidelity notes

## Requirements

- Node 22 for the server, Node 20+ for the app
- A MongoDB you can reach. Docker is fine:
  `docker run -d --name feedants-mongo -p 27017:27017 mongo:7`
- Expo Go, a simulator, or a development build

`npm test` and `npm run concurrency` inside `server/` spin up their own throwaway `mongod`, so neither needs a running database.

## Running it

Two terminals, in this order.

```bash
# Terminal 1 — API on http://localhost:4000
cd server
cp .env.example .env        # fill in the values below
npm install
npm run seed                # prints the three EXPO_PUBLIC_* values you need
npm start
```

```bash
# Terminal 2 — the app
cd mobile
cp .env.example .env        # paste the values npm run seed printed
npm install
npx expo start
```

The server's `.env` template:

```
PORT=4000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/feedants

# The permitted values are not defined yet. The server only checks that this is
# set; whatever you put here has to agree with the authenticate middleware once
# that's pinned down.
AUTH_MODE=header
```

The mobile `.env` is filled from `npm run seed` output. It needs three variables:

- `EXPO_PUBLIC_API_BASE_URL` — must include `/api/v1`, because the client calls `/competitions/:id` relative to it
- `EXPO_PUBLIC_DEV_USER_ID` — the seeded dancer
- `EXPO_PUBLIC_DEV_COMPETITION_ID` — the competition the root route redirects to

A physical device can't reach `localhost`; use your LAN IP like `http://192.168.x.x:4000/api/v1`. On the Android emulator, use `http://10.0.2.2:4000/api/v1`. `EXPO_PUBLIC_*` values are inlined at build time, so after editing `.env` you have to restart with `npx expo start --clear` or the old values stick.

`/` redirects to `/competition/$EXPO_PUBLIC_DEV_COMPETITION_ID`, so once the seed has run there's nothing to type.

## API

All routes under `/api/v1`. Reads accept an optional `x-user-id`; writes require one.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | Root, outside the version prefix. 200 ok / 503 degraded. |
| `GET` | `/competitions` | Indexed filters (`danceForm`, `tag`, `search`, `adminStatus`, `registrationOpenOnly`, `upcomingOnly`), sort allow-list, pagination capped at 50. |
| `GET` | `/competitions/:id` | Full document plus `lifecycleStatus`, `isRegistrationOpen`, `serverTime`, and `userState` (`null` when anonymous). |
| `POST` | `/competitions/:id/register` | 201 with a `Location` header. Atomic. Returns the fresh competition state. |
| `DELETE` | `/competitions/:id/register` | 200 and the fresh state, including the spot that just came free. |

Success responses are `{ data, meta: { serverTime } }`. Failures are `{ error: { code, message, details? } }`, where `code` comes from `ERROR_CODES` and carries its own HTTP status. No stack trace or raw driver error ever reaches a client.

## Verification

```bash
cd server
npm test                   # 90 tests over dist/tests, ephemeral mongod
npm run concurrency        # real HTTP against the real app on an ephemeral port
npm run typecheck
```

```bash
cd mobile
npx tsc --noEmit
npm run lint
```

`npm run concurrency` is the evidence for the atomicity claims. Five parallel `POST /register` requests against a competition with one spot yield exactly one `201` and four `422 COMPETITION_FULL`. Two parallel `DELETE`s yield one `200` and one `409`. The freed seat is registrable again. The script mounts the real `createApp()` in-process, so a mistake between the socket and the service — the exact thing unit tests can't see — fails the run.

---

## Decisions, trade-offs, and what I'd do differently

This is the short version. The per-layer `DECISIONS.md` files have the full record, with rejected alternatives for every call.

### Assumptions everything else leans on

- Auth is a stub — `x-user-id` *is* the identity, so anyone with a valid 24-character ObjectId is that user. The middleware only implements the `header` mode; any other `AUTH_MODE` value fails per-request rather than silently authenticating nobody, because a stub that fails open is worse than one that fails loudly.
- MongoDB is standalone, not a replica set, so multi-document transactions aren't available and every atomicity guarantee here is single-document.
- One dance form per dancer, and it has to match the competition's or `POST /register` returns `DANCE_FORM_MISMATCH`.
- Lifecycle is derived, never stored — the eight states come from the date windows plus `adminStatus`, computed at read time, and the API returns `serverTime` so the client can correct for clock skew.
- Cancelled participations are kept as history, which means the real invariant is *active* rows equal the counter, never total rows.
- Registration moves no money — fees and prize pools are stored and displayed integers, and a referral code only ever discounts a fee.

### Decisions by cluster

**Concurrency**

- One `findOneAndUpdate` per registration, with the capacity check, the registration window, and the admin-cancelled check all inside the filter, plus `$inc` on the counter. No read-modify-write anywhere.
- A partial unique index on `{ competitionId, userId }` where `status: REGISTERED` is the database-level backstop — if the application check is ever wrong, the index still refuses a second active registration.
- Since transactions aren't available, every step after the increment has a named compensating action. `releaseSlot` is guarded with `count > 0` so the counter can't go negative, and a post-insert re-read catches a cancellation that lands between the reserve and the insert.

**Reads**

- The participant count is denormalized onto the competition, because every list item needs it and an aggregation per list page wasn't worth the query.
- Lifecycle status is derived, not stored — a small computation per read in exchange for removing an entire class of stale-clock bugs.

**Errors**

- One error formatter. `errorHandler` is the only place a failure becomes a response, so Mongoose errors, `CastError`s, and duplicate keys can't reach a client untranslated.
- Authenticate before validate on writes so an anonymous caller with a malformed body gets a 401, not a field-level 400 that would confirm what the route accepts.

**Client**

- One React Query cache, no global store.
- The CTA button is a pure function of `lifecycleStatus`, `userState.relationship`, and `spotsRemaining`, typed exhaustively so adding a new lifecycle state fails compilation rather than rendering a wrong label.
- The countdown is anchored to `serverTime` — the device clock's *rate* is trusted, its *reading* never is.
- Concurrency is proven over real HTTP, not just at the service level, because the gap unit tests can't see is exactly the one that ships broken.

**Mongoose virtuals**

- `spotsRemaining` and `isFull` on Competition are virtuals — computed on read from `maxParticipants` and `currentParticipantCount`, never stored. The schema enables `toJSON`/`toObject` virtuals so they travel with the document to the client.
- The reasoning: both values are derivable from a counter that changes via `$inc`, so storing them would be a second source of truth that can disagree with the first. One definition, read at the point of use, cannot drift.
- The cost: virtuals don't appear in `.lean()` results or aggregate pipelines, so any list query using `.lean()` would need to hydrate or recompute in the service. That's the main operational tax of the choice, and it's worth knowing before writing one.

### Trade-offs considered

- The **denormalized count** trades a possible drift for one fewer query per page — mitigated by forcing every write through `$inc` inside the guard filter, but not eliminated.
- **No transactions** means a crash between the increment and the insert can still leak a seat. Accepted on a standalone `mongod`; the fix is a reconciliation job, not a code change.
- **Derived lifecycle status** costs a small computation per read and buys immunity from stale clocks.
- **Duplicated allow-lists** between validators and services mean adding a sortable field is two edits — chosen so a service stays correct when called directly, as the tests and the seed both do.
- **Strict request bodies** surface client bugs but will break any client that sends an extra field.
- On registration success, the app **invalidates instead of `setQueryData`** — costs one extra `GET`, buys the guarantee that the cached detail came from a real read.
- **`console` plus `morgan` instead of a structured logger** avoids a dependency at the cost of needing a parser if logs ever need to be aggregated.
- The seed points at **third-party placeholder images** (`randomuser.me`) to turn two dead UI branches into real ones for free, at the cost of depending on a host I don't control — the components fall back cleanly when it's unreachable.

### What I would change for production

- **Real authentication first.** The header is spoofable and `AUTH_MODE` needs a defined enum; every other assumption inherits from this one.
- **Rate limiting second.** `express-rate-limit` is already a dependency and is never imported, so the register endpoint is currently the easiest thing in the app to abuse, and any store for it must not be in-memory.
- **A scheduler third.** `CANCELLED_INSUFFICIENT_PARTICIPANTS` is derived on read but nothing acts on it at the deadline — no cancellation, no notification, no refund.
- **Payments and a referral ledger.** `appliedReferralCode` is stored without crediting anyone.
- **Reconciliation for the count**, plus a migration tool — Mongoose only enforces the schema on the next write, and existing documents are not backfilled.
- **Observability and CI.** A 5xx currently exists only on stderr, and the test suite plus the concurrency script are run by hand. Controller and middleware wiring, which is exactly what the concurrency script exists to check, has no automated coverage yet.
- **A cancellation path in the app.** `DELETE /register` exists and is tested; the screen doesn't call it.
- **Host our own images** rather than pointing a fixture at a third-party host with no uptime guarantee.
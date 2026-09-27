# Feedants API

Express + Mongoose backend for the Feedants competition app. One resource so far:
competitions, and registration into them.

## Requirements

- Node 22 (the `fetch` in `scripts/concurrency-test.ts` and the built-in test
  runner are both used directly)
- A reachable MongoDB for `npm start` / `npm run seed`

`npm test` and `npm run concurrency` do not need one — they start their own
throwaway `mongod`.

## Setup

```sh
cp .env.example .env   # then fill in MONGODB_URI
npm install
npm start              # prestart runs the build
```

Every variable in `.env` is validated at boot by `src/config/env.ts`. A missing or
malformed one prints all the problems at once and exits non-zero, rather than
failing at the first request that happens to need it.

## Scripts

| Script | What it does |
| --- | --- |
| `npm start` | Build, then serve on `PORT` |
| `npm run build` | `tsc` to `dist/` |
| `npm run typecheck` | Types only, no emit |
| `npm test` | Build, then the `node --test` suite over `dist/tests/` |
| `npm run seed` | One user and one competition, registered. Prints the ids to paste into `mobile/.env` |
| `npm run concurrency` | Build, then the register/cancel race check below |

## Endpoints

All under `/api/v1`. Reads are optional-auth; writes require an `x-user-id`
header naming a real user.

| Method | Path | Success |
| --- | --- | --- |
| `GET` | `/competitions` | `200` — list items, not detail snapshots |
| `GET` | `/competitions/:id` | `200` — detail, with `userState` when the caller identifies itself |
| `POST` | `/competitions/:id/register` | `201` — fresh competition state, `Location` set |
| `DELETE` | `/competitions/:id/register` | `200` — fresh competition state |

`POST /register` takes an optional `referralCode`; the body schema is strict, so
a `userId` in the body is rejected rather than ignored. The dancer always comes
from the header.

## Concurrency verification

`npm run concurrency` is the evidence for the §9 rules. The service-level race
tests in `tests/services/registrationService.test.ts` already prove the
atomicity against a real `mongod`, but they call `registerUser` directly and so
cannot reach the router, the authenticate-before-validate order, the zod schema
or the single error handler. This script closes that gap: it mounts the real
`createApp()` on an ephemeral port, backed by an ephemeral `mongod`, and drives
real HTTP requests with real `x-user-id` headers.

The ephemeral `mongod` is the reason the dev database stays clean, and mounting
in-process is why the run needs no server already listening.

**On spot count:** the brief asked for a three-spot competition and then for
exactly one of five parallel requests to win. Those cannot both hold — three
spots produce three winners. The assertions are the criteria that can actually
pass, and they are self-consistent at one spot, so that is what runs. Change
`TOTAL_SPOTS` in the script for a different contention level.

Output of a passing run:

```
[concurrency] app listening in-process on http://127.0.0.1:53179
[concurrency] mongod is ephemeral, the dev database is untouched
[concurrency] competition 6ab92f51a9bb5b8979790b2d with 1 spot, 5 contenders, 0 registered

[concurrency] 5 parallel POST /register against 1 spot(s)
  all five arrived together:
    201 dancer-1    created slot 1
    422 dancer-2    COMPETITION_FULL
    422 dancer-3    COMPETITION_FULL
    422 dancer-4    COMPETITION_FULL
    422 dancer-5    COMPETITION_FULL
  GET detail reports 1/1 spots taken

[concurrency] 2 parallel DELETE /register for the same dancer
  both arrived together:
    200 cancel-1    cancelled slot 1
    409 cancel-2    NOT_REGISTERED
  the freed spot is registrable again, counter never went negative
[concurrency] PASS — one spot, five contenders, no oversell and no lost update
```

The port and the competition id change every run; the status codes and error
codes do not.

What each phase asserts:

- **Register race** — exactly one `201`, four `422 COMPETITION_FULL`, persisted
  `currentParticipantCount` of 1, one active participation row, and a read-back
  showing `1/1`. The winner's own response carries `slotNumber`, which is §9.5:
  the client gets the fresh state and needs no follow-up `GET`.
- **Cancel race** — two parallel `DELETE`s for one dancer give one `200` and one
  `409 NOT_REGISTERED`, and the counter lands on 0. The cancelled row is kept as
  history, so the assertion is *active* rows == counter, not total rows.
- **Re-register** — the freed spot is registrable again and the counter follows
  it back to 1, which is what proves a cancellation cannot drive the counter
  below the rows that back it.

A failure prints the `AssertionError` and exits non-zero.

## Assumptions, decisions, and production gaps

### Important assumptions

- **Auth is a stub.** `x-user-id` *is* the identity — anyone who knows a 24-char
  ObjectId is that user. `AUTH_MODE` is required at boot, but its permitted
  values are not specified anywhere yet.
- **Scope is one screen against one resource.** No auth, onboarding, explore,
  profile or payment flows.
- **MongoDB is a single node, not a replica set**, so multi-document
  transactions are out of reach. All atomicity below is single-document.
- **A dancer has one primary dance form** and it must match the competition's
  to register, or `POST /register` rejects with `DANCE_FORM_MISMATCH`.
- **Registration moves no money.** `entryFee` and `prizePool` are stored and
  displayed integers. A referral code only discounts a fee; nothing is charged.
- **Cancelled participations are kept as history**, so the real invariant is
  *active* rows == counter, never total rows == counter.
- **Lifecycle status is derived from the windows at read time**, never stored,
  and the API returns `serverTime` so the client can correct for clock skew.

### Major technical decisions

- **Registration is one `findOneAndUpdate` with the capacity check inside the
  filter**, then an insert. No read-modify-write, no `$set` on the count. A
  partial unique index on `{competitionId, userId}` where `status: REGISTERED`
  is the database-level backstop against a double-write.
- **`currentParticipantCount` is denormalised** onto the competition, because
  every list item needs a count and N+1 aggregation per list page was not worth
  it.
- **One error handler formats every failure.** Each maps to an `ERROR_CODES`
  value or collapses to a generic 500. No Mongoose error or stack reaches a
  client; 4xx are not logged, 5xx are.
- **Validators own the wire shape, services keep their own id and allow-list
  checks.** The duplication is deliberate: services must stay safe when called
  directly, as the tests and the seed do.
- **zod booleans are `enum(['true','false'])` then transformed**, never
  `z.coerce.boolean()` (which reads `"false"` as true), and `.default()` is
  placed *before* the transform so a default still passes through it.
- **Referral codes are derived, not issued** — `<prefix>-<last 6 of the user id,
  uppercased>`. Stable across reads with no lookup table, and a link shared in
  week one still resolves in week two.
- **The seed registers through the real `registerUser`**, not a hand-written
  row, so the fixture cannot drift from the code path it exercises.
- **Concurrency is proven over real HTTP** against an ephemeral `mongod`, not
  only at the service level, because a wiring mistake between the socket and
  the service leaves every unit test green.

### Trade-offs considered

- **Denormalised count** trades a possible drift for one fewer query per list
  page. Mitigated by forcing every write through `$inc` in the same filter, plus
  the unique index.
- **No transactions.** If the participation insert fails after the increment the
  count is rolled back by hand; a crash in that window leaves the two
  inconsistent. Accepted because it is a single-owner single-document update and
  a replica set is out of scope.
- **Derived lifecycle status** costs a small computation on every read but
  removes an entire class of stale-clock bugs.
- **Derived referral codes** are free and stable, but trivially forgeable from a
  user id. Fine for a fixture, not for real attribution.
- **Duplicated allow-lists** mean adding a sortable field is two edits. Chosen so
  a service is correct without going through HTTP.
- **Strict request bodies** reject unknown keys, which surfaces client bugs but
  will break any client that sends extra fields.
- **`console` + `morgan` instead of a structured logger** avoids a dependency,
  at the cost of needing a parser to aggregate logs later.

### What I would change for production

- **Add real authentication.** The header is spoofable, and `AUTH_MODE` needs a
  defined enum. This is the assumption everything else inherits.
- **Wire up rate limiting.** `express-rate-limit` is in `package.json` but is
  never imported anywhere — the write endpoints are currently unthrottled,
  which makes the register endpoint the easiest thing in the app to abuse. If
  added, the store must not be in-memory: that is per-process and wrong behind
  more than one instance.
- **Add a scheduler.** `CANCELLED_INSUFFICIENT_PARTICIPANTS` is derived on read
  but *nothing acts on it* at the deadline — no cancellation, no notification,
  no refund. The state becomes visible to a reader and nothing else.
- **Add payments and a ledger.** Nothing is charged, and `appliedReferralCode`
  is stored without crediting any referrer.
- **Add a migration tool.** Schema changes are enforced by Mongoose, but there is
  no backfill or migration path for existing documents.
- **Add observability** — metrics, tracing, log shipping. Today a 5xx exists
  only on stderr.
- **Add CI.** The three service test suites and `npm run concurrency` are run by
  hand. Coverage is service-layer only: the controller and middleware wiring —
  the exact thing the concurrency script exists to check — is not covered by the
  automated suite.
- **Host images ourselves** rather than pointing the seed at `randomuser.me`, a
  third-party host with no uptime guarantee.


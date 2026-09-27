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

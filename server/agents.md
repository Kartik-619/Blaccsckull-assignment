
**Rules per layer:**

### 4.1 Routes
- Map URL + HTTP method → middleware chain → controller
- No business logic. No DB access. No data transformation.
- Version prefix: `/api/v1/...`

### 4.2 Middleware
- `authenticate` — reads `x-user-id` header, loads user, attaches to `req.user`
- `validate` — zod schema validation on `req.params`, `req.body`, `req.query`
- `asyncHandler` — wraps async controllers to funnel rejections to `errorHandler`
- `errorHandler` — the ONLY place that formats error responses
- `notFound` — catches unmatched routes, returns 404

### 4.3 Controllers
- Parse the request (params, body, headers) — nothing else
- Call **one** service function
- Shape the HTTP response (status code, headers, body)
- **Forbidden:** direct model access, business logic, multiple service calls to compose a response
- **Allowed:** two service calls only if the second is purely presentational (rare). Default to one.

### 4.4 Services
- The brain. All business logic lives here.
- Pure functions where possible (`deriveLifecycleStatus`, `deriveUserRelationship`)
- Impure where necessary (atomic DB updates)
- Services talk to models. Services do NOT talk to `req` / `res`.
- Services return plain objects or throw `AppError`. Never return HTTP-specific structures.

### 4.5 Models
- Schema definition, indexes, virtuals, instance methods (only if trivially simple)
- No business logic. No cross-collection queries. No side effects.
- Static methods allowed only for atomic operations directly tied to the model (e.g., `Competition.reserveSlot()`). Justify in DECISIONS.md.

### 4.6 Utils
- Pure helpers. No DB access. No side effects.
- `errors.js` — `AppError` class + `ERROR_CODES` enum
- `time.js` — `isWithinWindow`, `nowUtc`, `addSeconds`
- `response.js` — standard success response shaper

---

## 5. Coding Standards

### 5.1 Style
- ESLint + Prettier enforced. Do not deviate.
- 2-space indentation.
- Semicolons: yes.
- Quotes: single, unless template literal needed.
- Trailing commas: yes (ES2017+).
- Max line length: 100 characters.

### 5.2 Naming
- Files: `camelCase.js` for utilities, `PascalCase.js` for models/classes
- Variables / functions: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Booleans: prefix with `is`, `has`, `can`, `should`
- Enum values: `SCREAMING_SNAKE_CASE`
- Collections (Mongo): `snake_case`, plural (`users`, `competitions`, `participations`)

### 5.3 Functions
- Max 40 lines. If longer, split.
- Max 3 parameters. If more, pass an object.
- Pure by default. Side effects must be obvious from the name (`createUser`, `updateCount`).
- No nested ternaries.
- Early returns over `else` chains.
- No `var`. Use `const` by default, `let` only when reassigned.

### 5.4 Async
- `async/await` only. No `.then()` chains except in top-level scripts.
- Every `await` on a Promise that can reject must be inside a `try/catch` OR the surrounding function is wrapped in `asyncHandler`.
- No floating promises. Every promise must be awaited or explicitly `.catch()`ed.

### 5.5 Error Handling
- All errors thrown as `AppError(code, httpStatus, message, details?)`
- Never `throw new Error(...)` in application code.
- Never swallow errors silently.
- Never leak stack traces or internal messages to the client.
- Error middleware is the single formatter for error responses.

### 5.6 Comments
- Comments explain **why**, not **what**. Code explains what.
- No commented-out code. Delete it; git remembers.
- No TODO comments committed to `main`. Open a note in `DECISIONS.md` under "Future work" instead.
- JSDoc only on exported service functions where the contract is non-obvious.

---

## 6. SOLID Principles (Applied to Node/Express)

### S — Single Responsibility
- Each function, class, module, and file has exactly one reason to change.
- Controllers: HTTP concerns. Services: business rules. Models: schema.
- If a service function touches two collections for unrelated reasons, split it.

### O — Open/Closed
- Adding a new lifecycle state should require adding to `enums.js` and updating `lifecycleService.js` — not modifying controllers or routes.
- Adding a new error code should not require touching the error handler.

### L — Liskov Substitution
- Any `AppError` subclass must be usable wherever `AppError` is expected.
- Any service function returning a shape must return the same shape on all success paths.

### I — Interface Segregation
- Services expose only the functions controllers need. No "kitchen sink" service objects.
- If a service grows beyond ~8 exported functions, split it.

### D — Dependency Inversion
- Services depend on models (abstractions), not on raw MongoDB driver calls.
- Config is injected via `env.js`, not read ad-hoc via `process.env` throughout the code.
- Testability matters: if a function can't be unit tested without a live DB, it's doing too much.

---

## 7. OOP Discipline

We use OOP where it earns its place. We do NOT force it.

- **Use classes for:** `AppError`, custom validators, and — rarely — domain entities with behavior.
- **Do NOT use classes for:** services (use plain modules with exported functions), utilities, controllers, models (Mongoose handles that).
- **Encapsulation:** internal helpers not exported. Only the public surface is exported.
- **Inheritance:** only for error hierarchies. Prefer composition everywhere else.
- **No premature abstractions.** If a pattern appears twice, keep it inline. Three times → consider extracting. Rule of three.

---

## 8. Database Rules

### 8.1 Schema Changes
- Any schema change must be documented in `DECISIONS.md` with: reason, trade-off, migration plan.
- Never rename a field without a migration script. Never drop a field without confirming no code reads it.
- All new fields must have a default OR be required. No "optional and undefined" fields that silently break queries.

### 8.2 Indexes
- Every foreign key must be indexed.
- Every field used in a query filter must be indexed OR justified as low-cardinality-ok.
- Unique constraints on identity fields (email, slug).
- Partial unique index on `{ competitionId, userId }` where `status: "REGISTERED"` — DO NOT remove.
- Adding indexes without documenting in `DECISIONS.md` is forbidden.

### 8.3 Atomic Operations
- All counter updates on `Competition.currentParticipantCount` MUST use `$inc`.
- All capacity checks MUST be part of the `findOneAndUpdate` filter, not a separate read-then-write.
- Never use `$set` to change the count. Ever.
- Rollback logic must be present for every multi-step write that could partially fail.

### 8.4 Queries
- Always project only what's needed (`.select()`), except for the detail endpoint.
- Always set a `limit` on list queries.
- Never use `$where`. Never use unbounded regex on unindexed fields.

### 8.5 Transactions
- Only use if the deployment is a replica set. Default to atomic single-document updates.
- If a transaction is used, document why in `DECISIONS.md`.

---

## 9. Concurrency Rules (Load-Bearing)

These rules exist to preserve correctness under thousands of concurrent users. Breaking them breaks the system.

1. **Registration MUST be atomic.** Filter + increment in a single `findOneAndUpdate`.
2. **Participation insert MUST happen AFTER the count increment.** If insert fails, rollback the increment.
3. **Duplicate registration MUST be caught at the DB level**, not just in the service. Unique partial index is the last line of defense.
4. **Cancel MUST decrement atomically** with the same rigor as register.
5. **The register response MUST include the fresh state** so the client never needs a follow-up GET.
6. **No read-modify-write pattern.** If you find yourself doing `const x = await find(); x.count++; await save();`, you have introduced a race condition. Stop and use atomic operators.

Any change touching register, cancel, or count must be reviewed against this list before merge.

---

## 10. DECISIONS.md — Mandatory Log

**Every non-trivial decision must be appended to `DECISIONS.md` in the same change.** A change without a corresponding entry is incomplete.

### 10.1 What counts as "non-trivial"
- Adding, removing, or renaming a field
- Adding, removing, or renaming an endpoint
- Adding, removing, or changing an index
- Choosing one approach over a viable alternative
- Any new dependency
- Any new error code
- Any deviation from this document

### 10.2 Entry format (use this exact template)
YYYY-MM-DD — <Short title>
Context: What prompted this decision?

Decision: What was decided.

Alternatives considered: What else was on the table.

Reason: Why this over the others.

Trade-offs: What we give up.

Reversibility: Easy / Medium / Hard — and what reversing would cost.

Affected files: List of files touched.


### 10.3 Rules for DECISIONS.md
- New entries appended at the TOP (reverse chronological).
- Never edit or delete a past entry. If a past decision is superseded, add a new entry referencing it.
- Be precise. "Because it's better" is not a reason. State the actual trade-off.

---

## 11. Change Protocol (For Every Single Change)

Before making any change, answer these questions:

1. **What exactly was requested?** (One sentence.)
2. **What files will this touch?** (List them.)
3. **What is the smallest change that satisfies the request?** (Design it.)
4. **Does this require a DECISIONS.md entry?** (See §10.1.)
5. **Does this touch concurrency-critical code?** (See §9.)
6. **Does this introduce a new dependency?** (If yes, stop and ask.)
7. **Does this affect the API contract?** (If yes, flag it.)

Then implement ONLY the smallest change. Then:
- Run lint
- Run relevant tests (if any exist)
- Update DECISIONS.md (if needed)
- Write a clear commit message

**If any step is unclear, STOP and ask. Do not guess.**

---

## 12. API Contract Rules

### 12.1 Response Shape (Success)
{
"data": { ... },
"meta": { "serverTime": "ISO-8601" } // on endpoints involving time
}

text

### 12.2 Response Shape (Error)
{
"error": {
"code": "SCREAMING_SNAKE_CASE",
"message": "Human readable",
"details": { ... } // optional
}
}

text

### 12.3 Rules
- Every error returned to the client must have a code from `ERROR_CODES`.
- Never return raw Mongoose errors. Wrap them.
- Every endpoint that returns time-sensitive data MUST include `serverTime`.
- HTTP status codes must be semantically correct:
  - 200 OK, 201 Created, 204 No Content
  - 400 Bad Request (validation), 401 Unauthorized, 403 Forbidden, 404 Not Found
  - 409 Conflict (duplicate), 410 Gone (cancelled), 422 Unprocessable (business rule), 429 Too Many Requests
  - 500 Internal Server Error (only for truly unexpected)
- Validation errors use 400. Business rule violations use 422. Duplicate state uses 409. These distinctions matter.

---

## 13. Error Codes (Canonical List)

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request shape invalid |
| `INVALID_ID` | 400 | Malformed ObjectId |
| `UNAUTHORIZED` | 401 | No/invalid auth |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Resource missing |
| `COMPETITION_NOT_FOUND` | 404 | Specific |
| `USER_NOT_FOUND` | 404 | Specific |
| `ALREADY_REGISTERED` | 409 | Duplicate active registration |
| `NOT_REGISTERED` | 409 | Cancel without registration |
| `COMPETITION_CANCELLED` | 410 | Admin cancelled |
| `COMPETITION_FULL` | 422 | No spots remaining |
| `REGISTRATION_NOT_OPEN` | 422 | Before window |
| `REGISTRATION_CLOSED` | 422 | After window |
| `DANCE_FORM_MISMATCH` | 422 | User's form ≠ competition's form |
| `INSUFFICIENT_PARTICIPANTS` | 422 | Below min, event cancelled |
| `CANCELLATION_NOT_ALLOWED` | 422 | Outside policy window |
| `REFERRAL_EXPIRED` | 422 | Referral code past validUntil |
| `INTERNAL_ERROR` | 500 | Unexpected |

Adding new codes requires a DECISIONS.md entry.

---

## 14. Testing Policy

- Do NOT write tests unless asked.
- When asked, tests live in `tests/` mirroring `src/` structure.
- Preferred stack: `jest` + `supertest` + `mongodb-memory-server`.
- Every business rule in §9 must have a concurrency test when tests are requested.
- Tests must be deterministic. No `setTimeout` in assertions. No reliance on wall clock — inject `now`.

---

## 15. Environment & Config

- All env vars validated at boot in `config/env.js`. Fail fast with a clear message.
- Required vars (see `.env.example`): `PORT`, `NODE_ENV`, `MONGODB_URI`, `AUTH_MODE`.
- Never read `process.env.X` outside `config/env.js`.
- Never commit `.env`. Only `.env.example`.

---

## 16. Logging

- Use `morgan` for HTTP access logs in dev only.
- Application logs: use `console.error` for errors, `console.log` for boot-time info only. No logging inside services.
- No PII in logs. No user emails, no tokens.

---

## 17. Forbidden Patterns (Hard Ban)

- `any` in TypeScript (not applicable now, but if TS is added later).
- `process.env.*` outside `config/env.js`.
- `try { } catch { }` with empty catch.
- `console.log` in committed service/controller code.
- `findOneAndUpdate` without a filter that includes all necessary conditions.
- Reading `currentParticipantCount` and then `$set`ting it.
- Business logic in controllers.
- DB queries in controllers or routes.
- Two service calls in one controller to compose a response (unless explicitly approved).
- Direct `req.user` access inside services.
- Returning HTTP status codes from services.
- Hardcoded strings for enum values. Use `enums.js`.
- Renaming or moving files without an explicit request.
- Adding "helper" utilities that only one caller uses. Inline them.

---

## 18. When in Doubt

Ask. Do not guess. Do not "improve." Do not expand scope. The cost of a 30-second clarifying question is infinitely lower than the cost of an unwanted refactor.

**Before any commit, verify:**
- [ ] Change matches the request exactly
- [ ] No extra files touched
- [ ] No new dependencies
- [ ] No forbidden patterns introduced
- [ ] DECISIONS.md updated if required
- [ ] Lint passes
- [ ] Affected endpoints still work (curl check)
- [ ] Concurrency-critical code (if touched) reviewed against §9

---

## 19. Commit Message Format
<scope>: <imperative short summary>

Why:
<one paragraph explaining the reason>

What:

bullet

bullet

DECISIONS.md: <entry title> / none

Files:

path/to/file1

path/to/file2

text

Scopes: `auth`, `competition`, `participation`, `lifecycle`, `config`, `seed`, `docs`, `fix`, `refactor`.

`refactor` commits are NOT allowed unless explicitly requested.

---

## 20. Definition of Done (Per Change)

A change is "done" only when ALL of the following are true:

1. The requested behavior works end-to-end via curl or the frontend.
2. No unrelated files were modified.
3. No forbidden patterns were introduced.
4. Lint passes with zero warnings.
5. DECISIONS.md updated if the change is non-trivial.
6. If concurrency-critical code was touched, §9 checklist is satisfied.
7. The commit message follows §19.
8. Server boots cleanly with the change applied.

Anything less is not done.

---

**End of contract.**
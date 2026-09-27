/**
 * Concurrency verification for register and cancel, driven over real HTTP.
 *
 * The service-level race tests in `tests/services/registrationService.test.ts`
 * already prove the atomicity rules against a real mongod. What they cannot
 * reach is everything between the socket and the service: the router, the
 * authenticate-before-validate middleware order, the zod body schema, and the
 * single error handler that stamps an `ERROR_CODES` value onto the response.
 * A wiring mistake in any of those leaves every service test green while the
 * endpoint is wrong, so this script closes that gap by driving the real
 * `createApp()` over a real socket.
 *
 * The app is mounted in-process on an ephemeral port and backed by an ephemeral
 * mongod, for two reasons that both matter more than convenience: the run is
 * deterministic without a server already listening, and it leaves no fixture
 * rows in the development database. The test helpers are reused rather than
 * reimplemented so the fixture is the same one the unit tests use.
 *
 * `NODE_ENV` is forced to `test` before the config module is imported. The
 * compile target is CommonJS, so TypeScript emits each `import` as a `require`
 * at the position it occupies in the file, which is what makes a statement
 * above the imports run first. `dotenv` does not overwrite an already-set
 * variable, so `.env` cannot put it back. This matters because `morgan` is
 * mounted whenever the environment is `development`, and five interleaved
 * request logs would bury the report this script exists to produce.
 *
 * On spots: the brief asks for a three-spot competition and then asserts that
 * exactly one of five parallel requests succeeds with four `COMPETITION_FULL`
 * rejections. Those cannot both hold — three spots yield three winners. The
 * assertions are the actual pass criteria and they are self-consistent at one
 * spot, which is also the case the unit test covers, so that is what runs here.
 * `TOTAL_SPOTS` is the single place to change if the intent was really three.
 *
 * Run: npm run concurrency
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

// Must precede every import: see the header note on CommonJS emit order.
process.env['NODE_ENV'] = 'test';

import mongoose from 'mongoose';
import type { Server } from 'node:http';

import { DANCE_FORMS, PARTICIPATION_STATUS } from '../src/constants/enums';
import { createApp } from '../src/app';
import { Competition } from '../src/models/Competition';
import { Participation } from '../src/models/Participation';
import { HOUR_MS, makeCompetition, makeOrganizer, makeUser } from '../tests/helpers/fixtures';
import { startMemoryDb, stopMemoryDb } from '../tests/helpers/memoryDb';

const TOTAL_SPOTS = 1;
const CONTENDERS = 5;
const API_PREFIX = '/api/v1';

interface Attempt {
  label: string;
  status: number;
  code: string | null;
  taken: number | null;
  capacity: number | null;
  slotNumber: number | null;
}

function readBody(value: unknown): { code: string | null; data: Record<string, unknown> | null } {
  if (typeof value !== 'object' || value === null) {
    return { code: null, data: null };
  }
  const error = (value as { error?: { code?: unknown } }).error;
  const data = (value as { data?: unknown }).data;

  return {
    code: typeof error?.code === 'string' ? error.code : null,
    data: typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null,
  };
}

function readNumber(source: Record<string, unknown> | null, key: string): number | null {
  const value = source?.[key];
  return typeof value === 'number' ? value : null;
}

async function toAttempt(label: string, response: Response): Promise<Attempt> {
  const { code, data } = readBody(await response.json());
  const userState = (data?.['userState'] ?? null) as Record<string, unknown> | null;

  return {
    label,
    status: response.status,
    code,
    taken: readNumber(data, 'currentParticipantCount'),
    capacity: readNumber(data, 'maxParticipants'),
    slotNumber: readNumber(userState, 'slotNumber'),
  };
}

async function postRegister(baseUrl: string, competitionId: string, userId: string, label: string) {
  const response = await fetch(`${baseUrl}${API_PREFIX}/competitions/${competitionId}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': userId },
    body: JSON.stringify({}),
  });
  return toAttempt(label, response);
}

async function deleteRegister(baseUrl: string, competitionId: string, userId: string, label: string) {
  const response = await fetch(`${baseUrl}${API_PREFIX}/competitions/${competitionId}/register`, {
    method: 'DELETE',
    headers: { 'x-user-id': userId },
  });
  return toAttempt(label, response);
}

function report(title: string, attempts: Attempt[], successWord = 'created'): void {
  console.log(`  ${title}`);
  for (const attempt of attempts) {
    const outcome = attempt.code === null ? successWord : attempt.code;
    const slot = attempt.slotNumber === null ? '' : ` slot ${attempt.slotNumber}`;
    console.log(
      `    ${String(attempt.status).padEnd(3)} ${attempt.label.padEnd(11)} ${outcome}${slot}`,
    );
  }
}

function assertSingleWinner(attempts: Attempt[]): Attempt {
  const winners = attempts.filter((attempt) => attempt.status === 201);
  const losers = attempts.filter((attempt) => attempt.status !== 201);

  assert.equal(winners.length, 1, `expected exactly one winner, got ${winners.length}`);
  assert.equal(losers.length, CONTENDERS - 1, `expected ${CONTENDERS - 1} losers`);
  losers.forEach((loser) => {
    assert.equal(loser.status, 422, `${loser.label} expected 422, got ${loser.status}`);
    assert.equal(loser.code, 'COMPETITION_FULL', `${loser.label} expected COMPETITION_FULL`);
  });

  // §9.5: the response has to carry the fresh state, or the client is forced
  // into a follow-up GET and the badge and the counter can disagree.
  const winner = winners[0];
  assert.ok(winner, 'expected a winner to inspect');
  assert.equal(winner.taken, TOTAL_SPOTS, 'winner response count');
  assert.equal(winner.slotNumber, 1, 'winner response slot number');
  return winner;
}

/**
 * The invariant worth asserting is active rows == counter, not total rows ==
 * counter. A cancelled participation keeps its row with status `CANCELLED`
 * (that history is the audit trail), so counting every row would demand the
 * service delete rows it is required to keep, and the assertion would be
 * wrong rather than the code.
 */
async function assertDatabaseHolds(count: number, phase: string): Promise<void> {
  const stored = await Competition.findOne({}).select('currentParticipantCount maxParticipants');
  assert.ok(stored, `expected a competition to read back (${phase})`);
  assert.equal(stored.currentParticipantCount, count, `${phase}: persisted counter`);
  assert.equal(stored.maxParticipants, TOTAL_SPOTS, `${phase}: persisted capacity`);
  assert.equal(
    await Participation.countDocuments({ status: PARTICIPATION_STATUS.REGISTERED }),
    count,
    `${phase}: active participation rows must equal the counter, not drift from it`,
  );
}

async function listen(): Promise<{ server: Server; baseUrl: string }> {
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;

  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function verifyRegisterRace(baseUrl: string, competitionId: string, userIds: string[]) {
  console.log(`\n[concurrency] ${CONTENDERS} parallel POST /register against ${TOTAL_SPOTS} spot(s)`);

  // Nothing between the fetches may await, or the requests serialise and the
  // race never happens. This is the whole test.
  const attempts = await Promise.all(
    userIds.map((userId, index) => postRegister(baseUrl, competitionId, userId, `dancer-${index + 1}`)),
  );
  report('all five arrived together:', attempts.slice().sort((a, b) => a.label.localeCompare(b.label)));
  assertSingleWinner(attempts);
  await assertDatabaseHolds(TOTAL_SPOTS, 'register');

  const readBack = await fetch(`${baseUrl}${API_PREFIX}/competitions/${competitionId}`, {
    headers: { 'x-user-id': userIds[0] as string },
  }).then((response) => toAttempt('read-back', response));
  assert.equal(readBack.taken, TOTAL_SPOTS, 'read-back count');
  assert.equal(readBack.capacity, TOTAL_SPOTS, 'read-back capacity');
  console.log(`  GET detail reports ${readBack.taken}/${readBack.capacity} spots taken`);
}

async function verifyCancelRace(
  baseUrl: string,
  competitionId: string,
  winnerId: string,
  userIds: string[],
) {
  console.log('\n[concurrency] 2 parallel DELETE /register for the same dancer');

  const attempts = await Promise.all([
    deleteRegister(baseUrl, competitionId, winnerId, 'cancel-1'),
    deleteRegister(baseUrl, competitionId, winnerId, 'cancel-2'),
  ]);
  report('both arrived together:', attempts, 'cancelled');

  const ok = attempts.filter((attempt) => attempt.status === 200);
  const rejected = attempts.filter((attempt) => attempt.status !== 200);
  assert.equal(ok.length, 1, `expected one cancellation to win, got ${ok.length}`);
  assert.equal(rejected.length, 1, 'expected one cancellation to lose');
  assert.equal(rejected[0]?.code, 'NOT_REGISTERED', 'loser expected NOT_REGISTERED');
  await assertDatabaseHolds(0, 'cancel');
  assert.equal(
    await Participation.countDocuments({ status: PARTICIPATION_STATUS.CANCELLED }),
    1,
    'the cancelled row is kept as history, not deleted',
  );

  // A cancellation racing a fresh registration must not be able to push the
  // counter below the row count, so the spot is offered again afterwards.
  const reRegister = await postRegister(baseUrl, competitionId, userIds[1] as string, 'dancer-2');
  assert.equal(reRegister.status, 201, 'the freed spot must be registrable again');
  await assertDatabaseHolds(1, 're-register');
  console.log('  the freed spot is registrable again, counter never went negative');
}

async function main(): Promise<void> {
  await startMemoryDb();

  const { server, baseUrl } = await listen();
  console.log(`[concurrency] app listening in-process on ${baseUrl}`);
  console.log(`[concurrency] mongod is ephemeral, the dev database is untouched`);

  try {
    const organizer = await makeOrganizer();
    const competition = await makeCompetition({
      organizerId: organizer._id,
      maxParticipants: TOTAL_SPOTS,
      // A window an hour either side of now, so a slow machine cannot land an
      // assertion on a boundary and turn this into a flaky test.
      now: Date.now(),
      registrationOpensAt: new Date(Date.now() - HOUR_MS),
      registrationClosesAt: new Date(Date.now() + HOUR_MS),
    });

    const dancers = await Promise.all(
      Array.from({ length: CONTENDERS }, () =>
        makeUser({ primaryDanceForm: DANCE_FORMS.BHARATANATYAM }),
      ),
    );
    const userIds = dancers.map((dancer) => dancer._id.toString());
    const competitionId = competition._id.toString();

    console.log(
      `[concurrency] competition ${competitionId} with ${TOTAL_SPOTS} spot, ` +
        `${CONTENDERS} contenders, 0 registered`,
    );

    await verifyRegisterRace(baseUrl, competitionId, userIds);
    await verifyCancelRace(baseUrl, competitionId, userIds[0] as string, userIds);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main()
  .then(async () => {
    await stopMemoryDb();
    console.log('\n[concurrency] PASS — one spot, five contenders, no oversell and no lost update');
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('\n[concurrency] FAIL', error);
    await stopMemoryDb();
    process.exit(1);
  });

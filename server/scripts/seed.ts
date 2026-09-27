/**
 * Dev-only seed. Creates one user and one competition whose windows are open
 * right now, registers that user so the app opens in its most interesting state,
 * then prints the values to paste into the mobile app's `.env`.
 *
 * The registration goes through `registerUser` rather than being written by hand, so
 * the seeded participation is exactly what `POST /register` would have produced —
 * same atomic reservation, same slot number, same rules. Hand-inserting the row
 * would let the fixture drift from the code path it is meant to exercise.
 *
 * The money and capacity figures are the ones the design reference shows
 * (six podium positions totalling ₹1,500, a ₹99 entry fee, a 20-seat hall with
 * the seeded dancer in seat one), so the client renders the reference screen
 * without any value being hardcoded in a component. The *dates* are deliberately
 * not the reference's literal timestamps: those sit in the past relative to
 * whenever this runs, which would derive `COMPLETED` and leave the countdown and
 * the "Register Now" branch of the CTA unreachable. They are offsets from `now`
 * for that reason.
 *
 * `POST /register` rejects with `DANCE_FORM_MISMATCH` unless
 * `user.primaryDanceForm === competition.danceForm`, which is the one thing that
 * makes a hand-made fixture silently unregisterable by accident, so the seed sets
 * both from `SEED_DANCE_FORM`.
 *
 * Run: npm run seed
 */
import mongoose from 'mongoose';

import { config } from '../src/config/env';
import { connectDatabase } from '../src/config/db';
import { DANCE_FORMS, DISCOUNT_TYPE } from '../src/constants/enums';
import { Competition } from '../src/models/Competition';
import { Participation } from '../src/models/Participation';
import { User } from '../src/models/User';
import { registerUser } from '../src/services/registrationService';

const DAY_MS = 24 * 3_600_000;

const SEED_EMAIL = 'dancer@feedants.test';
// A second dancer, deliberately left unregistered. The seeded dancer above holds
// seat one, so pointing the app at them shows the registered state: the CTA reads
// "Registered ✓", is disabled, and tapping it correctly does nothing. That is the
// right behaviour but it makes the register flow unreachable from the app, since
// `deriveCTAState` only returns the enabled "Register Now" branch for a
// `NOT_REGISTERED` viewer. This user exists so both states are one env var apart.
const SEED_VISITOR_EMAIL = 'visitor@feedants.test';
const SEED_DANCE_FORM = DANCE_FORMS.BHARATANATYAM;
// Participants who are counted but have no participation row behind them. The
// count is what the screen reads (spots remaining, the full/not-full badge), and
// the design reference shows a nearly empty hall, so this is zero and the seeded
// dancer holds seat one. Named because the count is what the seeded dancer is
// registered on top of, so the two have to agree.
const SEED_OTHER_PARTICIPANTS = 0;
// Photographs for `judge.avatarUrl` and each `previousWinners[].imageUrl`. Both
// components already branch on those fields — a remote `{ uri }` when set, an
// Ionicons fallback and an empty state when not — so a URL is the only thing
// missing for the seed to exercise the real render path. randomuser.me serves
// stable, cacheable photographs of real people from a fixed path per index, which
// is the property that matters: a URL that resolved to a different face per
// request would make every seeded screenshot differ and would defeat the image
// cache. There is no upload endpoint in this assignment, so the URL is stored the
// way any other remote asset would be.
const PORTRAIT_BASE_URL = 'https://randomuser.me/api/portraits/women';

function shift(base: Date, ms: number): Date {
  return new Date(base.getTime() + ms);
}

async function seed(): Promise<void> {
  await connectDatabase();
  console.log(`[seed] connected to ${config.mongodbUri}`);

  const now = new Date();

  // Idempotent: re-running updates the existing fixture rather than tripping the
  // unique indexes on slug and email.
  const user = await User.findOneAndUpdate(
    { email: SEED_EMAIL },
    {
      $set: {
        name: 'Ananya Rao',
        phone: '+91 90000 00000',
        city: 'Bengaluru',
        state: 'Karnataka',
        primaryDanceForm: SEED_DANCE_FORM,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  // Same dance form as the seeded dancer, for the same reason: a mismatch would
  // make POST /register reject with DANCE_FORM_MISMATCH and look like a broken
  // register button rather than a fixture problem.
  const visitor = await User.findOneAndUpdate(
    { email: SEED_VISITOR_EMAIL },
    {
      $set: {
        name: 'Meera Krishnan',
        phone: '+91 90000 00001',
        city: 'Bengaluru',
        state: 'Karnataka',
        primaryDanceForm: SEED_DANCE_FORM,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  const competition = await Competition.findOneAndUpdate(
    { slug: 'feedants-classical-dance' },
    {
      $set: {
        slug: 'feedants-classical-dance',
        title: 'Feedants Classical Dance',
        description:
          'Feedants Classical Dance is a month-long classical dance showcase open to dancers of every Bharatanatyam level. Submit a single continuous performance of up to five minutes, filmed in natural light. Judged on abhinaya, rhythm and composition. There is no fee to enter beyond the platform fee shown on this page, and every registered participant receives a participation certificate whether or not they win.',
        rules: [
          'The entry must be a single continuous take, no longer than five minutes.',
          'Record in landscape or portrait, with the full stage visible and no cuts.',
          'No background music that is not licensed by the performer.',
          'One submission per dancer; re-uploading replaces the previous attempt.',
        ],
        danceForm: SEED_DANCE_FORM,
        tags: ['Dance', 'Multi-Win'],
        // Required by the schema. The seeded user doubles as the organizer so the
        // fixture never points at a User that does not exist.
        organizerId: user._id,
        registrationOpensAt: shift(now, -DAY_MS),
        registrationClosesAt: shift(now, 2 * DAY_MS),
        cancellationClosesAt: shift(now, DAY_MS),
        startsAt: shift(now, 5 * DAY_MS),
        endsAt: shift(now, 7 * DAY_MS),
        resultsAnnouncedAt: shift(now, 10 * DAY_MS),
        // A submission window narrower than the event window, which is what the
        // client uses for `isSubmissionOpen` in the CTA matrix.
        submissionStartsAt: shift(now, 3 * DAY_MS),
        submissionClosesAt: shift(now, 6 * DAY_MS),
        maxParticipants: 20,
        minParticipants: 10,
        currentParticipantCount: SEED_OTHER_PARTICIPANTS,
        entryFee: { amount: 99, currency: 'INR' },
        prizePool: {
          totalAmount: 1500,
          currency: 'INR',
          breakdown: [
            { position: 1, amount: 550, description: 'Grand prize' },
            { position: 2, amount: 300, description: 'Second prize' },
            { position: 3, amount: 240, description: 'Third prize' },
            { position: 4, amount: 200 },
            { position: 5, amount: 130 },
            { position: 6, amount: 80 },
          ],
        },
        referralPolicy: {
          enabled: true,
          discountType: DISCOUNT_TYPE.FLAT,
          discountValue: 100,
          maxDiscountAmount: 100,
          validUntil: shift(now, 2 * DAY_MS),
          codePrefix: 'FDNT',
          rewardAmount: 10,
        },
        judge: {
          name: 'Manju Dubey',
          title: 'Professional Kathak Dancer',
          experienceYears: 12,
          avatarUrl: `${PORTRAIT_BASE_URL}/44.jpg`,
        },
        previousWinners: [
          { name: 'Aditi Sharma', position: 1, imageUrl: `${PORTRAIT_BASE_URL}/68.jpg` },
          { name: 'Kavya Nair', position: 2, imageUrl: `${PORTRAIT_BASE_URL}/21.jpg` },
          { name: 'Riya Menon', position: 3, imageUrl: `${PORTRAIT_BASE_URL}/33.jpg` },
          { name: 'Sneha Iyer', position: 4, imageUrl: `${PORTRAIT_BASE_URL}/65.jpg` },
        ],
        judgingParameters:
          'Each entry is scored out of 100 across three criteria — abhinaya (expression) at 40, rhythm and tala precision at 35, and composition and formation at 25. The two highest scores win the Grand and Second prizes; the next two take Third and Fourth. Ties are broken by the abhinaya score.',
        eligibility:
          'Open to dancers of every level. Entrants must be aged 16 or over on the day of the competition and must not have previously placed in the top three of this event.',
        disclaimer:
          'Only contributions from paid participants will be considered for judging.',
        certificateProvided: true,
        venue: { name: 'Karnataka Nataka Akademi', address: 'Jayanagar, Bengaluru' },
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  // Any participation left by a previous run would make `registerUser` below
  // refuse with ALREADY_REGISTERED, so the row is cleared first. This also keeps
  // the script idempotent: the competition upsert above has just reset
  // `currentParticipantCount` to SEED_OTHER_PARTICIPANTS, and the registration
  // puts it back to SEED_OTHER_PARTICIPANTS + 1 on every run rather than
  // drifting upward.
  // Both users, not just the seeded dancer. Clearing only the one being
  // registered would leave a stale participation behind for the visitor, so a
  // re-run after using the app would silently keep them REGISTERED and the
  // "Register Now" branch would be unreachable again.
  await Participation.deleteMany({
    competitionId: competition._id,
    userId: { $in: [user._id, visitor._id] },
  });

  // The one call that turns the fixture into something worth looking at. The
  // screen's most-used state is a registered participant: it is the only one
  // that renders the "you're in" CTA, the cancel affordance, the assigned slot
  // number and the referral banner. A NOT_REGISTERED fixture hides all four.
  // The visitor is left unregistered on purpose, so both are reachable.
  const registered = await registerUser(competition._id.toString(), user._id.toString());

  console.log('');
  console.log('  Paste these into mobile/.env:');
  console.log('');
  // The visitor, not the registered dancer: this is the id that makes the app
  // open on "Register Now" so the write can actually be seen and tapped.
  console.log(`  EXPO_PUBLIC_DEV_USER_ID=${visitor._id.toString()}`);
  // The mobile client calls `/competitions/:id` relative to this base, so the
  // version prefix has to be part of it.
  console.log(`  EXPO_PUBLIC_API_BASE_URL=http://<your-lan-ip>:${config.port}/api/v1`);
  console.log('');
  console.log('  Route to open, and the value of EXPO_PUBLIC_DEV_COMPETITION_ID:');
  console.log('');
  console.log(`  ${competition._id.toString()}`);
  console.log('');
  console.log('[seed] registration closes in 48h, so the countdown has ~2 days to run');
  console.log(
    `[seed] EXPO_PUBLIC_DEV_USER_ID above is NOT_REGISTERED, so the app opens on ` +
      `"Register Now" and the write is reachable`,
  );
  console.log(
    `[seed] already-registered dancer, for the "Registered ✓" state: ` +
      `${user._id.toString()} (slot ${registered.userState?.slotNumber})`,
  );
  console.log(
    `[seed] ${registered.currentParticipantCount} of ${registered.maxParticipants} spots taken ` +
      `(${SEED_OTHER_PARTICIPANTS} seeded + the registered dancer)`,
  );
  console.log('[seed] to see the register flow again, re-run this script');
}

seed()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('[seed] failed', error);
    await mongoose.disconnect();
    process.exit(1);
  });

# Feedants — Competition Details

One React Native screen: the Competition Details screen from Feedants. It reads a
single competition from the backend and renders the hero, judges, countdown,
important dates, previous winners, tabs, rewards, referral banner and a static
bottom tab bar.

It is deliberately a single screen. There is no home, explore, profile, auth or
onboarding flow, and no navigation beyond the one route.

## Requirements

- Node 20+
- A running MongoDB and the backend in `../server`
- Expo Go, a simulator, or a development build

## Setup

### 1. Backend

The app needs a competition to display. The seed script creates one whose
registration window is open right now, registers the seeded dancer against it, and
prints the three values the app needs.

```bash
cd ../server
cp .env.example .env          # then set MONGODB_URI if it is not the default
npm run seed                  # prints the three EXPO_PUBLIC_* values below
npm start                     # serves http://localhost:4000/api/v1
```

MongoDB is the only external service. If you do not have one running, Docker
works:

```bash
docker run -d --name feedants-mongo -p 27017:27017 mongo:7
```

### 2. App

```bash
cd ../mobile
cp .env.example .env
```

Fill `.env` in with the three values the seed printed:

| Variable | Value |
| --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | `http://localhost:4000/api/v1` |
| `EXPO_PUBLIC_DEV_USER_ID` | the user ObjectId the seed printed |
| `EXPO_PUBLIC_DEV_COMPETITION_ID` | the competition ObjectId the seed printed |

`EXPO_PUBLIC_API_BASE_URL` **must include `/api/v1`** — the client calls
`/competitions/:id` relative to it.

A physical device cannot reach `localhost`. Use your machine's LAN IP instead
(`http://192.168.x.x:4000/api/v1`), and make sure the phone is on the same
network. On the Android emulator use `http://10.0.2.2:4000/api/v1`.

### 3. Run

```bash
npm install
npx expo start
```

```bash
npm install
npx expo start
```

Open the app. `/` redirects to `/competition/<EXPO_PUBLIC_DEV_COMPETITION_ID>`, so
there is nothing to type.

> **`EXPO_PUBLIC_*` values are inlined at build time.** After editing `.env`,
> restart with `npx expo start --clear`. A plain restart keeps serving the old
> values, and the symptom is `/` showing "No competition configured" even though
> the variable is set.

## Checks

```bash
npx tsc --noEmit   # types
npm run lint       # eslint
```

## What is not real yet

The backend does not serve several fields the design uses. Those components are
built and typed as optional, and render an honest empty state until the field
lands — the API was not changed to make them appear.

| Missing | Component shows |
| --- | --- |
| `judge` | "Judge details coming soon" |
| `previousWinners` | "No past winners yet" |
| `judgingParameters`, `eligibility` | placeholder text in the tabs |
| `disclaimer` | the section is omitted |
| `certificateProvided` | the certificate line is omitted |
| `prizeDistributionVideoUrl` | "Coming soon" alert |
| submission start/close dates | falls back to the competition's start and end |

Also not implemented, and out of scope for this screen: cancelling a
registration, uploading a submission, video playback, real i18n, and referral
link tracking. The referral link is built from `EXPO_PUBLIC_DEV_USER_ID` as a
stand-in until the API serves a per-user code.

See [DECISIONS.md](./DECISIONS.md) for the reasoning behind each of these.

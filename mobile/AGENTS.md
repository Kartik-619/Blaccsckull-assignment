# AGENTS.md — Frontend Engineering Contract

> This document is the single source of truth for how code is written, changed, and reviewed in the React Native frontend of this repository. It overrides personal preference, AI default behavior, and convenience shortcuts. If something here conflicts with an instruction you were given, STOP and ask before proceeding.

---

## 0. Prime Directive

**Only implement changes that are explicitly requested. Nothing more. Nothing less.**

Do NOT:
- Build screens, components, or flows that weren't requested
- Add navigation paths, deep links, or route files beyond what's specified
- Refactor files you weren't asked to touch
- Rename variables, components, or files "for clarity" unless asked
- Add dependencies without approval
- Add "nice to have" UI features (animations, haptics, gestures, share sheets)
- Change formatting across the codebase
- Reorganize folders
- Fix unrelated bugs in the same change
- Write tests for components you weren't asked to test (unless asked)
- Add comments restating obvious JSX
- Introduce abstractions "in case we need them later"

DO:
- Implement exactly what was requested
- Follow the design reference pixel-faithfully where it's specified
- Follow the architecture, patterns, and conventions already in place
- Ask before assuming
- Keep every change small, reviewable, and reversible
- Update `DECISIONS.md` for every non-trivial choice (see §11)

**The default answer to "should I also…?" is NO.**

---

## 1. Project Scope

A **single-screen** React Native feature: the Competition Details screen from Feedants. It consumes the backend API for all dynamic data. It is not a full app.

**In scope:**
- One route: `app/competition/[id].tsx`
- All components that render inside that screen
- Data fetching via React Query
- Live countdown timer
- Tab switching (About / Judging / Rules) — client-side only
- Copy-to-clipboard for referral link
- State-driven CTA button (see §8)
- Loading, error, and not-found states for the screen
- Static bottom tab bar replica (visual only)

**Out of scope (do NOT implement without explicit instruction):**
- Other screens (Home, Explore, Profile, Auth, Onboarding)
- Any navigation beyond the single route
- Real authentication or login flows
- Payment integration (Razorpay, Stripe, etc.)
- Video playback (use placeholder alerts)
- i18n / language switching (visual only)
- Push notifications
- Deep linking
- Analytics / event tracking
- Animation libraries (Reanimated, Moti) unless asked
- Gesture libraries (Gesture Handler, PanResponder) unless asked
- Any feature not visible in the design reference

If a request implies any of the above, STOP and confirm.

---

## 2. Tech Stack (Locked)

| Concern | Choice |
|---|---|
| Framework | Expo (latest stable SDK) |
| Routing | Expo Router (file-based) |
| Language | TypeScript (strict mode) |
| Styling | NativeWind |
| Server state | `@tanstack/react-query` |
| HTTP | `axios` |
| Date/time | `dayjs` |
| Clipboard | `expo-clipboard` |
| Safe areas | `react-native-safe-area-context` |
| Icons | `@expo/vector-icons` (Ionicons) |
| Toasts | `react-native-toast-message` (or `Alert` as fallback) |

**Do not introduce new dependencies without explicit approval.** If you believe one is required, propose it with: (1) what problem it solves, (2) alternatives considered, (3) cost (bundle size, native modules, maintenance). Wait for approval.

**Explicitly forbidden libraries:**
- Redux, Zustand, Jotai, MobX (React Query + local state is sufficient)
- React Native Paper, Tamagui, NativeBase, Gluestack (build from primitives)
- Reanimated, Moti (no animations in this scope)
- Styled Components / Emotion (NativeWind is the styling solution)
- Moment.js (dayjs is the date library)

---

## 3. Project Structure (Locked)
frontend/
├── app/
│ ├── _layout.tsx # Root layout: providers only (QueryClient, SafeArea, Toast)
│ └── competition/
│ └── [id].tsx # THE screen — orchestration only
├── components/
│ ├── common/
│ │ ├── Card.tsx # White card wrapper w/ shadow + radius
│ │ ├── Skeleton.tsx # Loading placeholder
│ │ ├── ErrorState.tsx # Full-screen error w/ retry
│ │ └── SectionHeader.tsx # Bold label + optional subtitle
│ └── competition/
│ ├── TopBar.tsx
│ ├── HeaderCard.tsx
│ ├── JudgeCard.tsx
│ ├── CountdownBanner.tsx
│ ├── ImportantDatesGrid.tsx
│ ├── PreviousWinnersCarousel.tsx
│ ├── TabsSection.tsx
│ ├── RewardsList.tsx
│ ├── DisclaimerBanner.tsx
│ ├── InfoRow.tsx
│ ├── ReferralBanner.tsx
│ ├── HearFromUsersRow.tsx
│ ├── AdPlaceholder.tsx
│ ├── PrimaryCTAButton.tsx
│ └── BottomTabBar.tsx
├── hooks/
│ ├── useCompetitionDetails.ts # React Query wrapper
│ └── useCountdown.ts # Server-time-aware countdown
├── lib/
│ ├── api.ts # axios instance + auth header
│ ├── colors.ts # Design tokens
│ ├── formatters.ts # dayjs wrappers
│ └── queryClient.ts # React Query client config
├── types/
│ └── competition.ts # API response types
├── constants/
│ └── enums.ts # LifecycleStatus, UserRelationship, etc.
├── .env.example
├── app.json
├── tailwind.config.js
├── tsconfig.json
├── package.json
├── AGENTS.md # this file
└── DECISIONS.md # decision log

text

**Rules:**
- Do not create new top-level folders without approval.
- Do not create a component file unless it maps to a distinct visual section in the design.
- One component per file. No exceptions.
- If a component requires the word "and" to describe its responsibility, split it.

---

## 4. Layered Architecture

Every screen render flows through exactly these layers:
Route → Screen → Hooks → Components (presentational)

text

### 4.1 Route (`app/**`)
- File-based routing via Expo Router.
- The route file (`[id].tsx`) is the **screen**. It:
  - Reads route params (`useLocalSearchParams`)
  - Calls hooks (`useCompetitionDetails`, `useCountdown`)
  - Composes child components
  - Handles screen-level state (loading, error, not-found)
  - Handles user actions (register mutation, copy link)
- **Forbidden in route files:** inline JSX for more than 30 lines, direct `axios` calls, hardcoded colors or strings that belong in components.

### 4.2 Hooks (`hooks/`)
- Encapsulate **data fetching** and **stateful logic**.
- `useCompetitionDetails(id)` — wraps React Query, returns `{ data, isLoading, isError, error, refetch }`.
- `useCountdown(targetDate, serverTime)` — returns `{ days, hours, minutes, seconds, isExpired }`.
- Hooks do NOT render. Hooks do NOT contain JSX.
- Hooks do NOT import components.
- A hook that fetches data returns a stable shape; do not mix fetching and derived state in a way that surprises callers.

### 4.3 Components (`components/`)
- Presentational. Receive data via props. Render JSX.
- **Forbidden in components:** direct API calls, React Query hooks (with one exception: `PrimaryCTAButton` may receive a mutation as prop, but not own it), business logic beyond formatting.
- A component may own **local UI state** (e.g., `TabsSection` owns the active tab). This is allowed and encouraged.
- A component may accept event handlers as props (`onPress`, `onCopy`).
- Components never reach into global state or navigation unless explicitly allowed. `TopBar` may use `router.back()`. Otherwise, navigation is a prop.

### 4.4 Lib (`lib/`)
- Pure utilities. No React. No JSX.
- `api.ts` — axios instance, base URL, auth header injection, response interceptor for error normalization.
- `colors.ts` — design token constants (no hex codes elsewhere).
- `formatters.ts` — `formatDate`, `formatTime`, `formatCurrency`, `truncate`.
- `queryClient.ts` — React Query client with default options.

### 4.5 Types (`types/`)
- All API response types live here.
- No `any`. No `unknown` unless explicitly narrowing.
- Types are the contract with the backend. They must mirror the actual API response shape.

---

## 5. Coding Standards

### 5.1 Style
- ESLint + Prettier enforced via Expo defaults.
- 2-space indentation.
- Semicolons: yes.
- Quotes: single, unless JSX attribute (then double).
- Trailing commas: yes.
- Max line length: 100 characters.
- JSX props: one per line if more than 3.

### 5.2 Naming
- Files: `PascalCase.tsx` for components, `camelCase.ts` for hooks/lib/types.
- Components: `PascalCase`.
- Hooks: `useCamelCase`.
- Variables / functions: `camelCase`.
- Constants: `SCREAMING_SNAKE_CASE`.
- Booleans: prefix with `is`, `has`, `can`, `should`.
- Props interfaces: `{ComponentName}Props`.
- Event handlers: prefix with `handle` in the defining component (`handlePress`), `on` in the consuming component (`onPress`).

### 5.3 Components
- Function components only. No class components.
- Default export for the component. Named export for the props type.
- Max 150 lines per component file. If longer, extract subcomponents.
- Max 3 props per component is a soft target; if more, group them into a props object.
- No `React.FC`. Type props directly.
- Do not use `useMemo` or `useCallback` unless there is a measured need. React Native's re-renders are cheap for small trees.

### 5.4 TypeScript
- `strict: true` in tsconfig.
- No implicit `any`.
- Prefer `interface` for props and API shapes; `type` for unions and aliases.
- Discriminated unions for state machines (e.g., `lifecycleStatus`).
- No non-null assertions (`!`) unless truly guaranteed (e.g., after `?.` guard).
- Type imports via `import type`.

### 5.5 Imports
- Order: (1) React, (2) React Native, (3) third-party, (4) local absolute (`@/`), (5) relative.
- Absolute imports via `@/` path alias (configure in `tsconfig.json` and `babel.config.js`).
- No circular imports.

### 5.6 Comments
- Comments explain **why**, not **what**.
- No commented-out code.
- No TODO comments committed. Open a DECISIONS.md "Future work" entry instead.
- Complex derived logic (CTA matrix, countdown math) may have a one-line comment explaining intent.

---

## 6. Styling Discipline (NativeWind)

### 6.1 Rules
- Use Tailwind classes for all layout, spacing, typography, and colors.
- Use `style={{}}` ONLY for dynamic values: progress bar width, countdown widths, image aspect ratio when computed.
- No hex codes in components. Colors come from `lib/colors.ts`, and colors used as Tailwind classes come from `tailwind.config.js` (extend theme with brand colors).
- No CSS-in-JS. No `StyleSheet.create` unless the class cannot be expressed in Tailwind (rare).
- Extract repeated class strings only when the SAME string appears in 3+ places. Otherwise, keep inline.

### 6.2 Layout Conventions
- Use `gap-*` for spacing between siblings, not `margin-*`.
- Use `p-*` for padding inside containers, not `margin` on children.
- Rounded cards: `rounded-xl`. Shadow: use `shadow-sm` or a custom shadow class defined in Tailwind config.
- Screen horizontal padding: `px-4` (16px).
- Card vertical gap: `gap-3` or `gap-4`.

### 6.3 Responsive
- Design is mobile-only (portrait). Do NOT add tablet or landscape handling.
- Do NOT use `useWindowDimensions` unless a specific element requires it (e.g., progress bar width — but this can be a percentage).

### 6.4 Safe Areas
- Wrap the screen in `SafeAreaView` from `react-native-safe-area-context`.
- Sticky CTA button must respect bottom safe area.
- TopBar must respect top safe area.

---

## 7. Data Fetching Rules

### 7.1 React Query
- One hook per endpoint: `useCompetitionDetails(id)`.
- `staleTime: 30_000` (30 seconds).
- `refetchOnWindowFocus: false` (RN doesn't have window focus; React Query's default may misbehave).
- `retry: 1`.
- Query keys: `['competition', id]` — always array-form, always typed.
- Do NOT write fetch logic directly in components.
- Do NOT use `useEffect` for data fetching.

### 7.2 API Client (`lib/api.ts`)
- Single axios instance.
- Base URL from `process.env.EXPO_PUBLIC_API_BASE_URL`.
- Request interceptor injects `x-user-id` header from `process.env.EXPO_PUBLIC_DEV_USER_ID`.
- Response interceptor normalizes errors into a `{ code, message }` shape (matching the backend error contract).
- No business logic in interceptors. Only transport concerns.

### 7.3 Loading, Error, Empty States
- Every data-dependent screen MUST handle: loading, error, success, empty.
- Loading: render skeleton components that mimic the layout. Not a spinner. Not a blank screen.
- Error: render `ErrorState` with retry button.
- Empty / Not Found: render a specific message with a back action.

### 7.4 Mutations
- Mutations live in the hook that owns the data (`useCompetitionDetails` can return `register` mutation).
- On mutation success: `queryClient.invalidateQueries({ queryKey: ['competition', id] })`.
- On mutation error: surface via toast. Do NOT swallow.
- No optimistic updates unless explicitly requested.
- No manual cache writes unless explicitly requested.

---

## 8. The CTA Button State Machine (Load-Bearing)

The CTA button is the most important interactive element. Its state is a **pure function** of:

- `lifecycleStatus` (from API)
- `userState.relationship` (from API)
- `spotsRemaining` (from API)
- `isSubmissionOpen` (derived, from API or computed client-side from submission window + serverTime)

**Rules:**
- The button's label, sublabel, enabled state, and on-press action MUST be determined by a single function: `deriveCTAState(competitionDetails): CTAState`.
- This function lives in `components/competition/PrimaryCTAButton.tsx` or a helper in `lib/`. Justify the location in DECISIONS.md.
- The function must be exhaustively typed. A `switch` on `lifecycleStatus` must handle every enum value; TypeScript's exhaustive-check pattern (`never` default) must be used.
- Adding a new lifecycle status or relationship without updating `deriveCTAState` must cause a TypeScript error.

**The full CTA matrix must be implemented exactly as specified in the design prompt.** Refer to that prompt. Do not improvise states.

---

## 9. The Countdown Rule (Time Correctness)

- The countdown MUST use server time, not device time.
- `useCountdown(targetDate, serverTime)` computes `clockOffset = Date.now() - parseISO(serverTime)` on mount.
- Tick every 1000ms. Derive remaining = `targetDate - (Date.now() - clockOffset)`.
- When `remaining <= 0`, set `isExpired = true` and trigger a refetch via React Query (`queryClient.invalidateQueries`).
- Clear the interval on unmount.
- Never trust the device clock for lifecycle decisions. Only for display ticking.

This rule exists because a user with a skewed clock would otherwise see a countdown that doesn't match the actual registration window. It's a small detail that speaks to production-readiness.

---

## 10. Accessibility & Platform

- All `Pressable` elements must have `accessibilityRole="button"` and `accessibilityLabel`.
- Images must have `accessibilityLabel` if they carry meaning; `accessibilityElementsHidden` if decorative.
- Text scales with system settings automatically (RN does this by default). Do not disable.
- Do NOT add iOS-only or Android-only code paths unless asked. If you must, document why.

---

## 11. DECISIONS.md — Mandatory Log

Every non-trivial decision must be appended to `DECISIONS.md` in the same change. A change without a corresponding entry is incomplete.

### 11.1 What counts as non-trivial
- Adding, removing, or renaming a component
- Adding, removing, or renaming a hook
- Adding, removing, or renaming a route
- Choosing one approach over a viable alternative
- Any new dependency
- Any deviation from this document
- Any change to the CTA state matrix or countdown logic

### 11.2 Entry format (use this exact template)
YYYY-MM-DD — <Short title>
Context: What prompted this decision?

Decision: What was decided.

Alternatives considered: What else was on the table.

Reason: Why this over the others.

Trade-offs: What we give up.

Reversibility: Easy / Medium / Hard — and what reversing would cost.

Affected files: List of files touched.

text

### 11.3 Rules
- New entries appended at the TOP (reverse chronological).
- Never edit or delete a past entry. Supersede with a new entry.
- Be precise. "Because it's cleaner" is not a reason.

---

## 12. Change Protocol (For Every Single Change)

Before making any change, answer:

1. **What exactly was requested?** (One sentence.)
2. **What files will this touch?** (List.)
3. **What is the smallest change that satisfies the request?** (Design it.)
4. **Does this require a DECISIONS.md entry?** (See §11.1.)
5. **Does this touch the CTA matrix or countdown?** (See §8, §9.)
6. **Does this introduce a new dependency?** (If yes, stop and ask.)
7. **Does this affect the API contract?** (If yes, flag it.)

Then implement ONLY the smallest change. Then:
- Run `tsc --noEmit` (no type errors)
- Run lint
- Manually verify on device/simulator
- Update DECISIONS.md if needed
- Write a clear commit message

**If any step is unclear, STOP and ask. Do not guess.**

---

## 13. Forbidden Patterns (Hard Ban)

- `any` in TypeScript.
- `console.log` / `console.warn` in committed code (except in `__DEV__`-guarded diagnostics).
- Hardcoded hex colors in components (use `lib/colors.ts` or Tailwind classes).
- Hardcoded strings that should come from the API.
- `useEffect` for data fetching.
- Direct `axios` calls inside components or the screen (must go through hooks).
- `fetch` anywhere.
- Business logic inside JSX beyond simple ternaries for display.
- `StyleSheet.create` unless approved.
- Navigation calls inside presentational components (exception: `TopBar`'s back).
- Conditional rendering that hides elements required by the design when data is missing (use skeletons/fallbacks).
- Adding `console.error` calls to log API errors that are already handled by interceptors.
- Mutating React Query cache manually.
- `setTimeout` for anything other than the countdown tick.
- Placeholder `// TODO` comments in committed code.

---

## 14. Screen Composition Rule

The route file `app/competition/[id].tsx` is the **orchestrator**. It:

- Reads `id` from `useLocalSearchParams`.
- Calls `useCompetitionDetails(id)`.
- Calls `useCountdown(...)` conditionally (only when needed).
- Handles loading / error / not-found branches.
- Renders a `ScrollView` containing the component tree.
- Renders the sticky `PrimaryCTAButton` and `BottomTabBar` outside the ScrollView.
- Wires up event handlers (register, copy link, back).

The route file must be under 200 lines. If it grows beyond that, extract logic into hooks.

**The route file contains no direct JSX for individual UI sections.** All sections are components.

---

## 15. Environment & Config

- All env vars prefixed `EXPO_PUBLIC_` (Expo's requirement for client-side exposure).
- Required vars (see `.env.example`):
  - `EXPO_PUBLIC_API_BASE_URL` — backend base URL
  - `EXPO_PUBLIC_DEV_USER_ID` — hardcoded user ID for auth stub
- Never commit `.env`. Only `.env.example`.
- Read env vars via `process.env.EXPO_PUBLIC_*` only in `lib/api.ts` or a config module. Not scattered.

---

## 16. Definition of Done (Per Change)

A change is "done" only when ALL of the following are true:

1. The requested behavior works end-to-end on device/simulator.
2. No unrelated files were modified.
3. No forbidden patterns were introduced.
4. `tsc --noEmit` passes with zero errors.
5. Lint passes with zero warnings.
6. DECISIONS.md updated if the change is non-trivial.
7. If the CTA matrix or countdown was touched, §8 and §9 checklists are satisfied.
8. The commit message follows §17.
9. The screen loads and renders correctly against the live backend.

Anything less is not done.

---

## 17. Commit Message Format
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

Scopes: `screen`, `component`, `hook`, `api`, `style`, `types`, `config`, `docs`, `fix`.

`refactor` commits are NOT allowed unless explicitly requested.

---

## 18. When in Doubt

Ask. Do not guess. Do not "improve." Do not expand scope. The cost of a 30-second clarifying question is infinitely lower than the cost of an unwanted feature.

**Before any commit, verify:**
- [ ] Change matches the request exactly
- [ ] No extra files touched
- [ ] No new dependencies
- [ ] No forbidden patterns introduced
- [ ] DECISIONS.md updated if required
- [ ] `tsc --noEmit` passes
- [ ] Lint passes
- [ ] Screen still renders on device
- [ ] CTA matrix unaffected (unless intentionally changed)

---

**End of contract.**
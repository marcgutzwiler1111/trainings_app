# Application foundation — CODEX-004

## Scope and specification

This task explicitly implements Home → Builder → persisted Workout Overview,
resume and incomplete termination. It refines the original phase numbering in
`docs/06_implementation_plan.md`: Exercise Management from that document's Phase 3
is intentionally deferred; the requested subset of Home/Builder is implemented
here. No product specification files have been rewritten. Training, timers,
workout completion and the end-of-workout override decision remain future work.

## Boundaries and files

- `application/provider.tsx`: small React context, created inside SQLiteProvider
  after database initialization. Repository and service instances are memoized by
  SQLite connection; there is no global application singleton.
- `application/services.ts`: Home view model, guarded Rest completion, builder
  loading, atomic start orchestration, snapshot overview and incomplete ending.
  No SQL or React imports. Database exceptions are mapped to a generic UI message;
  explicit FeatureError messages describe recoverable user-facing problems.
- `workout/builder.ts`: one central Strength/Circuit effect mapping, default roles,
  unselected initial exercise fields, filtering/search, validation and immutable
  reorder helper. Duration delegates to the existing Domain Core calculation.
- `src/hooks/useFeature.ts`: focus-aware loading/retry with abandoned-request
  protection, plus a synchronous action lock to guard repeated taps. No false
  cycle/default model is displayed while loading. Edited builder state is tied
  to the loaded configuration and is replaced when the workout type changes.
- `src/components/foundation.tsx`: simple native controls and confirmations with
  48-point minimum action targets and system light/dark colors.
- `src/components/ExerciseSelector.tsx`: reusable modal selection, active exercise
  search and available thumbnails with missing/broken-image fallback.
- `src/app/(tabs)/index.tsx`: functional Home. The other three tabs remain unchanged.
- `src/app/workout/builder.tsx`: configuration only, no early session creation.
- `src/app/workout/[id].tsx`: persisted snapshot overview, not a training runtime.

Screens consume services and perform presentation/navigation only; they never
execute SQL. Back-to-Home actions dismiss to the existing root route rather than
accumulating duplicate Home screens.

## Defaults and previous configuration

Home preselects the expected workout type; on Rest, manual workout type selection
is explicit. A fresh builder has five rounds and six stations with roles Focus,
Core, Focus, Conditioning, Focus, Non-Focus. Each station remains 60 seconds.
Exercises start unselected because the specification defines recommendations but
no mandatory default exercise. Nothing is persisted until builder confirmation.

Selectors initially show active exercises matching area and (where relevant)
effect. “Alle anzeigen” intentionally exposes all active exercises, with matching
recommendations first, allowing the documented filtering override. Selecting or
changing a station role updates recommendations without silently replacing an
already selected exercise.

Last Workout as Default uses the existing repository query for the selected type.
Only configuration is copied; no sets, reps, RIR, completion flags or runtime
progress. Referenced exercises that are no longer active are cleared with a
visible warning and must be reselected. An empty active library blocks start with
a clear message. Changing workout type reloads that type's previous configuration
or its defaults, replacing the unsaved draft as requested.

## Minimal data-layer extensions

- `Store.transaction`: composes scoped repository operations within one queued
  transaction. Scoped Stores execute directly on that transaction and must never
  escape its callback. Independent operations still use the connection-wide queue.
- `WorkoutRepository.active`: explicit active-session lookup.
- `WorkoutRepository.startConfigured`: rechecks absence of an active workout and
  exercise activity inside the transaction, captures current profile/bodyweight
  and cycle through existing repository APIs, writes all sections, then sets
  IN_PROGRESS. Any failure rolls back the entire session and its children.
- `WorkoutStartConfiguration` in `src/data/types.ts` defines the persistence input.
- `CycleRepository.completeRest(expectedPosition?)`: rejects stale confirmations
  and Rest completion while a normal workout is active. Uses the existing domain
  transition; duplicate confirmations cannot advance twice.

No schema migration or dependency change was needed. Atomic start does not start
Power/Circuit runtime: their section status stays PLANNED and progress stays empty.
Manual override is captured relative to the current expected cycle item without
making the completion-time override decision. Incomplete termination preserves
all saved configuration and leaves the cycle unchanged.

## Validation evidence

`npm run typecheck`, `npm test` and `npm run lint` pass. All 158 previous tests
remain passing; `tests/workout-foundation.test.ts` adds 32 tests (190 total).
Coverage includes all four workout mappings, Rest, defaults, validation, missing
active exercises, search/filtering, previous configuration by type, atomic rollback
on a late Circuit insert failure, concurrent start attempts, snapshot overview,
incomplete termination and real file-backed database close/reopen resume.

Expo Web was started with `EXPO_OFFLINE=1 npm run web -- --port 8084`. Browser
smoke checks in Chromium at a 390×844 viewport used the actual Expo SQLite WASM
worker and checked these interactions:

1. Home shows UK Hams and Cycle 1 / 6.
2. Select OK Brust manually; open Builder without creating a workout.
3. Search/select Power, both Strength exercises and six Circuit exercises.
4. Add/remove a station, reorder via arrows and reject zero rounds.
5. Confirm valid builder and inspect the persisted Overview (five rounds, six
   stations, 30 minutes, correct exercise snapshots).
6. Return Home; new start is unavailable while the workout is active.
7. Reload the app and resume the same workout URL/session.
8. Cancel incomplete confirmation once, then confirm; Home returns without an
   active workout and Cycle remains 1 / 6.
9. Reopen OK Brust Builder; previous configuration is populated and valid.
10. Switch dark/light mode and visit all four tabs without runtime errors.

Overview and dark Builder screenshots were also visually inspected. The browser
started at a workout cycle item, so Rest confirmation was verified through service
integration tests rather than changing the live browser database through a debug
UI. Android/iOS device behavior is not established by these web checks. No debug
screens, global test hooks, new test framework or project dependencies were added.

# Power & Circuit Benchmarks — CODEX-010

## Workflow and boundaries

Home exposes two compact, independent benchmark status cards. Each opens its own
Overview, Setup, active session, Summary and session history. The shared dynamic
routes are `/benchmark/[kind]`, `/benchmark/[kind]/setup` and
`/benchmark/[kind]/[id]`, with kind restricted to power/circuit. The session route
renders an editable active workflow or a read-only Complete/Incomplete detail.
Neither the global History tab nor Progress charts were implemented.

Screens capture/display data; `services.ts` coordinates typed repositories and
existing Domain Core calculations. SQL remains in BenchmarkRepository and the
shared active-training query. Domain protocol/progression helpers have no React,
SQLite, environment or clock dependency. No backend, state framework, dependency,
audio/haptic signal, synthetic score or separate Strength Benchmark flow was added.

## Power Benchmark

The fixed four-test sequence is Standing Broad Jump, Rotational Medicine Ball
Throw, Medicine Ball Chest Pass and Medicine Ball Shot-Put Throw. Before starting,
three separate positive ball weights are required; comma/dot decimals are accepted.
Start transactionally creates the session and six test/side groups, capturing the
rotation/chest/shot-put weights independently. Broad Jump has no external weight.
All new distances use cm, the existing repository's unit convention. No unit
conversion or left/right averaging is performed.

Each group has three attempts: 3 Broad Jump, 3 each Rotational side, 3 Chest Pass,
3 each Shot-Put side (18 total). The application command enforces fixed test order
and accepts corrections to earlier active tests. Each explicit Save immediately
upserts the same test/attempt number, preserving row ID and original created_at.
Best results are derived with Domain Core's maximum helper; best_value is not
maintained as an additional cache. Reload chooses the first unfinished test from
saved attempts, preserving left/right identity and captured ball weights.

Complete requires every group and all 18 valid attempts inside the same transaction
that sets status and completed_at/updated_at. Missing attempts cannot be bypassed
with a direct finish call. Incomplete is available with confirmation at any point;
partial attempts remain available in history. Completed and incomplete sessions
reject further attempts, added conditions and another completion.

The new start API fully captures all six conditions atomically. There is no API
for changing existing conditions; additional conditions are rejected once the
six-group setup is sealed. Repeating Start for the same active type returns its
existing identity without changing any weights. Older low-level create/add helpers
remain for persistence composition; the UI uses only the atomic setup command.

Comparisons use the most recent earlier COMPLETE session, excluding incomplete and
future sessions relative to the current session. Each current group must itself
have all three attempts. Existing arePowerBenchmarksComparable determines matching
variants/sides/ball weights; units must also agree. Different conditions show
“Not directly comparable” with the relevant weights, without a misleading delta.
Broad Jump compares without a ball weight. No overall Power score is calculated.

## Circuit Benchmark

The protocol is fixed at 6 stations × 5 rounds × 60 seconds:

1. Goblet Squat.
2. Push-ups.
3. Kettlebell Swing.
4. Pull-ups / Chin-ups.
5. Hanging Leg Raises.
6. Burpees.

Setup preloads bodyweight only when Profile actually has a value. Benchmark-specific
corrections are allowed and never write Profile/bodyweight history. Bodyweight must
be positive; external/added loads are nonnegative, including zero added pull-up load.
Start atomically captures bodyweight, all loads and six existing seed-identity station
snapshots. The existing SQLite triggers protect Circuit loads/station snapshots.
Library renames, images, deactivation and later Profile changes cannot rewrite them.
Standardized seed identity is used even when that library entry is inactive for
normal workout selection; the benchmark does not offer free exercise selection.

Effective weights and volumes use the existing domain functions: external load for
Goblet/Swing, bodyweight for Push-ups/Leg Raises/Burpees, bodyweight plus added load
for pull-ups. The read model provides per-row volume, per-exercise reps and five
rounds, exercise volume, total volume and Relative Performance. All metrics use
locked snapshots. Different sessions' loads are displayed, not turned into a
misleading overall improvement percentage or score.

## Position, timer and corrections

No extra progress field is needed: the first unsaved round/station cell identifies
the next station. `circuitBenchmarkCursor` reuses the existing linear progression
primitive; saved cells form the authoritative progress. The fixed 5×6×60 protocol
has no configurable values to copy from normal Circuit or Profile settings.

`advanceCircuit` submits the displayed session ID/round/station plus valid integer
reps >= 0. Inside one serialized transaction it checks active status and expected
cursor, then calls existing result persistence. A successful save consumes that
cursor once. Duplicate/stale Next requests fail without adding another row or
skipping a station. A failed write leaves the cursor and prior results unchanged.
Arithmetic overflow and unsafe aggregate counts are rejected before persistence.

`useBenchmarkStationTimer` reuses the existing pure Circuit countdown helpers. It
has no database writes or hidden background work. Expiry stops at zero and waits
for reps; it cannot change station automatically. Manual early completion is allowed,
consistent with normal Circuit, but also requires an explicit valid rep save.
After acknowledged Save & Next, the next timer starts only while the same screen
lifecycle is still active. An epoch guard prevents a delayed response from starting
a hidden timer after navigation/background.

Pause/resume on the same focused station preserves remaining seconds. Navigation,
background, reload and app close discard transient seconds, retaining the saved
position/results. Return requires a deliberate full 60-second station resume. No
elapsed-time catch-up, sound or haptics is added. Opening corrections pauses the
current timer. Only previously saved cells can be corrected; their IDs remain
stable and the next unsaved cursor does not move.

After the final saved cell, cursor is null and all 30 results are ready. No wrap or
automatic Complete occurs. The user explicitly completes the benchmark. Session
summary includes locked conditions, total volume, Relative Performance and all six
exercise breakdowns with five round values. Terminal summaries scroll to their
status/header after completion and expose no editing controls.

## Due states, history and active-session protection

Existing calculateBenchmarkDueState remains authoritative for the two independent
30-day intervals. `benchmarkSchedule` exposes dates using that same domain interval.
Only the latest COMPLETE timestamp of the selected type counts. No completion means
“Not tested yet”, with no invented date; 29/30/31-day behavior remains unchanged.
Incomplete data never resets a schedule. Home reloads on focus after completion.
Being due does not block normal workouts.

Overview lists sessions newest first, with date/status and read-only terminal detail.
Complete and Incomplete store their end timestamp atomically. Benchmark actions never
call cycle/override completion. Normal Cycle/Rest behavior and exercise-level Strength
PR eligibility are unchanged. A benchmark's completion is never a cycle event.

`readActiveTraining` checks normal workouts, Power and Circuit sessions. All start
paths and direct normal IN_PROGRESS activation check this inside existing queued
transactions. At most one active training unit is created by these APIs. Same-type
repeated benchmark starts resume the existing session; cross-type and normal-workout
starts show a recoverable resume/end message. Both UI and repositories enforce this.
No active session is silently ended or repaired.

## Schema and compatibility

No migration is required; schema version stays 3 and no package/lockfile changes
were made. The six Phase-2 benchmark tables already store all results, conditions,
identities and timestamps. Circuit cursor is derived, and rounds/duration belong to
the fixed MVP protocol, so no parallel runtime/settings columns were introduced.
Published migrations, seeds, product specifications and unrelated features are intact.

All 393 previous tests remain. Three Phase-2 persistence fixtures now prepare full
18/30-result sessions before COMPLETE, or explicitly end the partial Circuit before
starting Power. Their existing assertions remain, including file-backed preservation.
New tests independently verify actual active Circuit resume after reopening.

## Files

- `src/domain/benchmarks/protocol.ts`: protocol, Power best/progress and Circuit cursor.
- `src/domain/benchmarks/due.ts`: existing due rules plus schedule dates.
- `src/data/activeTraining.ts`: shared active-unit query/error.
- `src/data/repositories/benchmark.ts`: existing APIs extended with guarded workflows.
- `src/data/repositories/workout.ts`: cross-training start/activation guards only.
- `src/features/benchmarks/services.ts`: validation, view models, due/history/services.
- `PowerSession.tsx`, `CircuitSession.tsx`, `BenchmarkActions.tsx`: runtime/detail UI.
- `src/hooks/useBenchmarkStationTimer.ts`: screen-local rep-gated countdown lifecycle.
- `src/app/benchmark/[kind]/{index,setup,[id]}.tsx`: contextual routes.
- `src/features/application/services.ts`: registration, Home status and Builder guard.
- `src/app/(tabs)/index.tsx`: compact status/active-session entry.
- `tests/benchmarks.test.ts`, `tests/support/benchmarks.ts`, `tests/persistence.test.ts`.
- `DEVELOPMENT.md` and this README.

## Verification

- Typecheck and lint passed without warnings.
- 468 tests passed, no failures/skips: 393 previous tests plus 75 new tests.
- Coverage includes independent due dates, 29/30/31 days, latest Complete, incomplete
  exclusion, comparable/incompatible weights, fixed tests/sides, upsert IDs, complete
  guards, stale cursor races, cross-training races, injected setup/result/completion
  rollback, read-only history, real file-backed resume, arithmetic safety, unchanged
  snapshots/Profile/Library/Strength PRs, normal workouts and due-not-blocking behavior.
- Android/iOS Metro/Hermes exports passed with two workers.
- Native device tests not performed: no native device/emulator/iOS runtime is
  configured. Exports and browser checks do not imply native execution.

Chromium at 390×844 used real Expo SQLite WASM and actual UI Save/Next commands:
Power setup → all attempts → mid-session reload/resume → correction → Complete →
Summary/Home/due/history; changed-weight comparison and confirmed Incomplete were
also checked. Circuit setup → 30 cells → correction → explicit Complete → metrics,
history and due; mid-session navigation/reload/background, pause/resume, zero reps,
expiry waiting for reps, no final wrap and partial Incomplete were verified. Profile
remained unset when bodyweight was supplied only for the benchmark. Timer expiry
used a test-only browser clock, with no production test hooks.

Separate browser regressions passed the full normal workout flow for matching and
both override decisions, Settings/bodyweight/history/timer defaults, and Exercise
Management including OPFS images, edit/deactivation/reactivation and Builder choices.
The mobile Circuit and summary layouts were visually inspected. All temporary
browser tooling and screenshots remain outside the repository.

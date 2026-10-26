# Workout Completion — CODEX-007

## Flow and ownership

Home → Builder → Power → Strength → Circuit → Overview/Summary → explicit
completion → success feedback → Home. Circuit completion alone still leaves the
workout IN_PROGRESS. Overview offers “Zusammenfassung & Abschließen” only when
all sections are ready; the completed Circuit also links to Summary. Opening,
leaving or reloading these screens does not change workout status or cycle.

`src/features/workout/completion.ts` builds Summary from persisted snapshots,
uses Domain Core's Exercise Volume calculation, maps recoverable errors to
FeatureError and delegates completion to the existing WorkoutRepository.finish.
The screen displays Power name/count/completion, both Strength names/counts/
completion/volumes, Circuit rounds/stations/completion and actual versus expected
workout type. No SQL, volume formula or cycle transition rule lives in the UI.
No new provider, dependency, analytics, History UI or benchmark UI was introduced.

## Guards and transaction

`completionSnapshot` reads training, Circuit and cycle together in a serialized
transaction. `workoutCompletionIssues` is the shared readiness check used for the
Summary/Overview preview and again inside finish's write transaction. Finish
requires IN_PROGRESS, Power COMPLETE with four sets, A and B individually complete
with four saved working sets each, and a valid completed Circuit snapshot at its
last station/round. A missing section cannot be bypassed through a direct repository
call. Current cycle position and the start's expected workout type/manual flag must
agree with the captured expected position. Inconsistent or stale state is rejected
with no repair and no partial writes.

The existing pure `completeWorkout` domain function remains authoritative:

- Matching type: advance exactly one item without another confirmation.
- Different type, no explicit decision: repository returns OVERRIDE_REQUIRED
  without writing; Application raises a readable FeatureError.
- CONTINUE_CYCLE_NORMALLY: finish the workout, keep the expected item pending.
- COUNT_AS_CURRENT_CYCLE_WORKOUT: finish and advance one item from the expected
  position, never from the actual workout type's position.

The same model handles a workout intentionally performed on a Rest item. The UI
shows both consequences with neither option selected by default. Selecting an
option is transient and does not write anything. Invalid runtime decision values
are rejected even if a caller bypasses TypeScript.

Session COMPLETE, completed_at/updated_at, cycle position/updated_at and any
relevant decision are written in one existing Store transaction. Queued competing
requests see the committed terminal status; a second finish is rejected without
another cycle transition or timestamp change. Existing guards make all completed
section/set/configuration mutation paths immutable. An SQL failure rolls back the
entire completion. Raw technical exceptions use the existing generic userMessage.

On success, Summary shows “Workout abgeschlossen” and the resulting next item;
“Zu Home” dismisses the workout stack. Home reloads on focus, showing current
cycle, no active workout and the most recently finished workout/type/status/date.
The latter includes INCOMPLETE sessions; it is a small Home summary, not History UI.

INCOMPLETE ending, independent Rest completion and exercise-level Strength PR
eligibility are unchanged. Fully completed Strength exercises in INCOMPLETE
workouts still count. Cycle Domain Core, Power/Circuit Benchmark logic, due logic,
rest/Circuit timers and section restart semantics are unchanged.

## Migration 3 and historical data

Migration 3 appends nullable `workout_sessions.cycle_override_decision`, constrained
to the two domain values and only allowed for COMPLETE manually differing workouts.
Matching workouts and incomplete workouts keep null. Published migrations 1 and 2
are unchanged. Existing sessions/sets/snapshots are retained; an old COMPLETE
workout keeps null because its historical decision cannot reliably be inferred.
No old records are rewritten or guessed. No new tables or seeds were needed.

## Validation

- `npm run typecheck`: passed.
- `npm test`: 301 passed, no failures/skips, including the previous 265 tests.
- `npm run lint`: passed without warnings.
- Android/iOS Metro/Hermes bundle exports: passed with two workers.

`tests/workout-completion.test.ts` adds 36 tests for normal/matching completion,
all missing/incomplete section guards, invalid completed cursors, missing/invalid
choices, both overrides, Rest positions and wrap, concurrent completion, rollback,
stale snapshots, terminal immutability, INCOMPLETE Strength PRs, Rest, summary
read-only behavior, actual file-backed close/reopen and migration upgrade/retry.
The earlier lifecycle tests retain their assertions; their COMPLETE fixtures now
prepare all required sections through `tests/support/completion.ts`. Their schema
assertion expects version 3 rather than version 2. No previous test was removed.

Chromium smoke tests at 390×844 use Expo Web's real SQLite WASM driver and run three
independent fresh databases: expected UK Hams, differing OK Rücken with Continue,
and differing OK Rücken with Count. Each goes through Builder, Power, both Strength
exercises, Circuit, Overview reload, Summary, explicit finish and Home. They check
snapshot names/volume, no default override, abandoned choice without writes, success
feedback, refreshed cycle, latest workout, no active workout and persistence after
Home reload. There are no production test hooks or clock/debug routes.

Browser testing and bundle exports do not establish native device behavior. Native
Android/iOS device or emulator smoke testing remains an environment limitation.

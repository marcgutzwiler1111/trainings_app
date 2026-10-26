# Active Workout — CODEX-005

This extends the existing ApplicationProvider, ApplicationServices and
WorkoutRepository. SQLite remains the single source of truth for training data.
There is no new workout-state provider, schema migration, package or background
service. Existing product specifications and all previous tests are unchanged.

## Flow and files

- `active.ts`: guarded training service commands, loaded view models, Strength
  progress, numeric input parsing and Domain Core metric orchestration.
- `restTimer.ts`: deterministic reset/tick/extend/skip helpers; no system clock.
- `application/errors.ts`: existing FeatureError/userMessage extracted without
  changing their public re-exports from `application/services.ts`.
- `src/data/repositories/workout.ts`: persisted training snapshot/history reads,
  transactional guarded writes and a selection-preserving Strength restart mode.
- `src/app/workout/[id].tsx`: fresh section statuses, counts and guarded links.
- `src/app/workout/[id]/power.tsx`: four-set Power flow, rest and confirmed restart.
- `src/app/workout/[id]/strength.tsx`: both exercises on the same screen, fixed
  A/B jump controls, four editable rows each, references, volume, e1RM and PRs.
- `src/app/workout/[id]/circuit-preview.tsx`: ordered configuration and duration
  only. It explicitly states that training runtime is not yet available.
- `src/components/TrainingControls.tsx`: common timer display and Overview link.
- `src/components/foundation.tsx`: reused controls, accessible input labels and
  optional fixed toolbar/scroll reference for quick A/B access.
- `src/hooks/useRestTimer.ts`: screen-local timer with focus/AppState cleanup.
- `src/hooks/useFeature.ts`: existing loading/action hooks extended with a guarded
  refresh that does not unmount forms or discard unsaved draft values/scroll.

Screens display/capture data and navigate. No SQL or metric formulas are in UI.
The existing context creates repositories/services once per SQLite connection.

## Power

Overview's explicit Power start marks the section IN_PROGRESS, locking its
exercise even before the first completed set. Each “Set abgeschlossen” command
atomically checks the displayed expected count and increments the persisted count
once. Replayed/concurrent events with the same expected count cannot increment
again. The new completion command requires exactly four saved sets and does not
complete the workout or advance the cycle. Only completed_set_count is stored;
there is no detailed Power-set table or load/rep capture.

A confirmed restart reuses the repository's section restart, resetting count,
status and timestamps only. It leaves Strength and Circuit data intact. The
screen offers no direct exercise editing, as requested. Existing low-level
Phase-2 persistence helpers retain compatibility with their earlier 3–4-set
fixtures; new UI workflows use the stricter guarded training commands.

## Strength

A/B are both rendered with four numbered rows, and fixed jump buttons keep either
exercise reachable without imposing any logging order. Every explicit row save
writes immediately via the existing unique (exercise instance, set_number) upsert.
Corrections keep the row ID and original saved_at. Other unsaved row drafts survive
in-place data refreshes. Reload restores saved rows only; unsaved drafts are not
claimed as persisted data. Saving disables repeated actions until completion.

Weight and RIR accept finite nonnegative numbers (including decimal commas), reps
are nonnegative safe integers, and blank fields are not converted to zero. No
arbitrary RIR ceiling is added. Existing domain functions also validate that the
prospective exercise total and e1RM remain computable before committing; overflow
is rejected transactionally instead of leaving an unloadable exercise.

Each exercise is explicitly completed only after all four saved rows exist.
Strength is COMPLETE only when both is_complete flags are true, IN_PROGRESS when
any sets/completion exist, otherwise PLANNED. No Strength-section table was added.
Saving corrections to an already completed exercise is allowed during an editable
workout, and metrics are recalculated from the newly saved data.

Current volume, best e1RM and Volume PR use the existing Domain Core functions.
A partial exercise cannot generate a PR. Overall workout status is never used as
the exercise-eligibility flag: completed A/B remain eligible when the workout is
later ended INCOMPLETE. No metrics or PR booleans are redundantly persisted.

Previous performance is the most recent terminal (COMPLETE or INCOMPLETE) workout
with saved sets for the exact exercise ID, excluding the current workout. Partial
historical performance can be a reference while remaining ineligible for a PR.
Historical references are read-only and never become current saved sets. No
history shows “Noch keine vorherige Leistung”.

Exercise selection is available only while that exercise has no saved set. After
saving, changing it requires confirmed Strength restart. The new restart mode
keeps A/B selection snapshots, clears only their current sets and completion flags,
and makes them editable again. Power, Circuit and historical workouts are untouched.
The previous default restart API remains unchanged for existing callers/tests.

A library exercise unexpectedly deactivated after selection displays a warning;
its captured workout snapshot remains usable. A new selection of an inactive
exercise is rejected. This preserves existing data instead of silently replacing
an exercise or discarding progress.

## Ordering, resume and historical safety

New Strength reads/writes require Power completion. Circuit Preview requires both
Power and Strength completion and never starts Circuit. Writes recheck prerequisites
and session/exercise membership inside a serialized transaction. A stale exercise
ID after a selection change cannot save into another or removed workout section.

Overview is rebuilt from persisted snapshots on focus, including per-exercise
counts and flags. Home resume still opens that same Overview/session. The requested
mixed-progress fixture (Power 2 and existing A1/B1) is covered at the persistence
boundary to prove preservation; new application commands still enforce the requested
Power → Strength order. There is no silent cleanup of such existing data.

All new training mutations accept only PLANNED/IN_PROGRESS workouts. COMPLETE and
INCOMPLETE records remain immutable. Ending incomplete through the existing Overview
preserves Power count/status, Strength rows and eligibility flags, without changing
the cycle. No workout completion or completion-time override UI was introduced.

## Rest timers

Power uses profile.power_rest_seconds; Strength uses profile.strength_rest_seconds.
A timer starts only after a successful persisted set save. Strength has one shared
timer, which never prevents logging the other exercise. Controls extend by 30 seconds
and skip to zero; elapsed ticks clamp at zero. The visible ready state is clear.

The hook uses elapsed UI time while focused and active. Leaving the screen,
background/inactive AppState, closing the app or reloading clears the timer. A delayed
save response on an unfocused/background screen cannot restart it. No timer deadline
or remaining time is persisted, and no old pause is fabricated on return. Native
background scheduling is not presented as verified by browser checks.

## Validation

- `npm run typecheck`: passed.
- `npm test`: 229 passed, 0 failed/skipped; all previous 190 tests retained and
  unchanged. `tests/active-workout.test.ts` adds 39 service/SQLite/timer tests.
- `npm run lint`: passed without warnings.
- Android and iOS Metro/Hermes exports passed with two workers; these are bundle
  checks, not native device execution.

Integration coverage includes Power guards/exactly-once expected counts, A/B
alternation, upserts, independent completion, isolated restarts, selection locking,
references, exact exercise identity, metric overflow rejection, save-failure rollback,
terminal immutability, PRs in COMPLETE and INCOMPLETE history, actual file-backed
close/reopen, and deterministic timer operations without minute-long waits.

Expo Web smoke testing used the real Expo SQLite WASM driver in Chromium at a
390×844 viewport. The checked interactions were:

1. Start a workout through Home/Builder; Strength is initially disabled in Overview.
2. Start Power, save two sets, test profile-default rest, +30 and skip.
3. Simulate a browser background visibility event: timer clears, progress remains.
4. Return to Overview, reopen Power and reload: 2/4 persists, old rest does not.
5. Finish four Power sets and explicitly complete Power; open Strength.
6. Enter an unsaved B draft, save A1, confirm B draft survived, save B1 then A2.
7. Reload and resume via Home/Overview: same workout, A2/B1 counts and values present.
8. Finish A and B independently; Overview reports Circuit ready only after both.
9. Open Circuit Preview and verify that no Circuit-start action exists.
10. End the workout incomplete; cycle remains unchanged. Start another workout,
    verify reference rows are not copied into its empty form, save partial Strength
    and end incomplete again without a cycle advance.

Strength and Circuit Preview screenshots were visually inspected. Existing native
controls/thumbnail fallbacks and confirmations are reused. Android/iOS device smoke
and lifecycle behavior still require a compatible device or emulator. No native
hardware, notifications, Circuit runtime, training timers for Circuit, new images,
backend or dependencies were added.

# Settings & Profile — CODEX-009

## Navigation and ownership

The existing Home tab header now opens `/settings` through “Einstellungen”. No
bottom tab was added. The Settings screen contains Profile (current bodyweight,
edit link, history link) and Training (independent Power and Strength pause values).
`/settings/bodyweight` handles weight input; `/settings/bodyweight-history` is a
read-only list. All screens reuse the existing focus loading, retry, action lock,
controls and application context. There is no new global settings store.

UI displays/captures data and calls `createSettingsServices` from `services.ts`.
The service coordinates parsing, validation, ProfileRepository and BodyweightRepository.
SQL stays in those existing repositories. Numeric limits live in
`src/data/profileValidation.ts`, shared by service and persistence entry points.
No benchmark UI, chart, extra profile field, unit selector or Circuit setting exists.

## Bodyweight and history

Initial bodyweight remains null: Settings shows “Noch nicht gesetzt” and
“Körpergewicht festlegen”, without substituting an artificial number. Input accepts
plain decimal kg values with a point or comma and trims whitespace. The technical
20–400 kg range uses the example explicitly permitted by CODEX-009. Empty values,
invalid text, nonfinite numbers and out-of-range values are rejected. Persisted
values remain numbers, not localized strings. Display avoids unnecessary zeros.

`BodyweightRepository.update` retains its original atomic profile-plus-history
transaction. It now reads the current weight inside that same serialized transaction
and returns null without any write if the numeric value is unchanged. A real change
returns the new history row ID. `SettingsService.updateBodyweight` exposes this as
`{ changed, weight }` for saved/no-change feedback. Identical requests from separate
service instances also cannot create duplicate rows on the shared app connection.
Changing back to an earlier weight is a real change and creates another record.

Every real update writes the profile and appends a PROFILE_UPDATE history entry
with an ISO UTC timestamp. A failed insert rolls back the profile update as well.
Old entries are never overwritten. History uses `bodyweight.list(true)` for newest
measured_at first, then newest rowid for timestamp ties. Existing callers of list()
retain their chronological ordering. No history edit/delete API or UI was added.

The screens show only loaded data, disable repeated actions while saving and show
explicit saved/no-change feedback. Database failures use the existing generic
userMessage strategy; loaded values are not optimistically replaced. Failed profile
loads show Retry. Read-only history has an explicit empty state.

## Rest settings and concurrency

Existing profile columns and defaults are reused unchanged:

- power_rest_seconds: 150 (2:30).
- strength_rest_seconds: 120 (2:00).

Settings uses integer seconds from 30 to 600. The UI offers ±30 seconds, clamps at
the boundaries and disables moves beyond them. Existing nonmultiple values such
as 75 seconds are displayed as stored, with no silent normalization; an explicit
boundary step can clamp to 30 or 600. Settings formats durations as M:SS.

`ProfileRepository.updateRestTimer(kind, seconds)` validates the selected kind and
value, and updates only the selected column plus updated_at in a queued transaction.
It never writes a stale copy of the other timer or current bodyweight. Equal values
are no-ops. Concurrent Power, Strength and bodyweight calls therefore preserve all
three changes; failure in one queued operation does not enlist another operation
in its rollback. The older intentional two-value updateRestTimers API remains
available and now also validates the settings duration range.

Timer changes persist immediately when their button is tapped and are displayed
after the database acknowledges the write. There is no additional Save screen or
new duration picker dependency. Bodyweight uses an explicit Save action.

## Existing workout runtime and snapshot safety

No timer controller, training screen or training metric implementation was changed.
`training.power()` already loads profile.power_rest_seconds; `training.strength()`
already loads profile.strength_rest_seconds. Their saved-set actions start the
existing useRestTimer with the loaded value. Refocusing a training screen reloads
the profile, and new workouts receive the latest saved settings automatically.

Existing runtime ±30/Skip affect transient timer state only. They do not write the
profile. Focus/background/reload cleanup, section restart and saved training progress
are unchanged, including the existing MM:SS runtime display. Circuit remains fixed
at 60 seconds per station; no Circuit timer setting, audio or haptics was introduced.

Starting a new workout already captures current_bodyweight_kg transactionally.
Later profile updates never rewrite that snapshot, prior sets, exercise snapshots,
Circuit configuration or benchmark loads. A null historical snapshot is not backfilled
when initial bodyweight is set later. Relative e1RM and Relative Strength continue
using a workout's own snapshot. Domain calculations and exercise-level Strength PR
eligibility are unchanged; complete Strength exercises in INCOMPLETE workouts remain
eligible. Cycle and independent Rest completion rules are unchanged.

## Schema, dependencies and files

No migration or dependency is required. Schema version remains 3; published
migrations, seeds, product specifications, package files and existing tests are
unchanged. Seed initialization preserves saved weight/timer settings after reopening.

New files:

- `src/data/profileValidation.ts`.
- `src/features/settings/services.ts` and this README.
- `src/app/settings/index.tsx`, `bodyweight.tsx`, `bodyweight-history.tsx`.
- `tests/settings-profile.test.ts`.

Updated files:

- `src/data/repositories/profile.ts`.
- `src/features/application/services.ts` (register Settings services).
- `src/app/(tabs)/index.tsx` (Home header entry).
- `DEVELOPMENT.md` (documentation link).

## Verification

- `npm run typecheck`: passed.
- `npm test`: 393 passed, no failures/skips; all previous 342 tests are unchanged,
  with 51 additional tests in settings-profile.test.ts.
- `npm run lint`: passed without warnings.
- Android and iOS Metro/Hermes bundle exports passed with two workers.
- Native device tests not performed: no native device/emulator/iOS runtime is
  configured here. Bundle exports and Web checks do not establish native execution.

New tests cover decimal parsing/bounds, null initial weight, numeric persistence,
immutable/newest-first history, equal-value no-ops, concurrent submissions, atomic
rollback/retry, independent timer values/bounds, queued update failures, real
file-backed close/reopen, actual training-service start durations, transient runtime
adjustments, active/COMPLETE/INCOMPLETE/null bodyweight snapshots, relative metrics,
Strength PRs, existing benchmark snapshots, Circuit, cycle/Rest and Exercise data.

Chromium smoke tests at 390×844 use the actual Expo SQLite WASM driver:

1. Home header → Settings; verify missing weight, empty history and 2:30/2:00 defaults.
2. Reject zero, save 82,5 with a double click, save 82.500 as a no-op, then save 82.75;
   history contains exactly two records with the latest first.
3. Configure Power 3:00 and Strength 2:30 independently; leave/reopen/reload Settings
   and verify weight/history/timers persist. Dark Settings/history were inspected.
4. Start a normal workout; a Power set starts 03:00 and a Strength set starts 02:30.
   Runtime +30 and Skip work. Complete Power, both Strength exercises, 1×1 Circuit,
   Summary and explicit completion; Home shows cycle +1 and no active workout.
5. Reopen Settings/history; runtime adjustments did not alter either default or
   create extra weight entries.

A separate full Exercise Management browser regression also passed: Library search,
Area/Effect filters, validation, Create/Edit, multiple taxonomy values, duplicate
submission, persistent OPFS images/reload, deactivate/reactivate with Builder selection,
image removal/replacement and safe fallback after the test image file is unavailable.
No production test hooks or test dependencies were added.

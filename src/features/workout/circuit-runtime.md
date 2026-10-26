# Normal Circuit Runtime — CODEX-006

## Scope

Circuit runs after Power and both Strength exercises complete. Finishing Circuit
sets only the Circuit section to COMPLETE. The workout stays IN_PROGRESS and the
cycle does not change. There is no normal Circuit rep/load/volume/score logging,
work/rest split, round rest, audio/haptics, background service or new dependency.

## Files and boundaries

- `src/domain/circuit/progression.ts`: pure layout/position validation, planned
  counts/duration and a linear next-position function that returns null at the end.
- `src/domain/circuit/duration.ts`: existing duration API delegates to the same
  domain plan calculation with the documented 60-second station duration.
- `src/data/circuitSnapshot.ts`: snapshot/cursor types and stored-shape validation.
- `src/data/repositories/workout.ts`: serialized reads, guarded start/advance,
  snapshot-preserving restart and configuration editing. SQL stays here.
- `src/features/workout/circuit.ts`: application services and current/next view
  models; mapped safe errors. Registered in the existing ApplicationServices.
- `src/features/workout/circuitTimer.ts`: deterministic countdown transitions.
- `src/hooks/useCircuitTimer.ts`: transient clock/lifecycle controller and an
  in-flight transition lock. It never calculates rounds or writes timer ticks.
- `src/app/workout/[id]/circuit-preview.tsx`: the existing route now renders
  Preview, Runtime or Completion according to the persisted section status.
- `src/app/workout/[id]/circuit-edit.tsx`: active-session Circuit configuration editor.
- `src/components/CircuitConfiguration.tsx`: controls extracted from the existing
  Workout Builder and reused by both builders (rounds, roles, selection and arrows).
- Overview now displays persisted Circuit progress/completion. Existing thumbnail
  support accepts a size so Current/Next images have different visual emphasis.

The existing SQLiteProvider/repository factory/context is unchanged. No second
persistent workout/circuit state store or global singleton was introduced.

## Persistence and identity

No migration is needed. Existing section fields represent PLANNED, IN_PROGRESS
and COMPLETE with started_at, current_round, current_station_position and
completed_at. Positions are 1-based; all preceding positions have been completed.
COMPLETE at the final position distinguishes it from the still-running last station.
Snapshots must have nonempty, consecutive station positions and valid finite,
safe configuration/position values. Invalid stored state is reported, not silently
reset or wrapped.

The first guarded start persists 1/1 and started_at. It reads the already saved
snapshot, never reconstructing names/images/roles from today's Exercise Library.
A simultaneous second start for the same section is idempotent and does not reset
an existing run. A start of a completed Circuit is rejected.

Each transition submits the displayed section ID, round and station. All
prerequisites and the expected cursor are checked in the same transaction as the
write. Exactly one competing timer/manual request can consume a cursor. The next
position or final completion is committed before the UI adopts the new snapshot.
No loop catches up missed stations, and no seconds are stored in SQLite.

Start/advance require an IN_PROGRESS workout, completed Power, both completed
Strength exercises, and a valid not-yet-completed Circuit. Historical COMPLETE and
INCOMPLETE workouts reject all new Circuit writes. Ending the workout incomplete
uses the existing workflow and preserves Circuit position, configuration and
Strength eligibility.

## Countdown and lifecycle

The duration comes from station_duration_seconds in the saved snapshot (60 in the
MVP schema). There is one uninterrupted countdown per station. Foreground elapsed
time decreases only the current station's transient counter. Expiry requests one
persistent transition; the controller synchronously locks competing requests.
After success the next station starts with its full duration; completion terminates
the timer. A failed write leaves the persisted position unchanged and the UI paused
for an explicit retry, with the existing userMessage error strategy.

Manual Pause/Fortsetzen in the same focused session retains remaining seconds.
Navigation blur, background/inactive AppState or reload discards remaining time.
The persisted position is restored paused; “Station fortsetzen” explicitly starts
that station at its full duration. Lifecycle generation guards prevent a delayed
save response from starting a hidden timer. Transition requests already submitted
while visible may commit once; no later hidden transitions are scheduled.

Preview and Runtime deliberately share the existing route. The explicit first
start gesture can start the local countdown after the database acknowledges start;
there is no auto-start URL flag that would accidentally re-run on reload. A plain
page load or return to the route always starts paused for an existing run.

## Restart and edit

Confirmed restart transactionally replaces only the current Circuit section and
its owned stations with a fresh PLANNED identity and null progress/timestamps.
Captured snapshot names/images/roles are copied, not re-read from the library.
The rotated section ID prevents old expiry requests from advancing a new run even
when it reaches the same 1/1 coordinates. A failure rolls back the entire restart.
Power, Strength, historical sessions, workout status and cycle are untouched.

The user is then sent to the reused Circuit configuration controls. Rounds,
stations, roles, exercises and order can be changed. Explicit saving captures a
new snapshot through existing saveCircuit infrastructure. Only this intentional
editing operation reads exercise metadata; ordinary Circuit start never does.
Inactive choices are cleared with a warning for reselection; validation prevents
silently substituting an exercise. Cancelling the editor still leaves a valid
planned copy of the original configuration. Raw corrupt/empty configurations can
be repaired explicitly in the editor rather than recreated automatically.

## Verification

- Typecheck and lint passed without warnings.
- 265 tests passed: all previous 229 tests unchanged plus 36 Circuit tests in
  `tests/circuit-runtime.test.ts`.
- Tested variable 1×1, 2×3 and 5×6 runs; exact linear sequence; Current/Next across
  round boundaries; no final wrap; start/advance races; snapshot lock; late old-run
  events; history safety; injected transition/completion/restart failures; editor
  validation; and file-backed reopen at R3/S4 with explicit paused resume.
- Timer helpers test tick, pause, resume, full-duration reset, expiry and nonnegative
  values deterministically, without waiting a real minute.
- Android/iOS Metro/Hermes exports passed with two workers. No native device test
  is implied by bundle exports or browser lifecycle tests.

Expo Web smoke checks used the actual Expo SQLite WASM driver in Chromium at
390×844. The browser exercised Home/Builder → Power → Strength → Circuit Preview,
then a 2-round/2-station Circuit. Playwright's test-only virtual browser clock
verified automatic expiry without waiting 60 real seconds. Checked interactions:

1. Start Circuit; timer runs and configuration editing is unavailable.
2. Pause, advance virtual time and verify the remaining value stays unchanged;
   resume, expire the station and verify the saved next position and next-round cue.
3. Leave/reopen the route: same saved position, paused at full duration.
4. Simulate a background visibility event, return and reload: same position,
   explicit resume still required, no hidden station advancement.
5. Advance manually across the round boundary and finish the last station.
6. Return to Overview: Circuit complete, workout active, Home cycle unchanged.
7. Confirm restart, change rounds/roles/exercise/order in the shared editor, save
   a 1×1 Circuit and finish it without wrapping.

The Runtime screenshot was visually inspected: Current and Next are both visible
at the tested phone viewport, with a larger Current thumbnail and readable timer.
No production test clock, debug route, test dependency or new image was added.
Native Android/iOS lifecycle behavior still requires device/emulator verification.

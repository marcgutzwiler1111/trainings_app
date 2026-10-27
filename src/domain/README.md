# Domain Core — Phase 1

These modules contain pure synchronous TypeScript functions. They have no React,
Expo, SQLite, network, process-environment or system-clock dependencies. Inputs
are treated as immutable; there is no persistence or UI behavior here.

| Module | Public rules / functions |
| --- | --- |
| `cycle/cycle.ts` | `getCycleItem`, `nextCyclePosition`, `completeRest`, `completeWorkout`; cycle, item, completion and override types |
| `strength/calculations.ts` | `calculateSetVolume`, `calculateExerciseVolume`, `calculateStrengthBenchmark`, `evaluateStrengthBenchmark`, `calculateE1RM`, `calculateRelativeE1RM`, `calculateRelativeStrength` |
| `strength/history.ts` | `historicalVolumePrs`; chronological, strict per-exercise PR detection using the existing eligibility rules |
| `circuit/duration.ts` | `calculateCircuitDuration` (stations × rounds × 60 seconds) |
| `benchmarks/power.ts` | `arePowerBenchmarksComparable`; discriminated test conditions and side requirements |
| `benchmarks/circuit.ts` | `calculateCircuitEffectiveWeight`, `calculateCircuitRowVolume`, `calculateCircuitExerciseVolume`, `calculateCircuitTotalVolume`, `calculateRelativePerformance` |
| `benchmarks/due.ts` | `calculateBenchmarkDueState`; Power/Circuit scheduling and due-state types |
| `shared/types.ts` | Workout type, session status, load mode and side unions |
| `shared/measurements.ts` | Shared volume, effective-load and bodyweight-relative arithmetic; explicit load structures |
| `shared/validation.ts` | Numeric input guards and exhaustive-switch guard |

## Cycle events

Positions are 1-based: UK_HAMS, OK_BRUST, REST, UK_QUADS, OK_RUECKEN, REST.
Only explicit completion events move the cycle. `nextCyclePosition` is the
low-level transition primitive; use `completeWorkout` / `completeRest` for
completion rules. These functions do not read dates.

Non-COMPLETE workouts return `UNCHANGED`, regardless of override choice.
Matching COMPLETE workouts advance one position. A mismatching COMPLETE workout
(including a workout performed on a Rest item) returns `OVERRIDE_REQUIRED`
unless an explicit choice is supplied.

The override mapping was explicitly confirmed for CODEX-002:

- `CONTINUE_CYCLE_NORMALLY`: keep the expected item pending at the same position.
- `COUNT_AS_CURRENT_CYCLE_WORKOUT`: advance exactly one position, wrapping 6 to 1.

`completeRest` represents an explicit user completion of the current Rest item;
it rejects workout positions. Applying/persisting an event exactly once is the
future application/persistence layer's responsibility.

## Measurement inputs

Weights and bodyweight are in kg; duration is in seconds. Repetitions and station /
round counts are safe integers. Weights, volumes and RIR must be finite and
nonnegative; bodyweight and medicine-ball weights must be positive. Fractional
RIR is preserved, and no undocumented upper RIR limit is introduced. Invalid
numeric inputs or arithmetic overflow throw `RangeError`. Metrics are never
rounded for presentation.

Load inputs discriminate `EXTERNAL_ONLY` (externalLoad),
`BODYWEIGHT_PLUS_EXTERNAL` (addedLoad) and `BODYWEIGHT_ONLY`.
Circuit exercise keys select the fixed MVP load rule; callers supply the locked
bodyweight/load snapshot, not the user's subsequently edited current values.
Circuit result arrays may be empty or partial and do not require UI structures
or a fixed array size. They represent individual round/exercise results with a
locked effectiveWeight. The caller provides valid, non-duplicated result rows.

Strength history is matched by exact exerciseId. ExercisePerformance.isComplete
means all planned working sets of that concrete exercise were completed (normally
four in MVP). It is supplied by the caller from exercise-level completion, never
from the overall workout status. Only these completed exercises count, even if
the overall workout is INCOMPLETE. Pass history excluding the current session.
Empty eligible history has a volume baseline of 0. A strictly greater eligible
volume is a new PR; a tie is not. Partial exercise volume can be calculated and
saved by the caller but never updates the benchmark. Volume calculation itself
continues to support arbitrary set counts.

## Benchmark time

`calculateBenchmarkDueState(type, sessions, nowMs)` takes an explicit absolute
Unix timestamp in milliseconds. `completedAtMs` is also an absolute timestamp;
conversion from stored ISO-8601 strings belongs at the caller boundary.

Only COMPLETE sessions of the selected POWER or CIRCUIT type count. The latest
completion is selected without relying on array order. Strength is intentionally
not a scheduled benchmark type. A relevant COMPLETE session with a missing,
invalid or future completion timestamp is rejected.

The interval is 30 elapsed UTC days of 24 hours each. It is independent of local
timezone and daylight saving. At exactly 30 days, status is DUE with 0 days
Overdue. Days remaining round up; days overdue count fully elapsed days.

## Validation

From the repository root:

```sh
npm run typecheck
npm test
npm run lint
```

The existing test command discovers `tests/domain-*.test.ts` and the Phase 0
migration tests. Including the CODEX-002A eligibility correction, there are 123 Domain Core tests;
the combined suite has 128 passing tests. No additional dependencies, UI routes, tables or repositories
were added, and the existing product specification is unchanged.

## Historical Strength PRs — CODEX-012

`historicalVolumePrs` accepts chronologically ordered immutable performances. The
application layer supplies timestamp/identity ordering. The helper delegates to
`evaluateStrengthBenchmark`, retaining one best eligible performance per exact ID.
Partial performances and ties never raise the baseline. Historical PR labels are
separate from the current all-time maximum. Progress aggregation and validation
are documented in [../features/progress/README.md](../features/progress/README.md).

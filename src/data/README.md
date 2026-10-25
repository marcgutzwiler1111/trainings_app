# SQLite persistence — Phase 2

`initializeDatabase(db)` is the single app-start entry point, called by the existing
SQLiteProvider before the tab shell renders. It awaits migrations and idempotent
seeding. Never recreate a database to recover from an error.

## Migration and schema

Migration 1 remains the original empty bootstrap. Migration 2 creates 18 STRICT
SQLite tables, foreign keys, enum/range/uniqueness checks, query indexes and
Circuit Benchmark snapshot-lock triggers. `PRAGMA user_version` is now 2.
Migrations run transactionally; a failed schema upgrade rolls back its DDL and
version. Existing newer databases are rejected. Append future migrations rather
than modifying these once published.

The tables implement profile, bodyweight history, exercises/areas/effects, cycle
state, normal workouts and their three sections, Strength sets, and both benchmark
session/test/station/result models. Foreign keys restrict deletion of referenced
exercises; only section-owned child data cascades on an explicit section restart.
There is no hard-delete exercise or workout API.

`seedDatabase` transactionally inserts the singleton profile (150/120-second rest
defaults), singleton cycle (position 1) and 29 exercises using fixed UUIDs. Existing
rows, edited taxonomy, deactivated exercises and user settings are never overwritten.
Seed thumbnails are null; all six effects, three areas and benchmark exercises are
covered. Custom records use SQLite-generated version-4 UUIDs, without a new package.
Timestamps are ISO-8601 UTC strings; the repository clock can be injected in tests.

## Repository usage

```ts
import { initializeDatabase } from './initialize';
import { createRepositories } from './repositories';

await initializeDatabase(db); // Existing Expo SQLite connection; once before use.
const repositories = createRepositories(db);
await repositories.bodyweight.update(80);
const profile = await repositories.profile.get();
```

| Repository | Operations |
| --- | --- |
| ProfileRepository | Read singleton profile; update rest timers |
| BodyweightRepository | Atomically update current bodyweight and append history; list history |
| ExerciseRepository | Create, read/list, update taxonomy/thumbnails, activate/deactivate |
| CycleRepository | Read/save position; explicit Rest completion using Domain Core |
| WorkoutRepository | Session lifecycle, Power selection/progress, Strength slots/sets/completion, Circuit snapshot/progress, section restart, last valid configuration, domain performance mapping |
| BenchmarkRepository | Power sessions/test conditions/attempts; Circuit sessions/immutable snapshots/results; terminal status; mapping to scheduled Domain Core sessions |

Returned data records use the documented snake_case columns with explicit typed
interfaces in `types.ts`. Exercise `is_active` is mapped to a boolean. Stored
Strength `is_complete` maps to Domain Core's `ExercisePerformance.isComplete` via
`performances`; it is never derived from the overall workout status. The explicit
`setStrengthComplete(true)` operation requires all four MVP working sets to have
been saved. Partial set edits remain persistent but ineligible until completion.
Strength set updates preserve their ID and original saved_at.

`lastConfiguration(workoutType)` scans newest first for a full saved configuration:
Power, both Strength slots and at least one Circuit station. It returns exercise
IDs, roles, station order and round count only, with no old sets or completion
progress. It never copies performance data or creates another workout.

Snapshot fields are captured from the exercise at selection/configuration time;
subsequent library edits and deactivation cannot change them. Started Power and
Circuit configurations and Strength exercises with saved sets require an explicit
section restart to change. Finished COMPLETE/INCOMPLETE workouts are immutable
through repository operations. Restart APIs operate only on editable workouts and
only on the selected section.

`finish` atomically persists workout completion and the cycle transition returned
by Domain Core. Missing override choice returns OVERRIDE_REQUIRED without changing
either row; a stale expected position is rejected. INCOMPLETE never advances the
cycle. The future workflow layer remains responsible for deciding when the user
has completed the required workout sections and invoking the explicit finish event;
these persistence APIs do not implement the workout UI or training flow.

Circuit Benchmark creation is its explicit start: bodyweight/loads and six station
snapshots are inserted together and immediately locked. Effective weights use the
existing domain function. Reps are upserted per round/station. Power attempts are
upserted per test/side/attempt; optional `best_value` remains null rather than
introducing a separate derived-results cache. Attempts are the authoritative values.
Volume, PR, relative metrics, comparability and due rules remain Domain Core logic.

## Transactions and validation

Every multi-row write is transactional. `Store` serializes all repository reads and
writes per connection (shared WeakMap queue), so Expo's withTransactionAsync cannot
accidentally enlist another repository operation in a failing transaction. Callers
must use these repositories rather than execute concurrent raw SQL on the same
connection; await initialization before exposing repositories. The raw adapter and
SQL helpers are internal persistence infrastructure, not a screen-facing API.

The Database interface matches the Expo SQLite async methods. Integration tests
use a Node SQLite adapter executing the same parameterized SQL, not mock query
responses. Node's strip-only TypeScript test runner requires erasable TypeScript
syntax; constructors use explicit field declarations instead of parameter properties.

## Verified for CODEX-003

- All 128 previous Domain Core/bootstrap tests remain passing. Phase-0-only migration
  tests explicitly select migration 1; additional tests validate the latest schema.
- 30 new persistence integration tests pass (158 total), including actual file-backed
  connection close/reopen, migration retries, snapshots, eligibility, transaction
  failure injection, concurrent calls and section-specific restart isolation.
- `npm run typecheck` and `npm run lint` pass.
- The actual Expo SQLite WASM driver initializes migration 2 and seeds successfully
  in Chromium. All four existing tabs and page reload work after initialization.
- Native Android/iOS device execution is not established by these checks.

No product screens, routes, image assets, backend, dependencies or Domain Core
formulas were added or changed.

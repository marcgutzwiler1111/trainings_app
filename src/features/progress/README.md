# Progress & Analytics — CODEX-012

## Scope and architecture

Progress answers how persisted measurements develop over time. The global tab
opens four independent read-only areas: Strength, Power Benchmark, Circuit
Benchmark and Bodyweight. No overview query loads all four areas; each area loads
on focus, and Strength detail restricts its query to the chosen exact exercise ID.
Focus/retry refresh makes new completions visible without restarting the app.
There are no scores, coaching, recommendations, goals, exports or new timers.

UI calls the registered `createProgressServices` application service. The service
aggregates historical raw records from `ProgressRepository`, reuses existing
Domain calculations and builds typed series. Screens do no metric calculations
and execute no SQL. `ProgressPoint` has a stable identity, nullable persisted
date, numeric value, source session identity and completion state. Bodyweight
points instead identify their actual source entry; they have no source session.

## Queries and scale

- Strength: two batch SELECTs (historical selections with session metadata and
  optional current navigation name/activity, plus their actual working sets).
  No sets means no performance point. Detail uses a bound exact exercise ID.
- Power: three batch SELECTs for COMPLETE sessions, conditions and attempts.
- Circuit: three batch SELECTs for COMPLETE sessions, stations and round results.
- Bodyweight: existing Bodyweight history and Profile reads only (two SELECTs).

Empty areas short-circuit unnecessary child queries. Grouping uses maps, not a
repository call per session/point. Domain calculations run once per performance;
historical Strength PR detection tracks one best eligible performance per ID.
Tests use 601 sessions in each training area and assert fixed query counts.
The UI renders session lists through `FlatList` with batches of 12. The historical
Circuit selector also uses a virtualized, scrollable modal; hundreds of sessions
do not expand an unscrollable dialog. No cache invalidation, migration, duplicate
performance persistence or new global state is introduced.

## Ordering and dates

`chronological` orders by full absolute timestamp, oldest first; equal timestamps
use stable identity lexically. This tie-break is deterministic, not an invented
sequence within an identical timestamp. Lists reverse that order. Session dates
reuse History's completion → start → creation fallback. Bodyweight uses the actual
entry `measured_at`. Missing dates remain unknown, are excluded from the plotted
time axis and historical PR badges, and remain readable in lists. Current best
can still include an eligible recorded performance with an unknown date. No
current timestamp or calendar-day grouping is substituted.

## Strength

Records stay separate by exact exercise ID, including identically named variants.
An active exercise uses its current Library name for navigation. An inactive
exercise uses its most recent historical snapshot name and an Inactive label.
Each individual performance retains snapshot name/image, saved set numbers,
weight/reps/RIR and historical workout bodyweight. Library load-mode changes never
rewrite values. Empty selections create no invented zero-volume observation.

Volume uses `calculateExerciseVolume`. Per-performance e1RM is the highest saved
working-set `calculateE1RM` result, preserving fractional RIR and internal precision.
It is an estimate. Relative e1RM uses only `calculateRelativeE1RM` with that session's
bodyweight snapshot; absent values stay null and never become zero chart points.
No current Profile weight is substituted.

`historicalVolumePrs` is a pure Domain helper over chronologically ordered
performances. It delegates to existing `evaluateStrengthBenchmark`, keeping a
separate eligible best per exact ID. A new record is strictly greater than the
previous eligible best; ties do not set another PR. Partial higher volumes never
raise the baseline. The initial zero baseline is the existing Domain convention;
zero does not beat zero. If no eligible performance exists, UI explicitly says
there is no completed entry instead of presenting zero as an achieved record.

Eligibility uses the persisted exercise-level `is_complete` and four recorded
MVP working sets, independently of total workout status. The additional set-count
check protects against malformed older completion flags. A complete Strength
exercise in an INCOMPLETE workout is eligible. Partial performances remain visible
in charts/lists with Incomplete text and open markers, but never receive PR badges.
Historical PR badges appear in the Strength Progress session list; existing History
remains its read-only snapshot view and is linked for full detail.

Relative Strength remains excluded: historical `load_mode` is not persisted.
Neither names nor today's mutable Library mode can recover it. No migration or
new future snapshot field is necessary for this scope. No metric is invented.

## Power

Only COMPLETE sessions with all six valid groups/18 attempts produce official
trend points. `powerView` and the existing Domain best/comparability functions are
reused; the cached `best_value` is not a measurement source. All four standardized
tests are selectable. Left/Right remain separate charts and values.

Medicine-ball series are grouped by test, side, ball weight and persisted unit.
Broad Jump has its own series. A virtualized condition selector exposes historical
weights/units. Distances keep their stored unit (normally cm); there is no implicit
conversion or series connecting different ball weights. Best and strict historical
PRs are condition-specific. Delta compares consecutive points within the selected
compatible series. When returning to a previously used ball weight, this means the
previous measurement with that same condition, not an intervening incompatible
session. The first point of any condition has no previous value or delta.

INCOMPLETE/active benchmarks stay in their existing workflows/History and never
alter official analytics. No Power average or overall score is calculated.

## Circuit

Only COMPLETE sessions with the fixed six-station/five-round result matrix form
trends. Existing `circuitBenchmarkView`/Domain functions produce Total Volume,
Relative Performance, exercise total reps and exercise volumes using locked
snapshot effective weights. Pull-up load includes that historical bodyweight plus
added load. Zero reps stay zero; missing results never become completed points.

Six exercises are selectable for reps and volume trends. Every session row shows
bodyweight, Goblet/Swing/Pull-up loads, reps, volumes and effective weights.
Different loads remain transparent rather than being labelled as improved fitness.
Round Fatigue shows actual R1–R5 reps for all six exercises in the selected COMPLETE
session. Latest complete is the default; older sessions can be selected. No fatigue
score, new weighting formula or invented reps exist.

## Bodyweight

The chart uses actual `bodyweight_entries` unchanged, sorted by measurement time.
No analytics deduplication is applied. Current Profile weight is a separately
labelled value, including a missing state. Benchmark-specific bodyweight snapshots
never become global entries. Later Profile edits append genuine history and do not
rewrite earlier entries or relative training metrics.

## Chart and accessibility strategy

`ProgressChart` is one dependency-free native scatter time-series component used
throughout. React Native Views render individual data points against continuous
absolute time (X) and numeric value (Y), with visible date/numeric axis bounds and
explicit units. There are no interpolated samples or lines implying missing values.
Zero, one, constant and many-point series work without dividing by zero or inventing
a trend. Missing relative values are omitted, not plotted at zero. Partial Strength
points are hollow and explicitly identified in accompanying text.

Charts expose an accessible count/minimum/maximum description. Exact dates, values,
completion/PR state and conditions remain in textual, virtualized session rows.
History links reuse the existing immutable details. Controls use existing mobile
tap targets and colors; labels communicate state independently of color. No SVG,
charting, date or state-management dependency was needed.

## Read-only and compatibility

Progress has only read methods. Tests reject every write/transaction attempt and
compare all persisted tables plus SQLite `total_changes` before/after analytics.
Workout/Cycle, benchmark due states, PR eligibility, Profile/history and Exercise
Library stay unchanged. Terminal mutation guards and existing workflows remain
intact. SQL errors follow the existing generic message/retry strategy; invalid
historical metric arithmetic fails safely. Missing Strength IDs show a readable
no-data message. Detail routes work independently of prior navigation.

No migration, seed changes, new dependencies or product-specification changes.
The original 507 tests remain unchanged. All new calculation and aggregation
coverage is in `tests/progress-analytics.test.ts`.

## Validation

- `npm run typecheck`: passed.
- `npm test`: **562 passed**, no failures or skips; 507 existing tests unchanged,
  55 new Progress tests.
- `npm run lint`: passed without warnings.
- Android and iOS Metro/Hermes exports passed with
  `CI=1 EXPO_OFFLINE=1 npx expo export --platform android --platform ios --max-workers 2`.
- Native device tests not performed: no configured Android/iOS device or emulator.
  Bundle exports and Chromium checks do not establish native execution.

New tests cover exact IDs and inactive names, chronological historical PR sequences,
strict ties, high partial volume, eligible exercises in incomplete workouts, actual
set numbers, best set e1RM/fractional RIR, missing BW, immutable snapshots, all Power
sides/conditions/units/deltas, Circuit six-exercise reps/weights/volumes/R1–R5, zero
reps, incomplete/active/invalid legacy exclusions, genuine Bodyweight sources,
unknown dates, safe overflow errors/retry, file-backed reopen, terminal History,
cycle/Rest/due/PR isolation and fixed query counts for 601 sessions per area.

Chromium Expo-Web smokes passed at a 390×844 viewport using the actual Expo SQLite
WASM worker. Four empty area states and read-only controls were checked first.
Strength runs created Complete → Complete → Partial → Complete performances and
an additional complete exercise in an INCOMPLETE workout through the real UI.
They verified historical PR badges, partial exclusion, volume/e1RM/relative e1RM,
History links, immediate visibility and direct detail reload.

Power runs created three COMPLETE sessions (same then changed ball weight) plus
one INCOMPLETE session. Test/condition selection, six independent side series,
cm units, bests, compatible delta, no incompatible delta and reload passed.
Circuit runs created two COMPLETE sessions with differing bodyweight/loads plus
one INCOMPLETE session. Total/relative and exercise trends, stored effective
weights, latest-session default, older session selection, actual R1–R5 and reload
passed. Bodyweight runs checked one point, then decimal updates and three genuine
entries, current value, reload, unchanged historical Strength BW/relative metrics
and dark rendering. Mobile chart layouts were visually inspected.

Separate full browser regressions passed all CODEX-011 six-kind/status History
variants, mixed order/filters/details/snapshots/missing images/active guards/reload;
normal workout complete/incomplete and cycle handling; Power/Circuit logging,
correction/resume/timers/complete/incomplete/due isolation; Settings weight/history/
rest defaults/persistence; and Exercise search/filter/Create/Edit/activation/images/
Builder integration. Existing services and mutation paths remain unchanged.

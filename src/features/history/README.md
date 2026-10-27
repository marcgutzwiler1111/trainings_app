# Training History (CODEX-011)

## Scope and model

The global History tab is a read-only, unified timeline of normal workouts,
Power Benchmarks and Circuit Benchmarks. Only `COMPLETE` and `INCOMPLETE`
sessions appear; active/planned sessions remain in the existing Home resume
flows. Rest actions, profile-weight changes and derived Strength PRs are not
separate training sessions. Progress charts, trends, editing and deletion are
outside this feature.

`HistoryEntry` uses an explicit kind, composite kind/id key, stored status,
actual performed workout type, effective date and optional actual start/end.
Sorting is centralized: valid completion time, otherwise valid start time,
otherwise creation time; newest first. Unknown dates sort last and display
“Datum nicht verfügbar”. Equal timestamps use start time then kind/id for a
stable order. These tie-breakers do not imply a historical sequence. Dates use
local device time through `Intl.DateTimeFormat('de-CH')`.

The four in-memory filters are Alle, Workouts, Power Benchmark and Circuit
Benchmark. No filter is persisted. Empty history and empty filtered results
have separate messages; loading and failures have feedback and retry.

## Responsibilities and performance

- `src/data/repositories/history.ts`: one metadata-only `UNION ALL` SELECT
  across the three session tables, restricted to terminal statuses. No child
  rows, library joins, per-entry queries or writes.
- `services.ts`: centralized mapping, sorting, filtering, route-kind validation,
  terminal-session guards and detail loading through existing repositories.
  Existing domain functions and benchmark view builders supply all metrics.
- `src/app/(tabs)/history.tsx`: compact, accessible cards in a native `FlatList`
  (initial batch 12, batch size 12, window size 7), with local filter state.
- `src/app/history/[kind]/[id].tsx`: direct detail lookup on focus/reload using
  the persisted id; no dependency on navigation state or active session state.
- `SessionHeader.tsx` and `WorkoutDetail.tsx`: read-only snapshot presentation.
- `src/features/benchmarks/BenchmarkResults.tsx`: shared presentational results
  used by both History and existing benchmark summaries. Active benchmark
  logging, timer and mutation paths are unchanged.

Overview fetches only compact metadata, sorts once per load, and filters in
memory. Detail rows are loaded only when opening a session. This avoids N+1
queries without introducing caching, pagination or schema changes. A real
SQLite test verifies the single-query overview with 600 sessions.

## Details and snapshot strategy

Normal workouts show the actual workout type/status/date and saved override
decision, Power exercise/count/status, both saved Strength selections, and
normal Circuit configuration/progress. Strength renders only recorded set
numbers, weights, reps and RIR; it never pads missing sets. Volume and best set
e1RM use existing domain calculations. Relative e1RM uses only the session's
historical bodyweight; absent bodyweight is never replaced by today's profile.
Empty Strength sets have no e1RM. Incomplete exercises retain their actual
partial volume without being labelled as a PR.

Circuit shows stored rounds, station count, duration, order, roles, effects,
images and progress position. Normal Circuit has no invented reps, volume or
score. Older missing sections are explicitly identified instead of fabricated.

Power Benchmark details show stored conditions, separate ball weights and
sides, actual saved attempts and available bests. Missing attempts are not
inserted. History does not load a previous session for comparison.

Circuit Benchmark details show the stored bodyweight, loads, six station
snapshots/effective weights, five round positions, recorded reps, exercise
volumes, total volume and Relative Performance. A missing round is labelled
“Nicht gespeichert”; a saved zero remains zero. Partial results stay partial.

Names, taxonomy, images, weights and conditions come from persisted snapshots,
not the current Exercise Library, Profile or Cycle. Renaming/deactivating an
exercise or replacing its image does not rewrite History. Existing managed
image storage preserves prior referenced files; the shared thumbnail displays
a placeholder if a historical image is physically missing.

### Deliberate limits

Historical Strength selections do not store `load_mode`. Relative Strength
cannot be safely reconstructed from the mutable current Library, so it is
omitted. Relative e1RM is available independently when historical bodyweight
exists. No migration can recover the missing historical load mode.

Volume PR badges are deferred to CODEX-012: being complete or matching today's
benchmark does not establish that a performance set the PR at that time. No
new as-of PR reconstruction or metric is introduced here.

## Read-only and reload safety

History calls only read repositories. It does not call completion, active
runtime, Profile, Cycle, due-state mutation or library mutation services.
There are no edit/delete/finish controls or workout inputs on detail pages.
Existing terminal-session mutation guards remain intact. Unknown ids/kinds
have a not-found message; active/planned ids are rejected with a Home-resume
message. Overview and all three detail kinds load after direct URL reload.
No migration, dependency, domain change or seed change is required.

## Validation

Commands: `npm run typecheck`, `npm test`, `npm run lint`.
All pass: **507 tests**, including the previous **468 unchanged tests** and
39 new History tests in `tests/training-history.test.ts`.

Coverage includes mixed chronology, all filters, terminal guards, date
fallback/ties, 600-session query shape, complete/partial/legacy details,
actual set numbers and metrics, historical bodyweight, names/images after
library edits/deactivation, absent versus zero benchmark results, wrong ids,
SQL failure/retry and real file-backed SQLite close/reopen. Database dumps and
`total_changes` remain equal across reads; write/transaction methods are also
set to throw, proving History performs no writes. Existing Strength PR,
Cycle, Home latest-workout, benchmark due and mutation guards still pass.

Expo Web smoke tests passed in Chromium at a 390px viewport using real
`expo-sqlite` WASM persistence. All six terminal kind/status combinations
were created through the actual UI, then checked in the common timeline,
filters, details and direct reloads. Historical names/bodyweight/images,
renaming/deactivation/replacement, physically missing-image fallback,
partial sets/attempts/rounds, absent versus zero reps, read-only controls,
active/not-found routes and immediate new-session visibility passed.

Separate full regression browser runs passed normal workout completion and
configured rest timers; Power/Circuit Benchmark setup, logging, correction,
resume, completion/incompletion and due isolation; Settings profile/weight
history/persistence; Exercise Create/Edit/search/filter/activation/images and
Builder integration. Cycle progression and benchmark independence remained
unchanged.

Android and iOS Metro/Hermes bundle exports passed with:

```sh
CI=1 EXPO_OFFLINE=1 npx expo export --platform android --platform ios --max-workers 2
```

**Native device tests not performed**: this environment has no configured
Android emulator or iOS runtime. Bundle exports do not replace device tests.

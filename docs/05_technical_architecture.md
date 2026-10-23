# 05 — Technical Architecture

## Status

Recommended MVP architecture.

## 1. Stack

### Application
- Expo
- React Native
- TypeScript

### Navigation
- Expo Router

### Persistence
- SQLite through `expo-sqlite`

### Testing
- Unit tests for domain calculations and repositories
- Component tests selectively for critical forms/flows
- Manual device testing for timers, vibration and app resume

### Platforms
- Android
- iOS

Primary development can begin on Android if that is the easiest local testing path.

## 2. Why this stack

The app is:
- single-user;
- local-first;
- data-centric;
- offline-capable;
- not dependent on server APIs;
- primarily standard mobile UI plus timers and local images.

A backend would add complexity without MVP benefit.

SQLite is appropriate for relational workout history, benchmark data and durable local persistence.

## 3. High-level layers

```text
src/
  app/              # Expo Router routes/screens
  components/       # reusable UI
  features/         # feature-oriented UI + orchestration
  domain/           # pure business rules/calculations
  data/             # SQLite repositories, migrations
  hooks/
  lib/
  types/
  constants/
  assets/
```

Recommended feature folders:

```text
features/
  home/
  workout-builder/
  workout/
  exercises/
  history/
  progress/
  power-benchmark/
  circuit-benchmark/
  settings/
```

## 4. Domain logic

Keep these as pure/testable functions:

- cycle advancement;
- workout override handling;
- Set Volume;
- Exercise Volume;
- Strength Benchmark selection;
- e1RM;
- Relative e1RM;
- Relative Strength;
- Circuit duration;
- Power Benchmark comparability;
- Circuit Benchmark effective weight;
- Circuit Benchmark volume;
- Relative Performance;
- benchmark due-state calculation.

UI must not duplicate formulas.

## 5. Persistence architecture

Use repositories such as:

- ProfileRepository
- ExerciseRepository
- WorkoutRepository
- BenchmarkRepository
- BodyweightRepository

Screens/features depend on repository interfaces/domain services, not handwritten SQL inside components.

## 6. State approach

MVP should avoid a large global state framework unless implementation demonstrates a need.

Use:
- route-local/component state for transient UI;
- feature hooks;
- SQLite as durable source of truth;
- a small app-level context/store only for active-session coordination if needed.

Do not introduce Redux by default.

## 7. Timers

### Rest timers
Can use in-memory countdown state while screen is active.

No requirement to continue rest timers after app termination.

### Circuit timer
The app must persist enough progress to restore:
- round;
- station;
- configuration.

MVP explicitly does not continue the station countdown invisibly while app is closed.

If app/background behavior becomes complex, favor predictable resume behavior over pretending exact elapsed timing.

## 8. Images

Predefined exercise images:
- package as app assets.

Custom exercise images:
- select from device library;
- copy into app-managed storage;
- store stable URI/path in SQLite.

Thumbnail rendering should use a reusable `ExerciseThumbnail` component.

If image missing:
- show a neutral placeholder;
- never block exercise use.

## 9. Navigation structure

Suggested Expo Router shape:

```text
src/app/
  _layout.tsx

  (tabs)/
    _layout.tsx
    index.tsx              # Home
    progress.tsx
    history.tsx
    exercises.tsx

  settings/
    index.tsx

  workout/
    builder.tsx
    active.tsx
    summary.tsx

  benchmark/
    power/
      index.tsx
      setup.tsx
      test/[testKey].tsx
      summary.tsx

    circuit/
      index.tsx
      setup.tsx
      active.tsx
      summary.tsx

  exercise/
    [id].tsx
    new.tsx

  progress/
    strength/[exerciseId].tsx
    power.tsx
    circuit.tsx
    bodyweight.tsx

  history/
    workout/[id].tsx
    benchmark/[id].tsx
```

Exact paths can be adjusted without changing UX.

## 10. Database bootstrap

On app startup:

1. open SQLite database;
2. enable required pragmas;
3. inspect schema version;
4. run migrations transactionally;
5. seed predefined exercises if missing;
6. ensure singleton Profile and Cycle State exist.

Seed operations must be idempotent.

## 11. Predefined exercise seed

Create a modest initial library, not hundreds of exercises.

Seed should cover the MVP system sufficiently across:
- Power;
- Upper Push;
- Upper Pull;
- Lower Anterior;
- Lower Posterior;
- Core;
- Conditioning.

Seed images should be handled separately as app assets.

Users can add their own exercises.

## 12. Validation

Use domain/schema validation at boundaries.

Examples:
- weight >= 0;
- reps >= 0;
- RIR within sensible accepted range;
- benchmark attempt values > 0 when entered;
- at least one Circuit station;
- at least one Circuit round;
- every Circuit station has role and exercise;
- bodyweight required before Circuit Benchmark;
- locked Circuit Benchmark loads cannot change after start.

## 13. Data safety

SQLite writes should use transactions for multi-row operations.

High-risk operations:
- section restart;
- workout completion;
- benchmark completion;
- cycle advancement after workout completion.

Where workout completion and cycle advancement are logically one operation, perform them transactionally.

## 14. No backend

MVP has no server component.

Do not build:
- REST API;
- GraphQL;
- authentication service;
- remote database;
- sync engine.

## 15. Export / backup

Not required for MVP.

However, repository/data architecture should avoid making later export impossible.

## 16. Analytics / telemetry

Not required in MVP.

No user-tracking SDK is needed.

## 17. Notifications

No push/local benchmark notification feature in MVP.

Due state is calculated when the app is opened.

## 18. Styling

Use a small design-system layer:

- spacing tokens;
- typography tokens;
- radii;
- semantic colors;
- Button;
- Card;
- Input;
- SelectField;
- SelectionSheet;
- ExerciseThumbnail;
- TimerDisplay;
- StatusBadge.

Do not spend early implementation time on a complex theming framework.

## 19. Localization

The first UI can be German.

Avoid scattering hard-coded user-facing strings deeply through business logic.

A full localization framework is optional for MVP.

## 20. Testing priorities

Highest-value unit tests:

1. cycle progression;
2. manual override outcomes;
3. incomplete workout does not advance cycle;
4. Strength Volume;
5. Strength Benchmark;
6. e1RM;
7. Relative metrics;
8. Power comparability;
9. Circuit effective-weight rules;
10. Circuit total volume;
11. Relative Performance;
12. independent 30-day due logic.

Critical persistence integration tests:
- saved Strength set survives repository reload;
- active Circuit progress restores;
- inactive exercise remains in history;
- restart deletes only current section;
- benchmark locks persist.

## 21. Package-version policy

When initializing the project:
- use `create-expo-app@latest`;
- use `npx expo install` for Expo-managed dependencies;
- do not hard-code versions from this design document;
- commit lockfile.

This keeps package versions compatible with the Expo SDK selected at project creation.

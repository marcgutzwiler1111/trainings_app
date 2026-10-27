# Development

Phase 2 persistence APIs are documented in [src/data/README.md](src/data/README.md).
The Home/Builder/start workflow and its validation are documented in
[src/features/README.md](src/features/README.md).
Power/Strength training, timer behavior and validation are documented in
[src/features/workout/README.md](src/features/workout/README.md).
Circuit runtime, resume and restart are documented in
[src/features/workout/circuit-runtime.md](src/features/workout/circuit-runtime.md).

Workout Summary, guarded completion and cycle decisions are documented in
[src/features/workout/completion.md](src/features/workout/completion.md).

Exercise Library, Create/Edit, activation and durable local thumbnails are documented in
[src/features/exercises/README.md](src/features/exercises/README.md).

Settings, bodyweight history and independent rest defaults are documented in
[src/features/settings/README.md](src/features/settings/README.md).

Power/Circuit Benchmark workflows, due states, history and resume are documented in
[src/features/benchmarks/README.md](src/features/benchmarks/README.md).

Unified Training History, read-only snapshot details and validation are documented in
[src/features/history/README.md](src/features/history/README.md).

Progress analytics, historical Strength PRs and chart/query strategy are documented in
[src/features/progress/README.md](src/features/progress/README.md).

## Prerequisites and installation

Use Node.js 24 LTS (`.nvmrc`) and npm. From the repository root:

```sh
npm ci
```

The project was initialized using `create-expo-app@latest` with the
`blank-typescript` template. Native dependencies were selected using
`npx expo install` for Expo SDK 58. Commit `package-lock.json` with dependency
changes; use `npx expo install <package>` for Expo-managed dependencies.

## Commands

```sh
npm start          # Metro / Expo Go; scan the QR code on a compatible device
npm run android    # Requires an Android emulator or connected Android device
npm run ios        # Requires macOS and an iOS simulator
npm run web        # Browser bootstrap smoke testing
npm run typecheck
npm test
npm run lint
```

Where Expo's metadata endpoints are unavailable, use `EXPO_OFFLINE=1 npm start`
or `EXPO_OFFLINE=1 npm run web`. This uses locally installed SDK metadata and
does not disable TLS verification. Dependency downloads still need registry
access. If the default npm cache is not writable in a cloud environment, set
`npm_config_cache=/workspace/.npm` for installation commands.

For production bundle validation (not a native binary build):

```sh
npx expo export --platform android --platform ios --max-workers 2
```

## Structure

- `src/app/`: Expo Router, functional Home, Progress, History, Exercise Library, Workout Builder and Overview.
- `src/components/`: native controls, confirmations, exercise selector and placeholder UI.
- `src/data/`: SQLite initialization and migration mechanism.
- `src/features/`: application services and repository provider.
- `src/domain/`: pure training rules and calculations.
- `src/hooks/`: feature loading/actions. `src/lib/`, `src/constants/` and
  `src/types/` remain reserved.
- `src/assets/`: initial Expo template icons.
- `tests/`: migration integration tests using Node's real SQLite engine.

## Database startup and migration rules

The root `SQLiteProvider` opens `hybrid-training.db` and runs `initializeDatabase` (migrations plus seeds)
before rendering navigation. Startup shows a loading indicator and displays an
error message if initialization fails. No destructive recovery is attempted.

`PRAGMA user_version` records the schema version. Migration 1 establishes
versioning without creating any product tables or seed data. Migration 2 adds
the MVP schema; migration 3 appends the nullable historical cycle-override decision. Initialization also seeds the profile, cycle state and 29 exercises. Foreign keys and
WAL mode are enabled. Pending migrations and their version updates execute
inside a transaction. Newer database versions are rejected without downgrading.

Append consecutive migrations to `src/data/migrations.ts`; do not edit a
migration that has already shipped. Future schema changes must preserve data.
Initialization must finish before other database operations start; Expo's
`withTransactionAsync` includes operations on the same connection while active.

`npm test` checks initial setup, persistence after reopening, repeated migration
runs, migration order, rollback/retry, invalid migration numbering and refusal
to downgrade. These tests exercise the shared migration code against Node
SQLite, not a mocked SQL parser or the native Expo bridge.

## Smoke testing

1. Run `npm run web` and open the local development server.
2. Confirm Home renders (navigation is gated on SQLite initialization).
3. Switch to Progress, History, Übungen, then Home.
4. Reload and verify the tabs render again without database errors.

The optional web target uses Expo SQLite's WASM worker. `metro.config.js`
serves WASM assets and sets COOP/COEP headers needed for SharedArrayBuffer.
Any separate web host must also serve these headers. Web support supplements
the documented Android/iOS targets; native behavior still needs a compatible
device or emulator. Home, Builder, Overview and resume now use the existing
Domain Core and persistence APIs. Power, Strength and normal Circuit training are
available, including explicit total workout completion, Summary and cycle decisions.

## Cloud validation for CODEX-001

- TypeScript and ESLint passed.
- All five SQLite integration tests passed.
- Chromium smoke test passed all four tabs and page reload using expo-sqlite's
  actual web worker.
- Android and iOS Metro/Hermes exports passed; these are bundle checks, not
  native device execution.
- Android/iOS device execution remains a manual follow-up; this cloud machine
  has no configured emulator or iOS runtime.

Existing `README.md`, `AGENTS.md`, `REPO_SETUP.md` and `/docs` are preserved.

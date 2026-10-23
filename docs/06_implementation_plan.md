# 06 — Implementation Plan

## Goal

Build the MVP incrementally so each milestone is testable and reviewable.

Do not ask Codex to build the whole app in one task.

## Phase 0 — Repository bootstrap

Tasks:
- initialize Expo/TypeScript project in repository;
- configure Expo Router;
- establish `/src` structure;
- add lint/typecheck/test scripts;
- add SQLite;
- create migration mechanism;
- preserve `/docs` and `AGENTS.md`.

Acceptance:
- app launches;
- tabs shell works;
- typecheck passes;
- test command runs;
- SQLite opens successfully.

## Phase 1 — Domain core

Implement and test pure functions for:
- cycle;
- Circuit duration;
- Strength volume;
- Strength Benchmark;
- e1RM;
- relative metrics;
- benchmark comparability;
- Circuit Benchmark volume;
- Relative Performance;
- due dates.

No polished UI required.

Acceptance:
- calculations covered by unit tests;
- no calculation duplicated in screens.

## Phase 2 — Database and seed data

Implement:
- migrations;
- profile;
- bodyweight history;
- exercise tables;
- cycle state;
- workout sessions;
- Strength sets;
- Circuit snapshots;
- benchmark tables;
- repositories;
- initial exercises.

Acceptance:
- seed idempotent;
- CRUD/reload works;
- migrations tested;
- historical records survive exercise edits.

## Phase 3 — App shell and Exercise Library

Implement:
- Bottom tabs;
- Settings entry;
- Exercise Library;
- exercise create/edit;
- Active/Inactive;
- thumbnail selection/storage;
- reusable Selection Sheet.

Acceptance:
- custom exercise can be created with image;
- selector can search;
- inactive exercise disappears from default selection.

## Phase 4 — Home and cycle

Implement:
- next cycle item;
- Rest completion;
- benchmark statuses;
- active workout card;
- last workout summary;
- manual workout-type selection.

Acceptance:
- dates do not advance cycle;
- explicit Rest completion advances cycle;
- active workout is recoverable.

## Phase 5 — Workout Builder

Implement:
- Last Workout as Default;
- Power selector;
- two Strength selectors;
- Circuit builder;
- roles;
- station add/remove;
- reorder;
- rounds;
- computed duration;
- validation.

Acceptance:
- all required Builder PRD criteria work.

## Phase 6 — Power section

Implement:
- active Power UI;
- thumbnail;
- set-completed count;
- Power rest timer;
- +30;
- Skip;
- complete Power;
- restart Power.

Acceptance:
- Power progress persists across navigation/relaunch where specified.

## Phase 7 — Strength section

Implement:
- both Strength exercises on same screen;
- four set rows per exercise;
- arbitrary set ordering;
- weight/reps/RIR;
- immediate save;
- Strength rest timer;
- previous-session reference;
- Exercise Volume;
- new Volume PR feedback;
- e1RM / Relative e1RM;
- restart Strength.

Acceptance:
- alternating A/B sets works;
- app does not force order;
- calculations match unit tests;
- saved set survives restart.

## Phase 8 — Normal Circuit

Implement:
- preview;
- lock snapshot on start;
- current exercise image;
- next exercise image;
- 60 sec timer;
- vibration/sound;
- pause;
- auto station progression;
- final completion behavior;
- resume;
- restart Circuit.

Acceptance:
- final station does not loop;
- app resume restores position;
- closed app does not silently continue timer.

## Phase 9 — Workout completion and History

Implement:
- summary;
- Complete;
- Incomplete;
- cycle decision for manual override;
- transaction-safe cycle update;
- chronological History;
- session detail.

Acceptance:
- incomplete workout never auto-advances cycle;
- manual override branches work;
- historical configuration remains stable.

## Phase 10 — Strength Progress

Implement:
- exercise list;
- Volume PR;
- volume trend;
- e1RM trend;
- Relative e1RM;
- session drill-down.

Acceptance:
- exact exercise variants have separate progress.

## Phase 11 — Power Benchmark

Implement:
- overview/due state;
- setup;
- separate med-ball weights by test;
- four test flow;
- attempts;
- left/right;
- best calculation;
- compatible-result comparison;
- auto-save/resume;
- summary.

Acceptance:
- incomplete benchmark does not reset due;
- incompatible conditions do not show direct delta.

## Phase 12 — Circuit Benchmark

Implement:
- setup/bodyweight/load locks;
- fixed six stations;
- 5 rounds;
- timer;
- reps per station/round;
- current/next exercise;
- volume;
- Relative Performance;
- summary;
- auto-save/resume;
- history.

Acceptance:
- loads cannot change after start;
- calculations correct;
- incomplete benchmark does not reset due.

## Phase 13 — Progress polish

Implement:
- Power trends;
- Circuit trends;
- bodyweight trend;
- empty states;
- navigation consistency.

Charts should remain simple and factual.

## Phase 14 — Reliability and QA

Test:
- fresh install;
- upgrade/migration;
- app kill during each section;
- invalid numeric input;
- missing exercise image;
- inactive exercises;
- section restart;
- benchmark resume;
- cycle edge cases;
- 30-day boundaries.

## Phase 15 — MVP release preparation

Tasks:
- remove debug screens/logging;
- verify app name/icon;
- validate Android build;
- validate iOS build if available;
- final acceptance-criteria pass;
- tag repository `v0.1.0-mvp` or equivalent.

## Recommended Codex task size

Give Codex one phase or a clearly bounded sub-feature at a time.

Good:
`Implement Phase 1 domain calculation functions and tests according to docs.`

Good:
`Implement Strength section only; do not change Circuit or benchmarks.`

Avoid:
`Build the entire app.`

## First Codex implementation prompt

After the repository exists and these documents are committed:

> Read AGENTS.md and all files in /docs. Do not implement product features yet. Initialize the Expo/React Native TypeScript project according to docs/05_technical_architecture.md and complete only Phase 0 of docs/06_implementation_plan.md. Preserve all documentation files. Configure Expo Router, SQLite, type checking and tests. Run the available checks and report exactly what was created and any deviations.

After Phase 0 is reviewed, proceed with Phase 1.

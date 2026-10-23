# AGENTS.md

## Purpose

This repository contains the MVP implementation of the Hybrid Training App.

All coding agents must treat `/docs` as the source of truth.

## Required reading before implementation

Read these files before making product-level changes:

- `docs/01_training_system.md`
- `docs/02_product_requirements.md`
- `docs/03_ux_user_flows.md`
- `docs/04_data_model.md`
- `docs/05_technical_architecture.md`
- `docs/06_implementation_plan.md`

## Product rules

- Do not add features outside the documented MVP.
- Do not silently change training logic.
- Do not replace real metrics with an artificial score.
- Do not add accounts, cloud sync, social features, AI coaching, nutrition tracking or smartwatch integration.
- Normal Power and Circuit sessions intentionally use minimal logging.
- Preserve historical workout data.
- Inactive exercises must remain usable by historical records.
- Power Benchmark and Circuit Benchmark are scheduled independently.
- Strength Benchmark is an automatically derived per-exercise Volume PR and is not scheduled.
- Only completed normal workouts may advance the event-based training cycle.
- A manually overridden workout only advances the cycle after the user explicitly chooses how it should be counted.
- An incomplete workout must not advance the cycle automatically.

## Engineering rules

- TypeScript only for application code.
- Keep domain/business logic separate from UI components.
- Calculations must have unit tests.
- Database schema changes require migrations.
- Do not mutate historical workout snapshots when exercise-library entries are later edited.
- Avoid introducing a backend in MVP.
- Avoid new dependencies unless they materially reduce implementation risk.
- Use small, reviewable commits/features.
- Prefer simple code over speculative abstraction.
- Never delete captured workout data merely because a workout is incomplete.
- All user-entered workout data should be persisted immediately or at the smallest practical interaction boundary.

## Definition of done for a feature

A feature is done when:

1. documented acceptance criteria are satisfied;
2. TypeScript checks pass;
3. relevant unit tests pass;
4. persistence works after app restart where applicable;
5. no unrelated product behavior changes;
6. error/empty states are handled.

## UI rules

- Mobile-first.
- Large tap targets during active workouts.

## Git commit conventions

Use descriptive commit messages.

Format:

<type>: <short meaningful description>

Allowed/common types:

- feat
- fix
- test
- refactor
- docs
- chore

Examples:

feat: add workout cycle domain logic
fix: prevent incomplete workouts from advancing cycle
test: add circuit benchmark volume coverage
refactor: simplify exercise repository queries
docs: update implementation plan
chore: configure expo project bootstrap

Do not use commit messages that consist only of numbers, task IDs, hashes, or generic labels such as:

update
changes
fix stuff
phase 1
commit 2

Each commit message must describe what changed.
- Exercise selection uses compact selector fields opening searchable selection sheets.
- Exercise thumbnails are shown where they improve rapid recognition.
- During Circuit, show both current and next exercise.
- During Strength, both Strength exercises remain visible on the same screen.
- Do not force a fixed set order between the two Strength exercises.

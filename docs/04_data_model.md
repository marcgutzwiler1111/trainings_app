# 04 — Data Model

## Status

MVP logical data model.

Implementation uses SQLite. Exact SQL syntax may evolve during implementation, but domain meaning must remain stable.

## 1. Design principles

- Local-first.
- Historical records are immutable snapshots where later library edits could otherwise change meaning.
- IDs use UUID strings.
- Store timestamps in ISO-8601 UTC.
- Store user-facing dates separately only where necessary.
- Store measurement values numerically with explicit units/semantics.
- Avoid destructive cascading deletes of workout history.

## 2. Enumerations

### WorkoutType
- UK_HAMS
- OK_BRUST
- UK_QUADS
- OK_RUECKEN

### CycleItemType
- WORKOUT
- REST

### SessionStatus
- PLANNED
- IN_PROGRESS
- COMPLETE
- INCOMPLETE

### ExerciseArea
- POWER
- STRENGTH
- CIRCUIT

### ExerciseEffect
- UPPER_PUSH
- UPPER_PULL
- LOWER_ANTERIOR
- LOWER_POSTERIOR
- CORE
- CONDITIONING

### CircuitRole
- FOCUS
- NON_FOCUS
- CORE
- CONDITIONING

### BenchmarkType
- POWER
- CIRCUIT

### Side
- LEFT
- RIGHT
- NONE

## 3. Profile

### profile
Single row in MVP.

Fields:
- id
- current_bodyweight_kg
- power_rest_seconds
- strength_rest_seconds
- created_at
- updated_at

Defaults:
- power_rest_seconds = 150
- strength_rest_seconds = 120

## 4. Bodyweight history

### bodyweight_entries
- id
- bodyweight_kg
- measured_at
- source
- created_at

Sources:
- PROFILE_UPDATE
- CIRCUIT_BENCHMARK_SETUP
- optional future sources

A benchmark bodyweight is additionally snapshotted in the benchmark session and must not depend on this table later.

## 5. Exercise

### exercises
- id
- name
- thumbnail_uri nullable
- is_active
- created_at
- updated_at

### exercise_areas
- exercise_id
- area

Composite unique:
`exercise_id + area`

### exercise_effects
- exercise_id
- effect

Composite unique:
`exercise_id + effect`

Hard deletion should be avoided once referenced historically.

## 6. Cycle state

### cycle_state
Single row.

Fields:
- id
- current_position integer 1..6
- updated_at

Canonical cycle:

1. UK_HAMS
2. OK_BRUST
3. REST
4. UK_QUADS
5. OK_RUECKEN
6. REST

Cycle definition should live in domain code, not require a database table unless implementation later benefits from one.

## 7. Normal workout session

### workout_sessions
- id
- workout_type
- expected_cycle_position
- expected_workout_type nullable
- was_manual_override boolean
- status
- started_at
- completed_at nullable
- bodyweight_snapshot_kg nullable
- created_at
- updated_at

The bodyweight snapshot may be captured when needed for historical relative Strength metrics.

## 8. Power section

### workout_power_sections
- id
- workout_session_id unique
- exercise_id
- exercise_name_snapshot
- thumbnail_uri_snapshot nullable
- status
- completed_set_count
- started_at nullable
- completed_at nullable

No normal Power rep/load performance table is required.

## 9. Strength section

### workout_strength_exercises
- id
- workout_session_id
- slot enum A/B
- exercise_id
- exercise_name_snapshot
- thumbnail_uri_snapshot nullable
- effect_snapshot
- created_at

Unique:
`workout_session_id + slot`

### strength_sets
- id
- workout_strength_exercise_id
- set_number 1..4
- weight_kg
- reps
- rir
- saved_at
- updated_at

Unique:
`workout_strength_exercise_id + set_number`

### Derived Strength metrics

Prefer calculation through tested domain functions rather than storing every value.

Set Volume:
`weight_kg * reps`

Exercise Volume:
sum of all valid working-set volumes in that workout/exercise.

Strength Benchmark:
maximum completed Exercise Volume across historical sessions for exact exercise_id.

e1RM per set:
`weight * (1 + (reps + rir) / 30)`

For an exercise/session, UI may show the best set e1RM unless otherwise explicitly specified.

Relative e1RM:
`e1RM / bodyweight_snapshot`

### Weighted bodyweight exercises

MVP needs a way to identify added-load semantics without overcomplicating the exercise taxonomy.

Recommended technical field on exercise:
- load_mode

Values:
- EXTERNAL_ONLY
- BODYWEIGHT_PLUS_EXTERNAL
- BODYWEIGHT_ONLY

This is an implementation field, not a user-facing training taxonomy.

Use:
- weighted pull-up/dip → BODYWEIGHT_PLUS_EXTERNAL
- bench press → EXTERNAL_ONLY

## 10. Circuit configuration snapshot

### workout_circuit_sections
- id
- workout_session_id unique
- round_count
- station_duration_seconds fixed 60
- status
- current_round nullable
- current_station_position nullable
- started_at nullable
- completed_at nullable

### workout_circuit_stations
- id
- circuit_section_id
- position
- role
- exercise_id
- exercise_name_snapshot
- thumbnail_uri_snapshot nullable
- effect_snapshot nullable

Unique:
`circuit_section_id + position`

Normal Circuit does not require reps.

The rows above are the immutable snapshot used by history.

## 11. Last Workout as Default

Do not create a separate template system for MVP.

Build defaults by querying the latest normal workout of the requested workout type with a valid saved configuration.

Copy configuration into the new workout session.

Do not copy completion/performance values.

## 12. Power Benchmark session

### power_benchmark_sessions
- id
- status
- started_at
- completed_at nullable
- created_at
- updated_at

### power_benchmark_tests
One row per test/side result grouping.

Fields:
- id
- power_benchmark_session_id
- test_type
- side
- medicine_ball_weight_kg nullable
- unit
- best_value nullable

Test types:
- STANDING_BROAD_JUMP
- ROTATIONAL_THROW
- CHEST_PASS
- SHOT_PUT_THROW

### power_benchmark_attempts
- id
- power_benchmark_test_id
- attempt_number 1..3
- value
- created_at

For bilateral tests, create separate LEFT and RIGHT `power_benchmark_tests` rows.

Best value is derivable but may be cached if helpful.

### Comparability key

Broad Jump:
- same test type.

Medicine-ball tests:
- same test type;
- same side where applicable;
- same medicine_ball_weight_kg.

Only compatible rows receive direct delta comparison.

## 13. Circuit Benchmark session

### circuit_benchmark_sessions
- id
- status
- bodyweight_kg_snapshot
- goblet_squat_load_kg
- kettlebell_swing_load_kg
- pullup_added_load_kg
- started_at
- completed_at nullable
- created_at
- updated_at

Values above lock after start.

### circuit_benchmark_stations
Canonical fixed six exercises may be represented in code, but snapshot rows are recommended.

Fields:
- id
- circuit_benchmark_session_id
- position
- exercise_key
- exercise_name_snapshot
- thumbnail_uri_snapshot nullable
- effective_weight_kg

### circuit_benchmark_round_results
- id
- circuit_benchmark_session_id
- round_number 1..5
- station_position 1..6
- reps
- saved_at

Unique:
`session_id + round_number + station_position`

### Derived Circuit metrics

Row volume:
`reps * effective_weight_kg`

Exercise volume:
sum row volume by station/exercise.

Total volume:
sum all row volumes.

Relative Performance:
`total_volume / bodyweight_kg_snapshot`

## 14. Benchmark due dates

Do not store a mutable `next_due_date` unless necessary.

Derive:

Power Benchmark due:
`last COMPLETE power benchmark completed_at + 30 days`

Circuit Benchmark due:
`last COMPLETE circuit benchmark completed_at + 30 days`

No completed session:
`NOT_TESTED_YET`

Incomplete sessions are excluded.

## 15. Workout state persistence

Persist at these interaction boundaries at minimum:

- workout start;
- Power set-completed count;
- Power section completion;
- every Strength set save/edit;
- Circuit start/config snapshot;
- Circuit round/station progression;
- Circuit pause;
- Circuit completion;
- section restart;
- session complete/incomplete;
- every benchmark attempt/result;
- benchmark completion.

## 16. Section restart behavior

### Power restart
Delete/reset current workout Power progress only.

### Strength restart
Delete current workout strength_sets and strength exercise selections for that session, then return Strength to editable state.

### Circuit restart
Delete current circuit progress and snapshot for the current workout, then return to Circuit Builder.

Historical prior workouts are never affected.

Use transaction boundaries for restart operations.

## 17. Historical snapshot rule

At minimum snapshot:
- exercise name;
- thumbnail URI where useful;
- role/effect context;
- benchmark loads;
- bodyweight;
- Circuit order/config.

Editing an Exercise Library item later must not rewrite historical workout meaning.

## 18. Images

MVP image storage:
- local app-managed file URI;
- database stores URI/path only.

Do not store raw image blobs in SQLite unless implementation constraints require it.

Custom exercise image may come from:
- device image picker;
- camera support can be deferred if unnecessary.

Bundled predefined exercises may reference packaged static assets.

## 19. Migration requirement

Use explicit schema versioning and migrations from the first release.

Never depend on destructive recreation of the database for normal upgrades.

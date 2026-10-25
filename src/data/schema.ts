// Migration 2: first domain schema. Append future migrations; never recreate user data.
export const mvpSchema = `
CREATE TABLE profile (
  id TEXT PRIMARY KEY CHECK(id = '00000000-0000-4000-8000-000000000001'),
  current_bodyweight_kg REAL CHECK(current_bodyweight_kg > 0),
  power_rest_seconds INTEGER NOT NULL DEFAULT 150 CHECK(power_rest_seconds >= 0),
  strength_rest_seconds INTEGER NOT NULL DEFAULT 120 CHECK(strength_rest_seconds >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE bodyweight_entries (
  id TEXT PRIMARY KEY,
  bodyweight_kg REAL NOT NULL CHECK(bodyweight_kg > 0),
  measured_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('PROFILE_UPDATE','CIRCUIT_BENCHMARK_SETUP')),
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE exercises (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  thumbnail_uri TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  load_mode TEXT NOT NULL CHECK(load_mode IN ('EXTERNAL_ONLY','BODYWEIGHT_PLUS_EXTERNAL','BODYWEIGHT_ONLY')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE exercise_areas (
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  area TEXT NOT NULL CHECK(area IN ('POWER','STRENGTH','CIRCUIT')),
  PRIMARY KEY(exercise_id,area)
) STRICT;
CREATE TABLE exercise_effects (
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  effect TEXT NOT NULL CHECK(effect IN ('UPPER_PUSH','UPPER_PULL','LOWER_ANTERIOR','LOWER_POSTERIOR','CORE','CONDITIONING')),
  PRIMARY KEY(exercise_id,effect)
) STRICT;
CREATE TABLE cycle_state (
  id TEXT PRIMARY KEY CHECK(id = '00000000-0000-4000-8000-000000000002'),
  current_position INTEGER NOT NULL DEFAULT 1 CHECK(current_position BETWEEN 1 AND 6),
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE workout_sessions (
  id TEXT PRIMARY KEY,
  workout_type TEXT NOT NULL CHECK(workout_type IN ('UK_HAMS','OK_BRUST','UK_QUADS','OK_RUECKEN')),
  expected_cycle_position INTEGER NOT NULL CHECK(expected_cycle_position BETWEEN 1 AND 6),
  expected_workout_type TEXT CHECK(expected_workout_type IN ('UK_HAMS','OK_BRUST','UK_QUADS','OK_RUECKEN')),
  was_manual_override INTEGER NOT NULL CHECK(was_manual_override IN (0,1)),
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','IN_PROGRESS','COMPLETE','INCOMPLETE')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  bodyweight_snapshot_kg REAL CHECK(bodyweight_snapshot_kg > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE workout_power_sections (
  id TEXT PRIMARY KEY,
  workout_session_id TEXT NOT NULL UNIQUE REFERENCES workout_sessions(id) ON DELETE RESTRICT,
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  exercise_name_snapshot TEXT NOT NULL,
  thumbnail_uri_snapshot TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','IN_PROGRESS','COMPLETE','INCOMPLETE')),
  completed_set_count INTEGER NOT NULL DEFAULT 0 CHECK(completed_set_count >= 0),
  started_at TEXT,
  completed_at TEXT
) STRICT;
CREATE TABLE workout_strength_exercises (
  id TEXT PRIMARY KEY,
  workout_session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE RESTRICT,
  slot TEXT NOT NULL CHECK(slot IN ('A','B')),
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  exercise_name_snapshot TEXT NOT NULL,
  thumbnail_uri_snapshot TEXT,
  effect_snapshot TEXT CHECK(effect_snapshot IN ('UPPER_PUSH','UPPER_PULL','LOWER_ANTERIOR','LOWER_POSTERIOR','CORE','CONDITIONING')),
  is_complete INTEGER NOT NULL DEFAULT 0 CHECK(is_complete IN (0,1)),
  created_at TEXT NOT NULL,
  UNIQUE(workout_session_id,slot)
) STRICT;
CREATE TABLE strength_sets (
  id TEXT PRIMARY KEY,
  workout_strength_exercise_id TEXT NOT NULL REFERENCES workout_strength_exercises(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL CHECK(set_number BETWEEN 1 AND 4),
  weight_kg REAL NOT NULL CHECK(weight_kg >= 0),
  reps INTEGER NOT NULL CHECK(reps >= 0),
  rir REAL NOT NULL CHECK(rir >= 0),
  saved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workout_strength_exercise_id,set_number)
) STRICT;
CREATE TABLE workout_circuit_sections (
  id TEXT PRIMARY KEY,
  workout_session_id TEXT NOT NULL UNIQUE REFERENCES workout_sessions(id) ON DELETE RESTRICT,
  round_count INTEGER NOT NULL CHECK(round_count > 0),
  station_duration_seconds INTEGER NOT NULL DEFAULT 60 CHECK(station_duration_seconds = 60),
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','IN_PROGRESS','COMPLETE','INCOMPLETE')),
  current_round INTEGER CHECK(current_round >= 1 AND current_round <= round_count),
  current_station_position INTEGER CHECK(current_station_position >= 1),
  started_at TEXT,
  completed_at TEXT
) STRICT;
CREATE TABLE workout_circuit_stations (
  id TEXT PRIMARY KEY,
  circuit_section_id TEXT NOT NULL REFERENCES workout_circuit_sections(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK(position >= 1),
  role TEXT NOT NULL CHECK(role IN ('FOCUS','CORE','CONDITIONING','NON_FOCUS')),
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  exercise_name_snapshot TEXT NOT NULL,
  thumbnail_uri_snapshot TEXT,
  effect_snapshot TEXT CHECK(effect_snapshot IN ('UPPER_PUSH','UPPER_PULL','LOWER_ANTERIOR','LOWER_POSTERIOR','CORE','CONDITIONING')),
  UNIQUE(circuit_section_id,position)
) STRICT;
CREATE TABLE power_benchmark_sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','IN_PROGRESS','COMPLETE','INCOMPLETE')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE power_benchmark_tests (
  id TEXT PRIMARY KEY,
  power_benchmark_session_id TEXT NOT NULL REFERENCES power_benchmark_sessions(id) ON DELETE RESTRICT,
  test_type TEXT NOT NULL CHECK(test_type IN ('STANDING_BROAD_JUMP','ROTATIONAL_THROW','CHEST_PASS','SHOT_PUT_THROW')),
  side TEXT NOT NULL CHECK(side IN ('LEFT','RIGHT','NONE')),
  medicine_ball_weight_kg REAL CHECK(medicine_ball_weight_kg > 0),
  unit TEXT NOT NULL,
  best_value REAL CHECK(best_value > 0),
  UNIQUE(power_benchmark_session_id,test_type,side),
  CHECK((test_type = 'STANDING_BROAD_JUMP' AND side = 'NONE' AND medicine_ball_weight_kg IS NULL) OR (test_type = 'CHEST_PASS' AND side = 'NONE' AND medicine_ball_weight_kg IS NOT NULL) OR (test_type IN ('ROTATIONAL_THROW','SHOT_PUT_THROW') AND side IN ('LEFT','RIGHT') AND medicine_ball_weight_kg IS NOT NULL))
) STRICT;
CREATE TABLE power_benchmark_attempts (
  id TEXT PRIMARY KEY,
  power_benchmark_test_id TEXT NOT NULL REFERENCES power_benchmark_tests(id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK(attempt_number BETWEEN 1 AND 3),
  value REAL NOT NULL CHECK(value > 0),
  created_at TEXT NOT NULL,
  UNIQUE(power_benchmark_test_id,attempt_number)
) STRICT;
CREATE TABLE circuit_benchmark_sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','IN_PROGRESS','COMPLETE','INCOMPLETE')),
  bodyweight_kg_snapshot REAL NOT NULL CHECK(bodyweight_kg_snapshot > 0),
  goblet_squat_load_kg REAL NOT NULL CHECK(goblet_squat_load_kg >= 0),
  kettlebell_swing_load_kg REAL NOT NULL CHECK(kettlebell_swing_load_kg >= 0),
  pullup_added_load_kg REAL NOT NULL CHECK(pullup_added_load_kg >= 0),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE circuit_benchmark_stations (
  id TEXT PRIMARY KEY,
  circuit_benchmark_session_id TEXT NOT NULL REFERENCES circuit_benchmark_sessions(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 6),
  exercise_key TEXT NOT NULL CHECK(exercise_key IN ('GOBLET_SQUAT','PUSH_UPS','KETTLEBELL_SWING','PULL_UPS_CHIN_UPS','HANGING_LEG_RAISES','BURPEES')),
  exercise_name_snapshot TEXT NOT NULL,
  thumbnail_uri_snapshot TEXT,
  effective_weight_kg REAL NOT NULL CHECK(effective_weight_kg >= 0),
  UNIQUE(circuit_benchmark_session_id,position),
  UNIQUE(circuit_benchmark_session_id,exercise_key)
) STRICT;
CREATE TABLE circuit_benchmark_round_results (
  id TEXT PRIMARY KEY,
  circuit_benchmark_session_id TEXT NOT NULL,
  round_number INTEGER NOT NULL CHECK(round_number BETWEEN 1 AND 5),
  station_position INTEGER NOT NULL CHECK(station_position BETWEEN 1 AND 6),
  reps INTEGER NOT NULL CHECK(reps >= 0),
  saved_at TEXT NOT NULL,
  UNIQUE(circuit_benchmark_session_id,round_number,station_position),
  FOREIGN KEY(circuit_benchmark_session_id,station_position) REFERENCES circuit_benchmark_stations(circuit_benchmark_session_id,position) ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX one_active_workout ON workout_sessions((1)) WHERE status = 'IN_PROGRESS';
CREATE INDEX workout_by_type ON workout_sessions(workout_type, created_at DESC);
CREATE INDEX bodyweight_by_date ON bodyweight_entries(measured_at DESC);
CREATE INDEX strength_by_exercise ON workout_strength_exercises(exercise_id);
CREATE INDEX power_by_completion ON power_benchmark_sessions(status, completed_at);
CREATE INDEX circuit_by_completion ON circuit_benchmark_sessions(status, completed_at);
CREATE TRIGGER circuit_loads_locked BEFORE UPDATE OF bodyweight_kg_snapshot,goblet_squat_load_kg,kettlebell_swing_load_kg,pullup_added_load_kg,started_at ON circuit_benchmark_sessions
BEGIN SELECT RAISE(ABORT, 'Benchmark snapshot is immutable'); END;
CREATE TRIGGER circuit_station_locked BEFORE UPDATE ON circuit_benchmark_stations
BEGIN SELECT RAISE(ABORT, 'Benchmark station snapshot is immutable'); END;
`;

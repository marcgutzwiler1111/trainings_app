import type { SessionStatus, WorkoutType, LoadMode, Side } from '../domain/shared/types.ts';
import type { CyclePosition } from '../domain/cycle/cycle.ts';
import type { PowerBenchmarkTestType } from '../domain/benchmarks/power.ts';
import type { CircuitBenchmarkExerciseKey } from '../domain/benchmarks/circuit.ts';

export type Area = 'POWER' | 'STRENGTH' | 'CIRCUIT';
export type Effect = 'UPPER_PUSH' | 'UPPER_PULL' | 'LOWER_ANTERIOR' | 'LOWER_POSTERIOR' | 'CORE' | 'CONDITIONING';
export type CircuitRole = 'FOCUS' | 'NON_FOCUS' | 'CORE' | 'CONDITIONING';
export interface Profile {
  id: string; current_bodyweight_kg: number | null; power_rest_seconds: number;
  strength_rest_seconds: number; created_at: string; updated_at: string;
}
export interface BodyweightEntry {
  id: string; bodyweight_kg: number; measured_at: string;
  source: 'PROFILE_UPDATE' | 'CIRCUIT_BENCHMARK_SETUP'; created_at: string;
}
export interface Exercise {
  id: string; name: string; thumbnail_uri: string | null; is_active: boolean;
  load_mode: LoadMode; created_at: string; updated_at: string; areas: Area[]; effects: Effect[];
}
export interface ExerciseInput {
  name: string; thumbnail_uri?: string | null; load_mode: LoadMode; areas: readonly Area[]; effects: readonly Effect[];
}
export interface CycleState { id: string; current_position: CyclePosition; updated_at: string }
export interface WorkoutSession {
  id: string; workout_type: WorkoutType; expected_cycle_position: CyclePosition;
  expected_workout_type: WorkoutType | null; was_manual_override: number; status: SessionStatus;
  started_at: string; completed_at: string | null; bodyweight_snapshot_kg: number | null;
  created_at: string; updated_at: string;
}
export interface PowerSection {
  id: string; workout_session_id: string; exercise_id: string; exercise_name_snapshot: string;
  thumbnail_uri_snapshot: string | null; status: SessionStatus; completed_set_count: number;
  started_at: string | null; completed_at: string | null;
}
export interface StrengthExercise {
  id: string; workout_session_id: string; slot: 'A' | 'B'; exercise_id: string;
  exercise_name_snapshot: string; thumbnail_uri_snapshot: string | null; effect_snapshot: Effect | null;
  is_complete: number; created_at: string;
}
export interface StrengthSet {
  id: string; workout_strength_exercise_id: string; set_number: number;
  weight_kg: number; reps: number; rir: number; saved_at: string; updated_at: string;
}
export interface CircuitSection {
  id: string; workout_session_id: string; round_count: number; station_duration_seconds: 60;
  status: SessionStatus; current_round: number | null; current_station_position: number | null;
  started_at: string | null; completed_at: string | null;
}
export interface CircuitStation {
  id: string; circuit_section_id: string; position: number; role: CircuitRole; exercise_id: string;
  exercise_name_snapshot: string; thumbnail_uri_snapshot: string | null; effect_snapshot: Effect | null;
}
export interface BenchmarkSession {
  id: string; status: SessionStatus; started_at: string; completed_at: string | null;
  created_at: string; updated_at: string;
}
export interface PowerTest {
  id: string; power_benchmark_session_id: string; test_type: PowerBenchmarkTestType; side: Side;
  medicine_ball_weight_kg: number | null; unit: string; best_value: number | null;
}
export interface PowerAttempt {
  id: string; power_benchmark_test_id: string; attempt_number: number; value: number; created_at: string;
}
export interface CircuitBenchmarkSession extends BenchmarkSession {
  bodyweight_kg_snapshot: number; goblet_squat_load_kg: number; kettlebell_swing_load_kg: number; pullup_added_load_kg: number;
}
export interface BenchmarkStation {
  id: string; circuit_benchmark_session_id: string; position: number;
  exercise_key: CircuitBenchmarkExerciseKey; exercise_name_snapshot: string;
  thumbnail_uri_snapshot: string | null; effective_weight_kg: number;
}
export interface RoundResult {
  id: string; circuit_benchmark_session_id: string; round_number: number;
  station_position: number; reps: number; saved_at: string;
}

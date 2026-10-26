import type { createRepositories } from '../../data/repositories/index.ts';
import { InactiveExerciseError, TrainingStateError } from '../../data/repositories/workout.ts';
import type { StrengthExercise, StrengthSet } from '../../data/types.ts';
import { calculateE1RM, evaluateStrengthBenchmark } from '../../domain/strength/calculations.ts';
import { calculateCircuitDuration } from '../../domain/circuit/duration.ts';
import { integer, nonNegative } from '../../domain/shared/validation.ts';
import { FeatureError } from '../application/errors.ts';
import { strengthEffects, workoutLabels } from './builder.ts';

export type StrengthRow = { exercise: StrengthExercise; sets: StrengthSet[] };
export function strengthProgress(rows: readonly StrengthRow[]) {
  const status = rows.length === 2 && rows.every(r => r.exercise.is_complete === 1) ? 'COMPLETE'
    : rows.some(r => r.exercise.is_complete === 1 || r.sets.length > 0) ? 'IN_PROGRESS' : 'PLANNED';
  return { status, exercises: rows.map(r => ({ id: r.exercise.id, slot: r.exercise.slot, saved: r.sets.length, complete: r.exercise.is_complete === 1 })) } as const;
}
export const sectionLabels = { PLANNED: 'Geplant', IN_PROGRESS: 'In Bearbeitung', COMPLETE: 'Abgeschlossen', INCOMPLETE: 'Unvollständig' };
export interface SetInput { weight: string; reps: string; rir: string }
export function parseSetInput(input: SetInput) {
  const number = (text: string) => text.trim() === '' ? NaN : Number(text.trim().replace(',', '.'));
  const weight = number(input.weight); const reps = number(input.reps); const rir = number(input.rir);
  try { nonNegative(weight, 'weight'); integer(reps, 'reps'); nonNegative(rir, 'rir'); }
  catch { throw new FeatureError('Bitte Gewicht und RIR als Zahlen ab 0 sowie Wiederholungen als ganze Zahl ab 0 eingeben. Alle drei Felder sind erforderlich.'); }
  return { weight, reps, rir };
}
function performance(row: StrengthRow) {
  return { exerciseId: row.exercise.exercise_id, isComplete: row.exercise.is_complete === 1, sets: row.sets.map(s => ({ weight: s.weight_kg, reps: s.reps })) };
}
export function createActiveWorkoutServices(repositories: ReturnType<typeof createRepositories>) {
  const load = async (id: string) => {
    const snapshot = await repositories.workouts.trainingSnapshot(id);
    if (!snapshot) throw new FeatureError('Workout nicht gefunden.');
    if (!['PLANNED', 'IN_PROGRESS'].includes(snapshot.session.status)) throw new FeatureError('Dieses Workout ist nicht mehr aktiv. Gespeicherte Daten bleiben erhalten.');
    if (!snapshot.power) throw new FeatureError('Der Power-Bereich fehlt. Bitte zum Workout Overview zurückkehren.');
    if (snapshot.strength.length !== 2) throw new FeatureError('Eine Strength-Übung fehlt. Bitte zum Workout Overview zurückkehren.');
    const [profile, exercises] = await Promise.all([repositories.profile.get(), repositories.exercises.list(true)]);
    return { ...snapshot, power: snapshot.power, profile, exercises, label: workoutLabels[snapshot.session.workout_type] };
  };
  const command = async (task: () => Promise<void>) => {
    try { await task(); }
    catch (error) {
      if (error instanceof RangeError) throw new FeatureError('Diese Zahlen können nicht verarbeitet werden. Bitte gültige, kleinere Werte verwenden.');
      if (error instanceof TrainingStateError) throw new FeatureError(error.message);
      if (error instanceof InactiveExerciseError) throw new FeatureError('Die gewählte Übung ist nicht mehr aktiv. Bitte erneut auswählen.');
      throw error;
    }
  };
  return {
    async power(id: string) {
      const state = await load(id);
      return { ...state, restSeconds: state.profile.power_rest_seconds, nextSet: Math.min(state.power.completed_set_count + 1, 4),
        inactive: !state.exercises.find(e => e.id === state.power.exercise_id)?.is_active };
    },
    beginPower: (id: string) => command(() => repositories.workouts.beginPower(id)),
    completePowerSet: (id: string, expectedCount: number) => command(() => repositories.workouts.advancePower(id, expectedCount)),
    completePower: (id: string) => command(() => repositories.workouts.completePower(id)),
    restart: (id: string, section: 'POWER' | 'STRENGTH') => command(() => repositories.workouts.restartTraining(id, section)),
    async strength(id: string) {
      const state = await load(id);
      if (state.power.status !== 'COMPLETE') throw new FeatureError('Bitte zuerst Power abschließen.');
      const rows = [];
      for (const row of state.strength) {
        const history = await repositories.workouts.strengthHistory(row.exercise.exercise_id, id);
        const benchmark = evaluateStrengthBenchmark(performance(row), history.map(performance));
        rows.push({ ...row, previous: history.find(h => h.sets.length > 0) ?? null, benchmark,
          bestE1RM: row.sets.length ? Math.max(...row.sets.map(s => calculateE1RM(s.weight_kg, s.reps, s.rir))) : null,
          inactive: !state.exercises.find(e => e.id === row.exercise.exercise_id)?.is_active });
      }
      return { ...state, rows, progress: strengthProgress(rows), restSeconds: state.profile.strength_rest_seconds };
    },
    async saveSet(id: string, strengthId: string, setNumber: number, input: SetInput) {
      const { weight, reps, rir } = parseSetInput(input);
      await command(() => repositories.workouts.saveTrainingSet(id, strengthId, setNumber, weight, reps, rir));
    },
    completeExercise: (id: string, strengthId: string) => command(() => repositories.workouts.completeTrainingExercise(id, strengthId)),
    async changeStrength(id: string, slot: 'A' | 'B', exerciseId: string) {
      const state = await load(id);
      const effect = strengthEffects(state.session.workout_type)[slot === 'A' ? 0 : 1];
      await command(() => repositories.workouts.changeTrainingStrength(id, slot, exerciseId, effect));
    },
    async preview(id: string) {
      const state = await load(id);
      if (state.power.status !== 'COMPLETE' || strengthProgress(state.strength).status !== 'COMPLETE') throw new FeatureError('Bitte zuerst Power und beide Strength-Übungen abschließen.');
      const circuit = await repositories.workouts.circuit(id);
      if (!circuit) throw new FeatureError('Die Circuit-Konfiguration fehlt.');
      return { ...circuit, durationSeconds: calculateCircuitDuration(circuit.stations.length, circuit.section.round_count) };
    },
  };
}

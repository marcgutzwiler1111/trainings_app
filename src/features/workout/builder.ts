import type { WorkoutType } from '../../domain/shared/types.ts';
import type { Area, Effect, Exercise, CircuitRole } from '../../data/types.ts';
import { calculateCircuitDuration } from '../../domain/circuit/duration.ts';

export const workoutLabels: Record<WorkoutType, string> = {
  UK_HAMS: 'UK Hams', OK_BRUST: 'OK Brust', UK_QUADS: 'UK Quads', OK_RUECKEN: 'OK Rücken',
};
export const workoutTypes = Object.keys(workoutLabels) as WorkoutType[];
export function isWorkoutType(value: unknown): value is WorkoutType {
  return typeof value === 'string' && Object.hasOwn(workoutLabels, value);
}
export const roleLabels: Record<CircuitRole, string> = {
  FOCUS: 'Focus', CORE: 'Core', CONDITIONING: 'Conditioning', NON_FOCUS: 'Non-Focus',
};
export const defaultRoles: readonly CircuitRole[] = ['FOCUS', 'CORE', 'FOCUS', 'CONDITIONING', 'FOCUS', 'NON_FOCUS'];
const effects: Record<WorkoutType, readonly [Effect, Effect]> = {
  UK_HAMS: ['LOWER_POSTERIOR', 'LOWER_ANTERIOR'], OK_BRUST: ['UPPER_PUSH', 'UPPER_PULL'],
  UK_QUADS: ['LOWER_ANTERIOR', 'LOWER_POSTERIOR'], OK_RUECKEN: ['UPPER_PULL', 'UPPER_PUSH'],
};
export function strengthEffects(type: WorkoutType): readonly [Effect, Effect] { return effects[type]; }
export function circuitEffect(type: WorkoutType, role: CircuitRole): Effect {
  switch (role) {
    case 'CORE': return 'CORE';
    case 'CONDITIONING': return 'CONDITIONING';
    case 'FOCUS': return effects[type][0];
    case 'NON_FOCUS': return effects[type][1];
  }
}
export interface BuilderDraft {
  workoutType: WorkoutType;
  powerExerciseId: string | null;
  strengthA: string | null;
  strengthB: string | null;
  rounds: number;
  stations: { role: CircuitRole; exerciseId: string | null }[];
}
export type CircuitDraft = Pick<BuilderDraft, 'rounds' | 'stations'>;
export function defaultBuilder(workoutType: WorkoutType): BuilderDraft {
  return { workoutType, powerExerciseId: null, strengthA: null, strengthB: null, rounds: 5,
    stations: defaultRoles.map(role => ({ role, exerciseId: null })) };
}
export function builderDuration(draft: CircuitDraft): number | null {
  try { return calculateCircuitDuration(draft.stations.length, draft.rounds); }
  catch { return null; }
}
export function validateBuilder(draft: BuilderDraft, exercises: readonly Exercise[]): string[] {
  const errors: string[] = [];
  const active = new Set(exercises.filter(e => e.is_active).map(e => e.id));
  const check = (id: string | null, label: string) => {
    if (!id) errors.push(`${label}: Bitte eine Übung auswählen.`);
    else if (!active.has(id)) errors.push(`${label}: Die gewählte Übung ist nicht mehr aktiv. Bitte erneut auswählen.`);
  };
  if (!isWorkoutType(draft.workoutType)) errors.push('Bitte einen gültigen Workout Type wählen.');
  check(draft.powerExerciseId, 'Power'); check(draft.strengthA, 'Strength A'); check(draft.strengthB, 'Strength B');
  return [...errors, ...validateCircuitDraft(draft, exercises)];
}
export function validateCircuitDraft(draft: CircuitDraft, exercises: readonly Exercise[]): string[] {
  const errors: string[] = [];
  const active = new Set(exercises.filter(e => e.is_active).map(e => e.id));
  if (!draft.stations.length) errors.push('Circuit: Mindestens eine Station hinzufügen.');
  for (const [index, station] of draft.stations.entries()) {
    if (!Object.hasOwn(roleLabels, station.role)) errors.push(`Station ${index + 1}: Bitte eine Rolle wählen.`);
    if (!station.exerciseId) errors.push(`Station ${index + 1}: Bitte eine Übung auswählen.`);
    else if (!active.has(station.exerciseId)) errors.push(`Station ${index + 1}: Die gewählte Übung ist nicht mehr aktiv. Bitte erneut auswählen.`);
  }
  if (builderDuration(draft) === null) errors.push('Circuit: Runden und Stationen müssen positive ganze Zahlen sein.');
  return errors;
}
export function exerciseOptions(exercises: readonly Exercise[], area: Area, effect: Effect | undefined, query: string, showAll: boolean): Exercise[] {
  const matches = (e: Exercise) => e.areas.includes(area) && (!effect || e.effects.includes(effect));
  return exercises.filter(e => e.is_active && e.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (showAll || matches(e)))
    .sort((a, b) => Number(matches(b)) - Number(matches(a)) || a.name.localeCompare(b.name));
}
export function moveStation<T extends Pick<BuilderDraft, 'stations'>>(draft: T, index: number, delta: -1 | 1): T {
  const target = index + delta;
  if (target < 0 || target >= draft.stations.length) return draft;
  const stations = [...draft.stations]; [stations[index], stations[target]] = [stations[target], stations[index]];
  return { ...draft, stations };
}

import type { SessionStatus, WorkoutType } from '../shared/types.ts';
import { assertNever, integer } from '../shared/validation.ts';

export type CyclePosition = 1 | 2 | 3 | 4 | 5 | 6;
export type CycleItem =
  | { readonly position: CyclePosition; readonly type: 'WORKOUT'; readonly workoutType: WorkoutType }
  | { readonly position: CyclePosition; readonly type: 'REST' };
export type ManualOverrideResult = 'CONTINUE_CYCLE_NORMALLY' | 'COUNT_AS_CURRENT_CYCLE_WORKOUT';
export type CycleCompletionResult = {
  readonly position: CyclePosition;
  readonly outcome: 'ADVANCED' | 'UNCHANGED' | 'OVERRIDE_REQUIRED';
};

const items: readonly CycleItem[] = [
  { position: 1, type: 'WORKOUT', workoutType: 'UK_HAMS' },
  { position: 2, type: 'WORKOUT', workoutType: 'OK_BRUST' },
  { position: 3, type: 'REST' },
  { position: 4, type: 'WORKOUT', workoutType: 'UK_QUADS' },
  { position: 5, type: 'WORKOUT', workoutType: 'OK_RUECKEN' },
  { position: 6, type: 'REST' },
];

export function getCycleItem(position: CyclePosition): CycleItem {
  integer(position, 'cycle position', 1);
  if (position > 6) throw new RangeError('Cycle position must be between 1 and 6.');
  // Returning a fresh value protects the canonical cycle from caller mutation.
  return { ...items[position - 1] };
}

/** Low-level event transition; never consults calendar time. */
export function nextCyclePosition(position: CyclePosition): CyclePosition {
  getCycleItem(position);
  return (position === 6 ? 1 : position + 1) as CyclePosition;
}

/** Call only for an explicit Rest completion event. */
export function completeRest(position: CyclePosition): CycleCompletionResult {
  if (getCycleItem(position).type !== 'REST') throw new RangeError('Current cycle item is not Rest.');
  return { position: nextCyclePosition(position), outcome: 'ADVANCED' };
}

export function completeWorkout(input: {
  readonly position: CyclePosition;
  readonly workoutType: WorkoutType;
  readonly status: SessionStatus;
  readonly manualOverride?: ManualOverrideResult;
}): CycleCompletionResult {
  const { position, workoutType, status, manualOverride } = input;
  const expected = getCycleItem(position);
  switch (workoutType) {
    case 'UK_HAMS': case 'OK_BRUST': case 'UK_QUADS': case 'OK_RUECKEN': break;
    default: return assertNever(workoutType);
  }
  switch (status) {
    case 'PLANNED': case 'IN_PROGRESS': case 'INCOMPLETE':
      return { position, outcome: 'UNCHANGED' };
    case 'COMPLETE': break;
    default: return assertNever(status);
  }
  if (expected.type === 'WORKOUT' && expected.workoutType === workoutType) {
    return { position: nextCyclePosition(position), outcome: 'ADVANCED' };
  }
  switch (manualOverride) {
    case undefined:
      return { position, outcome: 'OVERRIDE_REQUIRED' };
    case 'CONTINUE_CYCLE_NORMALLY':
      // Confirmed CODEX-002 rule: keep the expected item pending.
      return { position, outcome: 'UNCHANGED' };
    case 'COUNT_AS_CURRENT_CYCLE_WORKOUT':
      return { position: nextCyclePosition(position), outcome: 'ADVANCED' };
    default:
      return assertNever(manualOverride);
  }
}

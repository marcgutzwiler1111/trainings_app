import { integer } from '../../domain/shared/validation.ts';
export interface RestTimerState { remaining: number; running: boolean }
export function resetRestTimer(seconds: number): RestTimerState {
  integer(seconds, 'rest seconds'); return { remaining: seconds, running: seconds > 0 };
}
export function tickRestTimer(state: RestTimerState, elapsed = 1): RestTimerState {
  integer(elapsed, 'elapsed seconds');
  if (!state.running || elapsed === 0) return state;
  return resetRestTimer(Math.max(0, state.remaining - elapsed));
}
export function extendRestTimer(state: RestTimerState): RestTimerState { return resetRestTimer(state.remaining + 30); }
export function skipRestTimer(): RestTimerState { return { remaining: 0, running: false }; }
export function formatRestTime(seconds: number): string { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; }

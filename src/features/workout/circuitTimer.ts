import { integer } from '../../domain/shared/validation.ts';
export interface CircuitTimerState { readonly duration: number; readonly remaining: number; readonly phase: 'paused' | 'running' | 'expired' | 'complete' }
export function resetCircuitTimer(duration: number): CircuitTimerState {
  integer(duration, 'station duration', 1); return { duration, remaining: duration, phase: 'paused' };
}
export function resumeCircuitTimer(state: CircuitTimerState): CircuitTimerState { return state.phase === 'paused' ? { ...state, phase: 'running' } : state; }
export function startCircuitTimer(duration: number): CircuitTimerState { return resumeCircuitTimer(resetCircuitTimer(duration)); }
export function pauseCircuitTimer(state: CircuitTimerState): CircuitTimerState { return state.phase === 'running' ? { ...state, phase: 'paused' } : state; }
export function tickCircuitTimer(state: CircuitTimerState, elapsed = 1): CircuitTimerState {
  integer(elapsed, 'elapsed seconds');
  if (state.phase !== 'running' || elapsed === 0) return state;
  const remaining = Math.max(0, state.remaining - elapsed);
  return { ...state, remaining, phase: remaining === 0 ? 'expired' : 'running' };
}
export function finishCircuitTimer(state: CircuitTimerState): CircuitTimerState { return { ...state, remaining: 0, phase: 'complete' }; }

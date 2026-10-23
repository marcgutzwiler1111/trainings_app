import type { LoadMode } from './types.ts';
import { assertNever, integer, nonNegative, positive } from './validation.ts';

export type Load =
  | { readonly mode: Extract<LoadMode, 'EXTERNAL_ONLY'>; readonly externalLoad: number }
  | { readonly mode: Extract<LoadMode, 'BODYWEIGHT_PLUS_EXTERNAL'>; readonly addedLoad: number }
  | { readonly mode: Extract<LoadMode, 'BODYWEIGHT_ONLY'> };

/** No rounding: kg × repetitions. Used by Strength and Circuit benchmarks. */
export function calculateVolume(weight: number, reps: number): number {
  nonNegative(weight, 'weight');
  integer(reps, 'reps');
  return nonNegative(weight * reps, 'volume');
}

export function calculateEffectiveLoad(load: Load, bodyweight: number): number {
  positive(bodyweight, 'bodyweight');
  switch (load.mode) {
    case 'EXTERNAL_ONLY':
      return nonNegative(load.externalLoad, 'externalLoad');
    case 'BODYWEIGHT_PLUS_EXTERNAL':
      return nonNegative(bodyweight + nonNegative(load.addedLoad, 'addedLoad'), 'effectiveLoad');
    case 'BODYWEIGHT_ONLY':
      return bodyweight;
    default:
      return assertNever(load);
  }
}

/** Shared division only; callers retain the distinct metric names. */
export function relativeToBodyweight(value: number, bodyweight: number): number {
  nonNegative(value, 'value');
  positive(bodyweight, 'bodyweight');
  return nonNegative(value / bodyweight, 'relative value');
}

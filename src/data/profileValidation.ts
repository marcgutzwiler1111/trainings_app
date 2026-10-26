import { integer, positive } from '../domain/shared/validation.ts';

export const bodyweightLimits = { min: 20, max: 400 } as const;
export const restDurationLimits = { min: 30, max: 600, step: 30 } as const;
export type RestKind = 'POWER' | 'STRENGTH';
export function validateBodyweight(weight: number): void {
  positive(weight, 'bodyweight');
  if (weight < bodyweightLimits.min || weight > bodyweightLimits.max) throw new RangeError('bodyweight outside settings limits');
}
export function validateRestDuration(seconds: number): void {
  integer(seconds, 'rest seconds', restDurationLimits.min);
  if (seconds > restDurationLimits.max) throw new RangeError('rest duration outside settings limits');
}

import type { ExerciseInput, Area, Effect } from './types.ts';

export const exerciseAreas: readonly Area[] = ['POWER', 'STRENGTH', 'CIRCUIT'];
export const exerciseEffects: readonly Effect[] = ['UPPER_PUSH', 'UPPER_PULL', 'LOWER_ANTERIOR', 'LOWER_POSTERIOR', 'CORE', 'CONDITIONING'];

/** Validate at both application and repository boundaries; SQL remains a final safeguard. */
export function validateExerciseInput(input: ExerciseInput): ExerciseInput {
  if (typeof input.name !== 'string' || !input.name.trim()) throw new RangeError('Bitte einen Namen eingeben.');
  if (!Array.isArray(input.areas) || !input.areas.length) throw new RangeError('Bitte mindestens eine Area wählen.');
  if (input.areas.some(area => !exerciseAreas.includes(area))) throw new RangeError('Bitte nur gültige Areas wählen.');
  if (!Array.isArray(input.effects) || !input.effects.length) throw new RangeError('Bitte mindestens einen Effect wählen.');
  if (input.effects.some(effect => !exerciseEffects.includes(effect))) throw new RangeError('Bitte nur gültige Effects wählen.');
  if (!['EXTERNAL_ONLY', 'BODYWEIGHT_PLUS_EXTERNAL', 'BODYWEIGHT_ONLY'].includes(input.load_mode)) throw new RangeError('Ungültiger Lastmodus.');
  const uri = input.thumbnail_uri ?? null;
  if (uri !== null && (typeof uri !== 'string' || !uri.trim() || /^(data|blob):/i.test(uri))) throw new RangeError('Bitte ein dauerhaft gespeichertes Bild wählen oder das Bild entfernen.');
  return { ...input, name: input.name.trim(), areas: [...new Set(input.areas)], effects: [...new Set(input.effects)], thumbnail_uri: uri };
}

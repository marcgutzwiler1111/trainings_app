import type { createRepositories } from '../../data/repositories/index.ts';
import { validateBodyweight, validateRestDuration, restDurationLimits, type RestKind } from '../../data/profileValidation.ts';
import { formatRestTime } from '../workout/restTimer.ts';
import { FeatureError } from '../application/errors.ts';

export function parseBodyweight(text: string): number {
  const value = text.trim();
  const weight = /^[+]?\d+(?:[.,]\d+)?$/.test(value) ? Number(value.replace(',', '.')) : NaN;
  try { validateBodyweight(weight); }
  catch { throw new FeatureError('Bitte ein Körpergewicht zwischen 20 und 400 kg eingeben. Punkt oder Komma sind als Dezimaltrennzeichen möglich.'); }
  return weight;
}
export function formatBodyweight(weight: number): string { return `${weight} kg`; }
export function formatSettingDuration(seconds: number): string { return formatRestTime(seconds).replace(/^0(?=\d:)/, ''); }
export function stepRestDuration(seconds: number, direction: -1 | 1): number {
  return Math.min(restDurationLimits.max, Math.max(restDurationLimits.min, seconds + direction * restDurationLimits.step));
}
export function createSettingsServices(repositories: ReturnType<typeof createRepositories>) {
  return {
    load: () => repositories.profile.get(),
    history: () => repositories.bodyweight.list(true),
    async updateBodyweight(text: string) {
      const weight = parseBodyweight(text);
      const id = await repositories.bodyweight.update(weight);
      return { changed: id !== null, weight };
    },
    async updateRestTimer(kind: RestKind, seconds: number) {
      if (kind !== 'POWER' && kind !== 'STRENGTH') throw new FeatureError('Bitte Power oder Strength wählen.');
      try { validateRestDuration(seconds); }
      catch { throw new FeatureError('Die Pausenzeit muss zwischen 30 Sekunden und 10 Minuten liegen.'); }
      await repositories.profile.updateRestTimer(kind, seconds);
    },
  };
}

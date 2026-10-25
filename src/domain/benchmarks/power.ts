import type { Side } from '../shared/types.ts';
import { assertNever, positive } from '../shared/validation.ts';

export type PowerBenchmarkTestType =
  | 'STANDING_BROAD_JUMP'
  | 'ROTATIONAL_THROW'
  | 'CHEST_PASS'
  | 'SHOT_PUT_THROW';

export type PowerTestConditions =
  | { readonly testType: 'STANDING_BROAD_JUMP'; readonly side: Extract<Side, 'NONE'> }
  | { readonly testType: 'CHEST_PASS'; readonly side: Extract<Side, 'NONE'>; readonly medicineBallWeight: number }
  | {
    readonly testType: 'ROTATIONAL_THROW' | 'SHOT_PUT_THROW';
    readonly side: Exclude<Side, 'NONE'>;
    readonly medicineBallWeight: number;
  };

function validateConditions(conditions: PowerTestConditions): void {
  switch (conditions.testType) {
    case 'STANDING_BROAD_JUMP':
    case 'CHEST_PASS':
      if (conditions.side !== 'NONE') throw new RangeError('This test must use side NONE.');
      break;
    case 'ROTATIONAL_THROW':
    case 'SHOT_PUT_THROW':
      if (conditions.side !== 'LEFT' && conditions.side !== 'RIGHT') {
        throw new RangeError('Bilateral tests require side LEFT or RIGHT.');
      }
      break;
    default:
      assertNever(conditions);
  }
  if (conditions.testType !== 'STANDING_BROAD_JUMP') {
    positive(conditions.medicineBallWeight, 'medicineBallWeight');
  }
}

export function arePowerBenchmarksComparable(a: PowerTestConditions, b: PowerTestConditions): boolean {
  validateConditions(a);
  validateConditions(b);
  if (a.testType !== b.testType) return false;
  if (a.testType === 'STANDING_BROAD_JUMP' || b.testType === 'STANDING_BROAD_JUMP') return true;
  return a.side === b.side && a.medicineBallWeight === b.medicineBallWeight;
}

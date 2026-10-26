import type { createRepositories } from '../../data/repositories/index.ts';
import type { Area, Effect, Exercise, ExerciseInput } from '../../data/types.ts';
import { validateExerciseInput } from '../../data/exerciseValidation.ts';
import { ExerciseNotFoundError } from '../../data/repositories/exercise.ts';
import { seedExercises } from '../../data/seed.ts';
import { FeatureError } from '../application/errors.ts';

export const areaLabels: Record<Area, string> = { POWER: 'Power', STRENGTH: 'Strength', CIRCUIT: 'Circuit' };
export const effectLabels: Record<Effect, string> = { UPPER_PUSH: 'Upper Push', UPPER_PULL: 'Upper Pull', LOWER_ANTERIOR: 'Lower Anterior', LOWER_POSTERIOR: 'Lower Posterior', CORE: 'Core', CONDITIONING: 'Conditioning' };
const predefinedIds = new Set(seedExercises.map(exercise => exercise.id));
export function exerciseOrigin(id: string): 'Vordefiniert' | 'Eigene Übung' { return predefinedIds.has(id) ? 'Vordefiniert' : 'Eigene Übung'; }
export interface ExerciseDraft { name: string; areas: Area[]; effects: Effect[]; thumbnailUri: string | null; active: boolean }
export function emptyExercise(): ExerciseDraft { return { name: '', areas: [], effects: [], thumbnailUri: null, active: true }; }
export function exerciseDraft(exercise: Exercise): ExerciseDraft {
  return { name: exercise.name, areas: [...exercise.areas], effects: [...exercise.effects], thumbnailUri: exercise.thumbnail_uri, active: exercise.is_active };
}
export function filterExercises(exercises: readonly Exercise[], query: string, area: Area | null, effect: Effect | null): Exercise[] {
  const search = query.trim().toLocaleLowerCase();
  return exercises.filter(exercise => exercise.name.toLocaleLowerCase().includes(search) && (!area || exercise.areas.includes(area)) && (!effect || exercise.effects.includes(effect)));
}
function input(draft: ExerciseDraft, loadMode: ExerciseInput['load_mode']): ExerciseInput {
  if (typeof draft.active !== 'boolean') throw new RangeError('Ungültiger Aktivstatus.');
  return validateExerciseInput({ name: draft.name, areas: draft.areas, effects: draft.effects, thumbnail_uri: draft.thumbnailUri, load_mode: loadMode });
}
export function createExerciseServices(repositories: ReturnType<typeof createRepositories>) {
  const guarded = async <T,>(task: () => Promise<T>): Promise<T> => {
    try { return await task(); }
    catch (error) {
      if (error instanceof RangeError || error instanceof ExerciseNotFoundError) throw new FeatureError(error.message);
      throw error;
    }
  };
  return {
    library: () => repositories.exercises.list(true),
    get: (id: string) => guarded(() => repositories.exercises.get(id)),
    /** One command per mounted Create form: competing/replayed submits share one result.
     * Failed validation/writes may be retried. A fresh form can intentionally create a duplicate name. */
    createCommand() {
      let saved: Promise<string> | null = null;
      return { submit(draft: ExerciseDraft): Promise<string> {
        if (saved) return saved;
        saved = guarded(async () => repositories.exercises.create(input(draft, 'EXTERNAL_ONLY'))).catch(error => { saved = null; throw error; });
        return saved;
      } };
    },
    update: (id: string, draft: ExerciseDraft) => guarded(async () => {
      const current = await repositories.exercises.get(id);
      await repositories.exercises.update(id, input(draft, current.load_mode), draft.active);
    }),
    setActive: (id: string, active: boolean) => guarded(() => repositories.exercises.setActive(id, active)),
  };
}

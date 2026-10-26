import { FeatureError } from '../application/errors.ts';

export interface PickedExerciseImage { uri: string; mimeType?: string | null; file?: Blob }
export interface ExerciseImagePort {
  pick(): Promise<PickedExerciseImage | null>;
  persist(image: PickedExerciseImage): Promise<string>;
}
/** A cancelled picker preserves the existing draft; only durable file URIs can leave this boundary. */
export async function chooseExerciseImage(port: ExerciseImagePort): Promise<string | null> {
  let image: PickedExerciseImage | null;
  try { image = await port.pick(); }
  catch { throw new FeatureError('Die Bildauswahl ist fehlgeschlagen. Bitte erneut versuchen.'); }
  if (!image) return null;
  try {
    const uri = await port.persist(image);
    if (!uri || /^(blob|data):/i.test(uri)) throw new Error('Image is not persistent.');
    return uri;
  } catch { throw new FeatureError('Die Bilddatei konnte nicht dauerhaft gespeichert werden. Bitte ein anderes Bild wählen oder ohne Bild fortfahren.'); }
}

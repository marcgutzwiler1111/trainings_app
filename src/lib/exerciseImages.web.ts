import * as ImagePicker from 'expo-image-picker';
import { chooseExerciseImage } from '../features/exercises/images';

const prefix = 'exercise-image://';
async function imageDirectory() {
  return (await navigator.storage.getDirectory()).getDirectoryHandle('exercise-images', { create: true });
}
export function pickExerciseImage(): Promise<string | null> {
  // The picker is invoked immediately from the user's gesture, before any storage await.
  return chooseExerciseImage({
    async pick() {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, base64: false, exif: false });
      return result.canceled ? null : result.assets[0];
    },
    async persist(image) {
      try {
        const blob = image.file ?? await (await fetch(image.uri)).blob();
        if (!blob.size || !blob.type.startsWith('image/')) throw new Error('Image file unavailable.');
        const key = crypto.randomUUID();
        const file = await (await imageDirectory()).getFileHandle(key, { create: true });
        const writer = await file.createWritable();
        try { await writer.write(blob); await writer.close(); }
        catch (error) { await writer.abort().catch(() => {}); throw error; }
        return prefix + key;
      } finally {
        if (image.uri.startsWith('blob:')) URL.revokeObjectURL(image.uri);
      }
    },
  });
}
export async function resolveExerciseImage(uri: string): Promise<{ uri: string; release(): void }> {
  if (!uri.startsWith(prefix)) return { uri, release() {} };
  const key = uri.slice(prefix.length);
  if (!/^[a-f0-9-]{36}$/i.test(key)) throw new Error('Invalid image key.');
  const file = await (await imageDirectory()).getFileHandle(key);
  const objectUrl = URL.createObjectURL(await file.getFile());
  return { uri: objectUrl, release: () => URL.revokeObjectURL(objectUrl) };
}

import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { chooseExerciseImage } from '../features/exercises/images';

export function pickExerciseImage(): Promise<string | null> {
  return chooseExerciseImage({
    async pick() {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, base64: false, exif: false });
      return result.canceled ? null : result.assets[0];
    },
    async persist(image) {
      const directory = new Directory(Paths.document, 'exercise-images');
      directory.create({ intermediates: true, idempotent: true });
      const source = new File(image.uri);
      if (!source.exists || source.size === 0) throw new Error('Image file unavailable.');
      const extension = image.uri.split('?')[0].match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? 'jpg';
      let target: File;
      do { target = new File(directory, `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`); } while (target.exists);
      source.copy(target);
      if (!target.exists || target.size === 0) throw new Error('Image copy unavailable.');
      return target.uri;
    },
  });
}
export async function resolveExerciseImage(uri: string): Promise<{ uri: string; release(): void }> {
  return { uri, release() {} };
}

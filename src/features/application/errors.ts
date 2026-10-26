export class FeatureError extends Error {}
export function userMessage(error: unknown): string {
  console.error('Application operation failed', error);
  return error instanceof FeatureError ? error.message : 'Die Daten konnten nicht geladen oder gespeichert werden. Bitte erneut versuchen.';
}

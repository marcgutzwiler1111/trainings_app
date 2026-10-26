import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { userMessage } from '../features/application/services';

/** Focus/retry reloads hide stale state; abandoned loads never overwrite a newer selection. */
export function useFocusedResource<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null; revision: number }>({ data: null, loading: true, error: null, revision: 0 });
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    let current = true;
    setState({ data: null, loading: true, error: null, revision });
    load().then(data => { if (current) setState({ data, loading: false, error: null, revision }); })
      .catch(error => { const message = userMessage(error); if (current) setState({ data: null, loading: false, error: message, revision }); });
    return () => { current = false; };
  }, [load, revision]));
  return { ...state, reload: () => setRevision(n => n + 1) };
}
export function useFeatureAction() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async <T,>(action: () => Promise<T>): Promise<{ result: T } | undefined> => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    try { return { result: await action() }; }
    catch (failure) { setError(userMessage(failure)); return undefined; }
    finally { locked.current = false; setBusy(false); }
  };
  return { busy, error, run };
}

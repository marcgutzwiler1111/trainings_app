import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { extendRestTimer, resetRestTimer, skipRestTimer, tickRestTimer } from '../features/workout/restTimer';

/** No persisted deadline and no background continuation. Progress lives independently in SQLite. */
export function useRestTimer() {
  const [state, setState] = useState(skipRestTimer);
  const lastTick = useRef<number | null>(null); const focused = useRef(false);
  const clear = useCallback(() => { lastTick.current = null; setState(skipRestTimer()); }, []);
  useFocusEffect(useCallback(() => {
    focused.current = true; clear();
    return () => { focused.current = false; clear(); };
  }, [clear]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', status => { if (status !== 'active') clear(); });
    const interval = setInterval(() => {
      if (!focused.current || lastTick.current === null) return;
      const elapsed = Math.max(0, Math.floor((Date.now() - lastTick.current) / 1000));
      if (elapsed) { lastTick.current += elapsed * 1000; setState(current => tickRestTimer(current, elapsed)); }
    }, 250);
    return () => { subscription.remove(); clearInterval(interval); };
  }, [clear]);
  return { state, clear,
    start(seconds: number) { if (focused.current && AppState.currentState === 'active') { lastTick.current = Date.now(); setState(resetRestTimer(seconds)); } },
    extend() { if (focused.current) { lastTick.current = Date.now(); setState(current => extendRestTimer(current)); } },
    skip: clear,
  };
}

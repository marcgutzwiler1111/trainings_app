import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { CircuitCursor } from '../data/circuitSnapshot';
import type { CircuitView } from '../features/workout/circuit';
import { finishCircuitTimer, pauseCircuitTimer, resetCircuitTimer, resumeCircuitTimer, startCircuitTimer, tickCircuitTimer, type CircuitTimerState } from '../features/workout/circuitTimer';
import { userMessage } from '../features/application/errors';

type Frame = { cursor: CircuitCursor; timer: CircuitTimerState };
function same(a: CircuitCursor, b: CircuitCursor) { return a.sectionId === b.sectionId && a.round === b.round && a.station === b.station; }
/** Only a transient countdown and request token; the persisted cursor remains authoritative. */
export function useCircuitTimer(advancePersisted: (cursor: CircuitCursor) => Promise<CircuitView>) {
  const [frame, setFrame] = useState<Frame | null>(null); const current = useRef<Frame | null>(null);
  const [saving, setSaving] = useState(false); const pending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false); const epoch = useRef(0); const lastTick = useRef<number | null>(null);
  const publish = useCallback((next: Frame | null) => { current.current = next; setFrame(next); }, []);
  const clear = useCallback(() => { epoch.current++; lastTick.current = null; publish(null); }, [publish]);
  const next = useCallback(async (cursor: CircuitCursor, duration: number) => {
    if (pending.current || !focused.current || AppState.currentState !== 'active') return;
    pending.current = true; setSaving(true); setError(null); lastTick.current = null;
    const operationEpoch = epoch.current;
    try {
      const result = await advancePersisted(cursor);
      if (operationEpoch !== epoch.current || !focused.current || AppState.currentState !== 'active') return;
      if (result.complete) publish({ cursor, timer: finishCircuitTimer(resetCircuitTimer(duration)) });
      else if (result.cursor) { publish({ cursor: result.cursor, timer: startCircuitTimer(result.stationSeconds) }); lastTick.current = Date.now(); }
    } catch (failure) {
      const message = userMessage(failure);
      if (operationEpoch === epoch.current && focused.current) { publish({ cursor, timer: resetCircuitTimer(duration) }); setError(message); }
    } finally { pending.current = false; setSaving(false); }
  }, [advancePersisted, publish]);
  useFocusEffect(useCallback(() => {
    focused.current = true; clear();
    return () => { focused.current = false; clear(); };
  }, [clear]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') clear(); });
    const interval = setInterval(() => {
      const active = current.current;
      if (!focused.current || pending.current || !active || active.timer.phase !== 'running' || lastTick.current === null || AppState.currentState !== 'active') return;
      const elapsed = Math.max(0, Math.floor((Date.now() - lastTick.current) / 1000));
      if (!elapsed) return;
      lastTick.current += elapsed * 1000;
      const timer = tickCircuitTimer(active.timer, elapsed);
      publish({ ...active, timer });
      if (timer.phase === 'expired') void next(active.cursor, timer.duration);
    }, 200);
    return () => { subscription.remove(); clearInterval(interval); };
  }, [clear, next, publish]);
  return { frame, saving, error, clear, next,
    resume(cursor: CircuitCursor, duration: number) {
      if (pending.current || !focused.current || AppState.currentState !== 'active') return;
      const before = current.current;
      const timer = before && same(before.cursor, cursor) ? resumeCircuitTimer(before.timer) : startCircuitTimer(duration);
      publish({ cursor, timer }); setError(null); lastTick.current = Date.now();
    },
    pause() {
      if (pending.current) { clear(); return; }
      lastTick.current = null;
      if (current.current) publish({ ...current.current, timer: pauseCircuitTimer(current.current.timer) });
    },
  };
}

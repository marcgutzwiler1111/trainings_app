import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { circuitBenchmarkFormat } from '../domain/benchmarks/protocol';
import { resetCircuitTimer, startCircuitTimer, resumeCircuitTimer, pauseCircuitTimer, tickCircuitTimer, type CircuitTimerState } from '../features/workout/circuitTimer';

type Frame = { key: string; timer: CircuitTimerState };
/** Same pure countdown/lifecycle rules as normal Circuit, but expiry waits for persisted reps. */
export function useBenchmarkStationTimer() {
  const [frame, setFrame] = useState<Frame | null>(null);
  const current = useRef<Frame | null>(null); const focused = useRef(false);
  const epoch = useRef(0); const lastTick = useRef<number | null>(null);
  const publish = useCallback((frame: Frame | null) => { current.current = frame; setFrame(frame); }, []);
  const clear = useCallback(() => { epoch.current++; lastTick.current = null; publish(null); }, [publish]);
  useFocusEffect(useCallback(() => {
    focused.current = true; clear();
    return () => { focused.current = false; clear(); };
  }, [clear]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') clear(); });
    const interval = setInterval(() => {
      const frame = current.current;
      if (!focused.current || AppState.currentState !== 'active' || !frame || lastTick.current === null || frame.timer.phase !== 'running') return;
      const elapsed = Math.max(0, Math.floor((Date.now()-lastTick.current)/1000));
      if (!elapsed) return;
      lastTick.current += elapsed*1000;
      const timer = tickCircuitTimer(frame.timer,elapsed); publish({...frame,timer});
      if (timer.phase === 'expired') lastTick.current = null;
    },200);
    return () => { subscription.remove(); clearInterval(interval); };
  }, [clear,publish]);
  return {frame,clear,token:()=>epoch.current,
    resume(key:string,token=epoch.current) {
      if (!focused.current || AppState.currentState !== 'active' || token !== epoch.current) return;
      const before=current.current;
      const timer=before?.key===key?resumeCircuitTimer(before.timer):startCircuitTimer(circuitBenchmarkFormat.stationSeconds);
      publish({key,timer});lastTick.current=timer.phase==='running'?Date.now():null;
    },
    pause() {
      lastTick.current=null;if(current.current)publish({...current.current,timer:pauseCircuitTimer(current.current.timer)});
    },
    initial: resetCircuitTimer(circuitBenchmarkFormat.stationSeconds),
  };
}

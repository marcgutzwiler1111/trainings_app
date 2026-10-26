import { integer } from '../shared/validation.ts';
export interface CircuitPosition { readonly round: number; readonly station: number }
export function validateCircuitLayout(rounds: number, stations: number): number {
  integer(rounds, 'rounds', 1); integer(stations, 'stations', 1);
  return integer(rounds * stations, 'total stations', 1);
}
export function validateCircuitPosition(rounds: number, stations: number, position: CircuitPosition): void {
  validateCircuitLayout(rounds, stations);
  integer(position.round, 'round', 1); integer(position.station, 'station', 1);
  if (position.round > rounds || position.station > stations) throw new RangeError('Circuit position outside snapshot.');
}
/** null means finished; the final position never wraps back to the first round. */
export function nextCircuitPosition(rounds: number, stations: number, position: CircuitPosition): CircuitPosition | null {
  validateCircuitPosition(rounds, stations, position);
  if (position.station < stations) return { round: position.round, station: position.station + 1 };
  return position.round < rounds ? { round: position.round + 1, station: 1 } : null;
}

export function circuitPlan(rounds: number, stations: number, stationSeconds: number) {
  const totalStations = validateCircuitLayout(rounds, stations);
  integer(stationSeconds, 'station duration', 1);
  return { totalStations, durationSeconds: integer(totalStations * stationSeconds, 'planned duration', 1) };
}

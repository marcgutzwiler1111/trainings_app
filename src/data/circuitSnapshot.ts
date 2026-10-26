import type { CircuitSection, CircuitStation } from './types.ts';
import type { CircuitPosition } from '../domain/circuit/progression.ts';
import { circuitPlan, validateCircuitPosition } from '../domain/circuit/progression.ts';
export interface CircuitSnapshot { section: CircuitSection; stations: CircuitStation[] }
export interface CircuitCursor extends CircuitPosition { readonly sectionId: string }
/** Snapshot shape validation shared by repository guards and application read models. */
export function validateCircuitSnapshot(snapshot: CircuitSnapshot): void {
  const { section, stations } = snapshot;
  circuitPlan(section.round_count, stations.length, section.station_duration_seconds);
  if (stations.some((s, i) => s.position !== i + 1)) throw new RangeError('Station positions must be consecutive.');
  if (section.status === 'PLANNED') {
    if (section.started_at !== null || section.current_round !== null || section.current_station_position !== null || section.completed_at !== null) throw new RangeError('Invalid planned Circuit state.');
  } else if (section.status === 'IN_PROGRESS' || section.status === 'COMPLETE') {
    if (!section.started_at || section.current_round === null || section.current_station_position === null) throw new RangeError('Missing Circuit position.');
    validateCircuitPosition(section.round_count, stations.length, { round: section.current_round, station: section.current_station_position });
    if (section.status === 'COMPLETE' && (!section.completed_at || section.current_round !== section.round_count || section.current_station_position !== stations.length)) throw new RangeError('Invalid Circuit completion position.');
    if (section.status === 'IN_PROGRESS' && section.completed_at !== null) throw new RangeError('Invalid Circuit completion timestamp.');
  } else throw new RangeError('Unsupported Circuit section state.');
}

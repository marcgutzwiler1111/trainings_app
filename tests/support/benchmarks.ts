import type { connect } from './sqlite.ts';
import { powerConditions } from '../../src/domain/benchmarks/protocol.ts';

/** Earlier terminal-state fixtures now prepare full required data before COMPLETE. */
export async function completePowerData(c: ReturnType<typeof connect>, id: string) {
  const current = await c.benchmarks.power(id);
  for (const conditions of powerConditions({ rotation: 4, chest: 5, shotPut: 3 })) {
    const testId = current.tests.find(test => test.test_type === conditions.testType && test.side === conditions.side)?.id ?? await c.benchmarks.addPowerTest(id, conditions);
    for (let n=1;n<=3;n++) await c.benchmarks.savePowerAttempt(testId,n,200+n);
  }
}
export async function completeCircuitData(c: ReturnType<typeof connect>, id: string) {
  const current = await c.benchmarks.circuit(id);
  for (let round=1;round<=5;round++) for (let station=1;station<=6;station++) {
    if (!current.results.some(result=>result.round_number===round && result.station_position===station)) await c.benchmarks.saveCircuitResult(id,round,station,10);
  }
}

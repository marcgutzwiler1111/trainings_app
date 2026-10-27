import { Card, Copy } from '../../components/foundation';
import { formatHistoryDate, type HistoryEntry } from './services';
export function SessionHeader({ entry }: { entry: HistoryEntry }) {
  return <Card><Copy heading>{entry.title}</Copy><Copy>{formatHistoryDate(entry.date, true)}</Copy><Copy>{entry.status === 'COMPLETE' ? 'Complete' : 'Incomplete'}</Copy>
    {entry.startedAt && <Copy muted>Gestartet: {formatHistoryDate(entry.startedAt, true)}</Copy>}
    {entry.endedAt && <Copy muted>Beendet: {formatHistoryDate(entry.endedAt, true)}</Copy>}
  </Card>;
}

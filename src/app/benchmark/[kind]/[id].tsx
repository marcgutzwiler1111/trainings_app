import { router, useLocalSearchParams } from 'expo-router';
import { PowerSession } from '../../../features/benchmarks/PowerSession';
import { CircuitSession } from '../../../features/benchmarks/CircuitSession';
import { Button, Notice, Page } from '../../../components/foundation';
export default function BenchmarkSessionScreen() {
  const {kind,id}=useLocalSearchParams<{kind:string;id:string}>();
  if(typeof id==='string'&&id) {
    if(kind==='power')return <PowerSession key={id} id={id}/>;
    if(kind==='circuit')return <CircuitSession key={id} id={id}/>;
  }
  return <Page title="Benchmark"><Notice message="Unbekannte Benchmark-Session."/><Button label="Zurück zu Home" onPress={()=>router.dismissTo('/')}/></Page>;
}

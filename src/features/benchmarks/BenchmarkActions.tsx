import { useState } from 'react';
import { Button, ConfirmDialog } from '../../components/foundation';
export function BenchmarkActions({ready,busy,onFinish}:{ready:boolean;busy:boolean;onFinish(status:'COMPLETE'|'INCOMPLETE'):void}) {
  const [confirm,setConfirm]=useState(false);
  return <>
    <Button label="Benchmark abschließen" disabled={busy||!ready} onPress={()=>onFinish('COMPLETE')}/>
    <Button secondary label="Als unvollständig beenden" disabled={busy} onPress={()=>setConfirm(true)}/>
    <ConfirmDialog visible={confirm} busy={busy} title="Benchmark unvollständig beenden?"
      message="Gespeicherte Ergebnisse bleiben erhalten. Die Fälligkeit und der normale Cycle werden nicht zurückgesetzt."
      confirmLabel="Unvollständig beenden bestätigen" onCancel={()=>setConfirm(false)} onConfirm={()=>{setConfirm(false);onFinish('INCOMPLETE');}}/>
  </>;
}

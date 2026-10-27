import { useState } from 'react';
import { FlatList, Modal, View } from 'react-native';
import { Button, Copy, usePalette } from '../../components/foundation';

/** A bounded, virtualized selector also usable with hundreds of historical sessions. */
export function ProgressSelect<T extends string>({label,value,options,onChange}:{label:string;value:T|null;options:readonly {value:T;label:string}[];onChange:(value:T)=>void}){
  const [open,setOpen]=useState(false);const palette=usePalette();
  return <>
    <Button secondary label={`${label}: ${options.find(row=>row.value===value)?.label??'Bitte wählen'}`} onPress={()=>setOpen(true)}/>
    <Modal visible={open} transparent onRequestClose={()=>setOpen(false)}>
      <View style={{flex:1,backgroundColor:'#0009',padding:20,justifyContent:'center',alignItems:'center'}}>
        <View accessibilityViewIsModal style={{width:'100%',maxWidth:560,maxHeight:'85%',backgroundColor:palette.card,padding:20,borderRadius:12,gap:12}}>
          <Copy heading>{label} wählen</Copy>
          <FlatList data={options} keyExtractor={row=>row.value} initialNumToRender={12} style={{flexGrow:0,flexShrink:1}} ItemSeparatorComponent={()=><View style={{height:8}}/>}
            renderItem={({item})=><Button secondary label={item.label} selected={item.value===value} onPress={()=>{onChange(item.value);setOpen(false);}}/>}/>
          <Button secondary label="Auswahl schließen" onPress={()=>setOpen(false)}/>
        </View>
      </View>
    </Modal>
  </>;
}

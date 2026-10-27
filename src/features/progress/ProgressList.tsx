import type { ReactNode } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button, Copy, Loading, Notice, usePalette } from '../../components/foundation';

export function ProgressList<T extends {id:string}>({ title,resource,rows,header,render,empty }:{title:string;
  resource:{loading:boolean;error:string|null;reload:()=>void;data:unknown};rows:readonly T[];header?:ReactNode;render:(row:T)=>ReactNode;empty:string}) {
  const palette=usePalette();
  return <SafeAreaView edges={['top','bottom']} style={{flex:1,backgroundColor:palette.background}}>
    <FlatList data={rows} keyExtractor={row=>row.id} initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
      style={{flex:1,width:'100%',maxWidth:720,alignSelf:'center'}} contentContainerStyle={{padding:20,paddingBottom:40}}
      ListHeaderComponent={<View style={{gap:18,marginBottom:18}}><Copy heading>{title}</Copy><Button secondary label="Zurück zu Progress" onPress={()=>router.dismissTo('/progress')}/>
        {resource.loading&&<Loading/>}<Notice message={resource.error}/>{resource.error&&<Button label="Erneut laden" onPress={resource.reload}/>}{header}
      </View>}
      ListEmptyComponent={resource.data!==null&&!rows.length?<Copy>{empty}</Copy>:undefined}
      ItemSeparatorComponent={()=><View style={{height:12}}/>} renderItem={({item})=><>{render(item)}</>}/>
  </SafeAreaView>;
}
export function HistoryLink({kind,id}:{kind:'workout'|'power'|'circuit';id:string}){
  return <Button secondary label="Training in History öffnen" onPress={()=>router.push({pathname:'/history/[kind]/[id]',params:{kind,id}})}/>;
}

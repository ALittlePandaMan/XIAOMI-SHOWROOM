import {defaults,interiors,wheels,paints} from './config';
import type {Configuration} from './config';

export const vehicles=[
 {id:'n90-standard',name:'N90 Max',badge:'N90',suffix:'Max',edition:'',roof:false,dimensions:true,display:'电视'},
 {id:'n90',name:'N90 Max 探索版',badge:'N90',suffix:'Max',edition:'探索版',roof:true,dimensions:true,display:'投影仪'},
 {id:'n70',name:'N70 Max',badge:'N70',suffix:'Max',edition:'',roof:false,dimensions:true,display:'电视'},
 {id:'n70-pro',name:'N70 Pro',badge:'N70',suffix:'Pro',edition:'',roof:false,dimensions:true,display:'电视'},
] as const;
export type VehicleId=typeof vehicles[number]['id'];
export const vehicleFor=(id:VehicleId)=>vehicles.find(v=>v.id===id)!;
export const readVehicle=(search:string):VehicleId=>vehicles.find(v=>v.id===new URLSearchParams(search).get('model'))?.id??'n90';
export const isN70=(id:VehicleId)=>vehicleFor(id).badge==='N70';
export const vehicleAssets=(id:VehicleId)=>isN70(id)?'n70':id==='n90'?'n90-explorer':id;
export const vehicleDefaults=(id:VehicleId):Configuration=>({...defaults,...(isN70(id)?{paint:'blue' as const,wheel:2 as const}: {})});
export const vehicleInteriors=(id:VehicleId)=>interiors.filter(i=>id!=='n90'||i.id!=='black');
export const vehicleWheels=(id:VehicleId)=>isN70(id)?[wheels[2],wheels[0]]:wheels;
export const vehiclePaints=(id:VehicleId)=>(isN70(id)?['blue','teal','graphite','black','white']:id==='n90-standard'?['teal','graphite','black','white','khaki','wine']:['teal','blue','graphite','khaki']).map(color=>paints.find(p=>p.id===color)!);
export const supportsBrushedTrim=(paint:Configuration['paint'])=>paint==='teal'||paint==='blue';
export const vehicleDimensions=(id:VehicleId)=>isN70(id)?{length:4960,width:1998,height:1765}:id==='n90-standard'?{length:5285,width:1998,height:1825}:{length:5285,width:1998,height:1925};

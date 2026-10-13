import type {Configuration} from './config';
import {vehicleDefaults,vehicleInteriors,vehiclePaints,vehicleWheels,supportsBrushedTrim} from './vehicles';
import type {VehicleId} from './vehicles';

export type VehicleSelection=Pick<Configuration,'paint'|'wheel'|'trim'|'interior'>;
export type VehicleFeatures=Omit<Configuration,keyof VehicleSelection>;

// Keep existing shared configuration links valid while the pathname selects the page.
export function readSelection(hash:string,vehicle:VehicleId='n90'):VehicleSelection {
 const p=new URLSearchParams(hash.replace(/^#/,''));
 const initial=vehicleDefaults(vehicle);
 const paint=vehiclePaints(vehicle).find(x=>x.id===p.get('paint'))?.id??initial.paint;
 const wheel=vehicleWheels(vehicle).find(x=>String(x.id)===p.get('wheel'))?.id??initial.wheel;
 const interior=vehicleInteriors(vehicle).find(x=>x.id===p.get('interior'))?.id??initial.interior;
 const trim=!supportsBrushedTrim(paint)||p.get('trim')==='body'?'body':'brushed';
 return {paint,wheel,trim,interior};
}

export function selectionHash(selection:VehicleSelection){
 return `#${new URLSearchParams({paint:selection.paint,wheel:String(selection.wheel),trim:selection.trim,interior:selection.interior})}`;
}

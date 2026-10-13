import type {VehicleId} from './vehicles';
// Plain data keeps the navigation independent of the lazily loaded Three scene.
export const interiorSeats=[
 {id:'driver',label:'主驾',eye:[-.10,1.30,.25],target:[-1.35,1.0,0],lens:75},
 {id:'passenger',label:'副驾',eye:[-.10,1.30,-.35],target:[-1.35,1.0,-.03],lens:75},
 {id:'secondRow',label:'第二排',eye:[.95,1.37,0],target:[-.8,1.08,0],lens:80},
 {id:'thirdRow',label:'三排',eye:[1.72,1.39,0],target:[.10,1.12,0],lens:84},
] as const;
export type InteriorSeatId=typeof interiorSeats[number]['id'];
const frontAndRearSeats=interiorSeats.slice(0,3);
const threeRowSeats=[{...interiorSeats[0],label:'一排'},{...interiorSeats[2],label:'二排'},interiorSeats[3]];
export const vehicleInteriorSeats=(vehicle:VehicleId)=>vehicle==='n90-standard'?threeRowSeats:frontAndRearSeats;

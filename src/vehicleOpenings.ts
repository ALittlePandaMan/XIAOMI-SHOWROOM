export const openingLabels={frontLeft:'左前门',frontRight:'右前门',rearLeft:'左后门',rearRight:'右后门',trunk:'后备箱'} as const;
export type OpeningId=keyof typeof openingLabels;
export type OpeningState=Record<OpeningId,boolean>;
export const openingIds=Object.keys(openingLabels) as OpeningId[];
export const closedOpenings=():OpeningState=>({frontLeft:false,frontRight:false,rearLeft:false,rearRight:false,trunk:false});
export type DoorTrackGroup=Exclude<OpeningId,'trunk'>|'boardLeft'|'boardRight';

/** Source object names from the original model; independent of GLB mesh order. */
export function doorTrackGroup(source:string):DoorTrackGroup|undefined{
 if(source.startsWith('电动踏板_左_'))return 'boardLeft';
 if(source.startsWith('电动踏板_右_'))return 'boardRight';
 if(source==='后门固定小窗_左')return 'rearLeft';
 if(source==='后门固定小窗_右')return 'rearRight';
 const match=source.match(/@ME9x1tr5_(\d+)$/);if(!match)return;
 const id=Number(match[1]);
 if(id>=54&&id<=78)return 'frontLeft';
 if(id>=79&&id<=101)return 'frontRight';
 if(id>=102&&id<=118)return 'rearLeft';
 if(id>=119&&id<=135)return 'rearRight';
}

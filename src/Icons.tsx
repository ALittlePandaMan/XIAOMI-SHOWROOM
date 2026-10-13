import type {CSSProperties} from 'react';
import {assetUrl} from './assetUrl';

export type IconName='back'|'roof'|'doors'|'ruler'|'reset'|'expand'|'projector';
// Original showroom SVGs preserve intrinsic padding, line weight and opacity.
// Separate image documents also isolate each SVG's clip and mask IDs.
const assets:Record<Exclude<IconName,'projector'>,readonly [string,string]>={
 back:['arrowback.svg','arrowback.svg'],
 roof:['roofOpen.svg','roofClose.svg'],
 doors:['doorOpen.svg','doorClose.svg'],
 ruler:['noRule.svg','rule.svg'],
 reset:['reset.svg','reset.svg'],
 expand:['fullScreen.svg','closeFullScreen.svg'],
};
export default function Icon({name,active=false,size=name==='back'?26:30,style}:{name:IconName;active?:boolean;size?:number;style?:CSSProperties}){
 if(name==='projector')return <svg className="showroom-icon" width={size} height={size} viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><rect x="6" y="6.5" width="18" height="3" rx="1"/><path d="M8 10v11h14V10M15 21v3M12 24h6"/>{active?<path d="M13 13l5 2.5-5 2.5z" fill="currentColor" stroke="none"/>:<path d="M11.5 15.5h7"/>}</svg>;
 return <img className="showroom-icon" src={assetUrl(`/icons/official/${assets[name][active?1:0]}`)} width={size} height={size} alt="" aria-hidden="true" draggable={false} style={style}/>;
}

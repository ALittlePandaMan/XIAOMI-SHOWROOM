import {MathUtils,Spherical,Vector3} from 'three';

// N90 showroom camera presets calibrated against the reference showroom.
// Convert its effective distance/FOV to this viewer's existing 12.5° lens so the
// car keeps the reference framing without changing mobile FOV/zoom behaviour.
const lensRatio=(fov:number)=>Math.tan(MathUtils.degToRad(fov/2))/Math.tan(MathUtils.degToRad(12.5/2));
export const standardViews=[
 {id:'rear',theta:7.855988151372887,phi:1.5561640940558379,radius:14.5*lensRatio(19.3651)},
 {id:'front',theta:4.710382462986283,phi:1.578632798473644,radius:14.5*lensRatio(19.3651)},
 {id:'side',theta:6.2962342987338555,phi:1.5656363004593,radius:14*lensRatio(22.131542857142858)},
 {id:'rear-quarter',theta:.9083717021608447,phi:1.5625835979469034,radius:16*lensRatio(17.290267857142858)},
 {id:'front-right-quarter',theta:4.394388644540399,phi:1.5760981324446728,radius:16.5*lensRatio(17.290267857142858)},
 {id:'front-left-quarter',theta:-.9799256491002121,phi:1.5754231934611371,radius:16.5*lensRatio(17.290267857142858)},
] as const;

export function shortestAngle(from:number,to:number){return Math.atan2(Math.sin(to-from),Math.cos(to-from));}
export function nearestStandardView(theta:number){
 return standardViews.reduce((best,view)=>Math.abs(shortestAngle(theta,view.theta))<Math.abs(shortestAngle(theta,best.theta))?view:best);
}
export function standardViewPosition(view:typeof standardViews[number],target:Vector3){
 return new Vector3().setFromSpherical(new Spherical(view.radius,view.phi,view.theta)).add(target);
}
export function cubicInOut(t:number){return t<.5?4*t*t*t:1-((-2*t+2)**3)/2;}

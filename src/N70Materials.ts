import * as THREE from 'three';
import {configurePaintLight} from './PaintLighting';
import {excludeCabinFill,studioIntensity} from './StudioLighting';
import type {PaintId} from './config';
import type {TireFinish} from './TireFinish';
import {configureBrownInterior} from './InteriorLighting';
import {configureCabinTextureQuality} from './CabinTextureQuality';
import {configureWindowTrim} from './WindowTrimFinish';
import {configureLowerBodyFinish} from './LowerBodyFinish';
import {configureStandardCabinSurface} from './StandardCabinSurfaces';
import {configureWindowGlass} from './WindowGlassFinish';
import {prepareCabinControls} from './CabinControls';
import {prepareCabinFixtureGeometry} from './CabinFixtureDetails';
import {prepareFrontLowerTrim,prepareTailLampBacking} from './ExteriorDetailMaterials';

/** N70 retains its own atlas layout; N90 mesh indices and UV repairs do not apply. */
export function prepareN70(root:THREE.Group,options:{renderer:THREE.WebGLRenderer;studio:THREE.Texture;paint:THREE.Texture;glass:THREE.Texture;windowTrim:THREE.Texture;paintId:PaintId;tires:TireFinish;inscription?:THREE.Texture;sand:{value:number};black:{value:number}}){
 const paint:THREE.MeshPhysicalMaterial[]=[],fascia:THREE.MeshPhysicalMaterial[]=[],lights:THREE.MeshStandardMaterial[]=[];
 let wordmark:THREE.MeshStandardMaterial|undefined;
 const visited=new Set<THREE.Material>(),anisotropy=options.renderer.capabilities.getMaxAnisotropy();
 const physicals=new Map<THREE.MeshStandardMaterial,THREE.MeshPhysicalMaterial>();
 const seatMaterials=new Map<THREE.MeshStandardMaterial,THREE.MeshStandardMaterial>();
 root.updateMatrixWorld(true);
 prepareFrontLowerTrim(root);
 prepareTailLampBacking(root);
 prepareCabinControls(root);
 prepareCabinFixtureGeometry(root);
 root.traverse(o=>{
  if(!(o instanceof THREE.Mesh))return;
  o.castShadow=true;o.receiveShadow=false;
  let source=o.userData.sourceObject;
  for(let p=o.parent;!source&&p;p=p.parent)source=p.userData.sourceObject;
  o.userData.sourceObject=source;
  const originals=Array.isArray(o.material)?o.material:[o.material];
  const materials=originals.map(original=>{
   if(!(original instanceof THREE.MeshStandardMaterial))return original;
   let m=original;
   // Rear seats share leather with body panels in the exported N90 Max model.
   // Calibrate only the seats to the front-row atlas; keep door/body trim intact.
   if(['mesh_60_33_nr','mesh_60_37_nr'].includes(String(source))&&
    ['leather','quilt','cargo-back','cargo-base'].includes(String(m.userData.cabinSurface))){
    let seat=seatMaterials.get(original);
    if(!seat){seat=original.clone();seat.userData.cabinSeat=true;seatMaterials.set(original,seat);}
    m=seat;
   }
   const name=String(m.userData.sourceMaterial??m.name),kind=m.userData.n70Kind;
   if(!(m instanceof THREE.MeshPhysicalMaterial)){
    let physical=physicals.get(m);
    if(!physical){physical=new THREE.MeshPhysicalMaterial();THREE.MeshStandardMaterial.prototype.copy.call(physical,m);physicals.set(m,physical);}
    m=physical;
   }
   if(String(source).endsWith('_051')||m.userData.frontWordmark){m=m.clone();wordmark=m;}
   if(String(source).endsWith('_015')&&name.includes('后视镜_镜面')){m=m.clone();m.name='N70_内后视镜_清晰镜面';}
   if(kind==='glass'){o.castShadow=false;o.renderOrder=3;m.transparent=true;m.depthWrite=false;m.side=m.userData.lampGlass?THREE.FrontSide:THREE.DoubleSide;}
   if(visited.has(m))return m;visited.add(m);
   m.envMap=options.studio;m.envMapIntensity=studioIntensity;
   for(const value of Object.values(m))if(value instanceof THREE.Texture)value.anisotropy=anisotropy;
   if(m.aoMap)m.aoMapIntensity=.8;
   if(kind==='glass'){
    if(m.userData.lampGlass){
     m.metalness=0;m.roughness=.12;m.opacity=.10;m.envMap=options.studio;m.envMapIntensity=.22;
     if(m instanceof THREE.MeshPhysicalMaterial){m.clearcoat=0;m.specularIntensity=.3;}
    }else configureWindowGlass(m,options.glass,m.userData.glassRole??(m.userData.privacy?'privacy':'front'));
   }
   if(kind==='cabin'){
    if(m.userData.cabinPart&&!name.includes('把手金属'))m.name=`WEB_N70_内饰_${m.userData.cabinPart}`;
    if(m.userData.cabinSurface&&m instanceof THREE.MeshPhysicalMaterial)configureStandardCabinSurface(m,options.sand,options.black);
    else if(m.map)configureBrownInterior(m,options.inscription,options.sand,Number(o.userData.cabinControlParts)>0,options.black);
    else {m.envMapIntensity=.8;if(m.userData.cabinSolid){m.metalness=0;m.roughness=.85;}}
   }
   if(kind==='display'){
    m.color.setRGB(.002,.003,.004);m.emissive.set(0xffffff);m.emissiveIntensity=1.12;m.toneMapped=false;m.envMapIntensity=.25;m.roughness=.08;
    if(m instanceof THREE.MeshPhysicalMaterial){m.specularIntensity=.06;m.clearcoat=.04;}
   }
   if(kind==='paint'&&m instanceof THREE.MeshPhysicalMaterial){paint.push(m);m.envMap=options.paint;configurePaintLight(m,options.paintId);}
   if(kind==='fascia'&&m instanceof THREE.MeshPhysicalMaterial)fascia.push(m);
   if(name.includes('轮胎')&&!m.userData.useOriginalTireMap)options.tires.apply(m,new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).x>0);
   if(name.includes('轮胎')&&m.userData.useOriginalTireMap){m.color.setRGB(.008,.01,.013);m.metalness=0;m.roughness=.85;m.envMapIntensity=.3;if(m instanceof THREE.MeshPhysicalMaterial){m.clearcoat=0;m.specularIntensity=.25;}}
   if(name.includes('轮毂')){m.envMapIntensity=2.5;}
   if(name.includes('亮条')){m.envMap=options.paint;m.envMapIntensity=12;}
   if(name.includes('制动盘_金属')){m.userData.sourceMaterial='制动盘_金属';m.color.setRGB(.3278,.3372,.3564);m.metalness=.11;m.roughness=.48;m.envMapIntensity=1.5;}
   if(name.includes('制动卡钳')){m.color.setScalar(.12);m.metalness=.44;m.roughness=.71;m.envMapIntensity=.6;}
   if(/白色灯带|红色灯带|细红灯带/.test(name)){
    const rear=/红色|细红/.test(name);lights.push(m);m.userData.onIntensity=rear?.55:1.6;
    m.emissive.set(rear?'#ef001b':'#e3f1ff');m.emissiveIntensity=m.userData.onIntensity;
    if(rear){m.userData.sourceMaterial='尾灯_细红灯带';m.color.setRGB(.05,0,.002);m.envMapIntensity=.05;m.metalness=0;m.roughness=.3;m.toneMapped=false;if(m instanceof THREE.MeshPhysicalMaterial){m.specularIntensity=.05;m.clearcoat=0;}}
   }
   const role=m.userData.surfaceRole;
   if(role==='retracted-shade'){m.visible=false;o.castShadow=false;}
   if(role==='grille'){m.color.setRGB(.009,.012,.016);m.metalness=0;m.roughness=.52;m.envMapIntensity=.10;if(m instanceof THREE.MeshPhysicalMaterial){m.specularIntensity=.25;m.clearcoat=0;}}
   if(role==='skid-plate'){m.color.setRGB(.40,.42,.44);m.metalness=.50;m.roughness=.45;m.envMapIntensity=.9;if(m instanceof THREE.MeshPhysicalMaterial){m.clearcoat=0;m.specularIntensity=.45;}}
   if(role==='front-lower-trim'){m.color.setRGB(.012,.014,.016);m.metalness=.12;m.roughness=.42;m.envMapIntensity=.6;if(m instanceof THREE.MeshPhysicalMaterial){m.clearcoat=.08;m.specularIntensity=.4;}}
   if(role==='tail-lamp-backing'){m.color.setRGB(.009,.006,.008);m.emissive.setScalar(0);m.emissiveIntensity=0;m.metalness=.1;m.roughness=.3;m.envMapIntensity=.6;}
   if(role==='hood-base'){m.color.setRGB(.4,.415,.43);m.metalness=.7;m.roughness=.32;m.envMapIntensity=1.8;}
   if(role==='hood-glyph'){m.color.setRGB(.022,.025,.032);m.metalness=.15;m.roughness=.38;m.envMapIntensity=.4;}
   if(role==='rear-wordmark'){m.color.setRGB(.52,.54,.56);m.metalness=.55;m.roughness=.34;m.envMapIntensity=1.8;}
   if(role==='lower-body'){m.userData.sourceMaterial='车身下包围_原厂亮黑';configureLowerBodyFinish(m,options.studio);}
   const seatLighting=m.userData.cabinSeat===true||([19,10027].includes(Number(m.userData.n90Atlas))&&/座椅|坐垫/.test(m.name));
   excludeCabinFill(m,seatLighting?'seat':kind==='cabin'||kind==='display'?'cabin':kind==='paint'?'exterior':'none');
   m.customProgramCacheKey=()=>`${m.name}:${role??''}:${m.userData.glassRole??''}:${m.userData.cabinSurface??''}:${m.userData.cabinZone??''}:${m.userData.cabinAtlas??''}:${m.userData.cabinSeat?'seat':''}:shared-glazing-cabin-v13`;
   if(role==='window-trim')configureWindowTrim(m,options.windowTrim);
   if(kind==='cabin'||kind==='display')configureCabinTextureQuality(m,options.renderer);
   return m;
  });
  o.material=Array.isArray(o.material)?materials:materials[0];
 });
 return {paint,fascia,lights,wordmark};
}

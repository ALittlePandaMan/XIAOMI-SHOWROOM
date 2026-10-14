import * as THREE from 'three';
import {assetUrl} from './assetUrl';
import {FrameScheduler} from './FrameScheduler';
import {PerformanceMonitor} from './PerformanceMonitor';
import {MainSceneBatch,SOURCE_LAYER} from './MainSceneBatch';
import {SeatSamplingCache} from './SeatSamplingCache';
import {renderSettings,setRenderSettings,trackRenderMaterial} from './RenderSettings';
import {compareImages} from './ImageComparison';
import type {ImageRegion} from './ImageComparison';
import {calibrateBatching,calibrationCameras,chooseBatching} from './BatchCalibration';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {ElasticZoom} from './ElasticZoom';
import {InteriorLook,cabinEye,cabinLens,cabinRotation,doorApproach,doorPath,doorRotation,responsiveLens,seatCamera,cabinPath} from './InteriorCamera';
import type {ViewMode} from './InteriorCamera';
import type {InteriorSeatId} from './InteriorSeats';
import {WheelMotion} from './WheelMotion';
import {cubicInOut,nearestStandardView,shortestAngle,standardViewPosition} from './StandardViews';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {ContactShadows} from './ContactShadows';
import {createDimensionMarkers,labelsForDimensions} from './DimensionMarkers';
import {MirrorReflections} from './MirrorReflections';
import {GroundReflection} from './GroundReflection';
import {LampGlow} from './LampGlow';
import {CabinProjector,projectorSources} from './CabinProjector';
import {createStudioEnvironment,createPaintEnvironment,excludeCabinFill,studioIntensity} from './StudioLighting';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {addSeatSoftboxes} from './SeatLighting';
import {createStudioDome,loadStudioRadiance} from './StudioDome';
import {configurePaintLight} from './PaintLighting';
import {configureBrownInterior} from './InteriorLighting';
import {CabinFinishes} from './CabinFinishes';
import {N70CabinFinishes} from './N70CabinFinishes';
import {CabinTelevision} from './CabinTelevision';
import {prepareN70} from './N70Materials';
import {vehicleFor,vehicleAssets,isN70,vehicleDimensions,vehicleWheels} from './vehicles';
import wheelFitments from './data/wheel-fitments.json';
import type {VehicleId} from './vehicles';
import {refineCabinNormals} from './CabinNormals';
import {prepareCabinControls} from './CabinControls';
import {CabinHatch} from './CabinHatch';
import {repairCabinCeilingTrim} from './CabinCeilingTrim';
import {configureCabinTextureQuality,isCabinMaterial} from './CabinTextureQuality';
import {TireFinish} from './TireFinish';
import {configureWheelFinish} from './WheelFinish';
import {configureWindowTrim} from './WindowTrimFinish';
import {configureLowerBodyFinish} from './LowerBodyFinish';
import {configureWindowGlass} from './WindowGlassFinish';
import type {Configuration,WheelId} from './config';
import {closedOpenings,doorTrackGroup,openingIds} from './vehicleOpenings';
import {freezeLocalTransforms} from './StaticTransforms';
import type {OpeningId,OpeningState,DoorTrackGroup} from './vehicleOpenings';

type CabinFeature='roof'|'projector';
type ModelAction=OpeningId|CabinFeature;
interface Callbacks {onProgress:(value:number)=>void;onWheelBusy:(busy:boolean)=>void;onOpeningsChange:(state:OpeningState)=>void;onViewChange:(view:ViewMode,transitioning:boolean)=>void;onInteriorSeatChange:(seat:InteriorSeatId,transitioning:boolean)=>void;onCabinFeatureChange:(feature:CabinFeature,open:boolean)=>void}
interface ExteriorSnapshot {position:THREE.Vector3;target:THREE.Vector3;rotation:THREE.Quaternion;lens:number;doorOpen:boolean}
interface ViewJourney {destination:ViewMode;started:number;from:THREE.Quaternion;fromLens:number;returnPath:THREE.CatmullRomCurve3;returnDuration:number;exterior:ExteriorSnapshot}
interface SeatJourney {started:number;duration:number;path:THREE.CatmullRomCurve3;from:THREE.Quaternion;fromLens:number;to:NonNullable<ReturnType<typeof seatCamera>>}
type Pose=number[];
interface Manifest {parts:Record<string,{source:string;materials:string[];opening?:OpeningId}>;tracks:Record<'doors'|'trunk'|'roof',Record<string,Pose[]>>;roofMorphs:string[];television?:{part:string;poses:Pose[];focus:number[]}}
interface Track {object:THREE.Object3D;poses:Pose[]}
interface CameraTween {from:THREE.Spherical;to:THREE.Spherical;targetFrom:THREE.Vector3;targetTo:THREE.Vector3;time:number;duration:number;started:number}
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const TEMP_Q=new THREE.Quaternion(),TEMP_P=new THREE.Vector3(),TEMP_S=new THREE.Vector3();
const ROOF_LIFT_SECONDS=2.3,COVER_LIFT_SECONDS=1.1,ROOF_SEQUENCE_SECONDS=ROOF_LIFT_SECONDS+COVER_LIFT_SECONDS;
// A real task boundary lets resize/layout/paint run between GPU loading stages.
const yieldDuringLoad=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
// Official public BodyPaintColor camera: 12.5° lens, target height 0.733 m.
const HOME=new THREE.Vector3(-19.016,.627,12.757),TARGET=new THREE.Vector3(0,.733,0);
// Match the measured dimension-view elevation and apparent size using our lens.
const DIMENSIONS_VIEW=new THREE.Vector3(-13.48839494,3.17197605,14.89201792).sub(TARGET)
 .multiplyScalar(Math.tan(THREE.MathUtils.degToRad(17.290267857/2))/Math.tan(THREE.MathUtils.degToRad(12.5/2))).add(TARGET);

export class Showroom {
 private renderer:THREE.WebGLRenderer;
 private scheduler:FrameScheduler;
 private monitor:PerformanceMonitor;
 private displayBatch=new MainSceneBatch();
 private seatSampling:SeatSamplingCache;
 private reference:boolean;
 private profiling:boolean;
 private pausedAt:number|null=null;
 private contextUnavailable=false;
 private benchmark?:{started:number;phase:number;position:THREE.Vector3;rotation:THREE.Quaternion;target:THREE.Vector3;lens:number;openings:OpeningState;frames:number};
 private benchmarkResult?:Record<string,unknown>;
 private comparing=false;
 private comparison?:{ssim:number;passed:boolean;regions:{name:string;ssim:number}[];maxChannelDifference:number;width:number;height:number;modeAfterTest:string;attempts:{path:string;ssim:number;regions:{name:string;ssim:number}[]}[]};
 private comparedImages?:{reference:string;optimized:string};
 private batchRejected=false;
 private cacheRejected=false;
 private batchCalibration={exterior:chooseBatching(null,null,null,null),interior:chooseBatching(null,null,null,null)};
 private scene=new THREE.Scene();
 private vehicleRoot=new THREE.Group();
 private mirrors:MirrorReflections;
 private reflectionDirty=true;
 private camera=new THREE.PerspectiveCamera(12.5,1,.2,150);
 private controls:OrbitControls;
 private zoom:ElasticZoom;
 private interiorLook:InteriorLook;
 private view:ViewMode='exterior';
 private viewJourney?:ViewJourney;
 private interiorSeat:InteriorSeatId='driver';
 private seatJourney?:SeatJourney;
 private exteriorSnapshot?:ExteriorSnapshot;
 private lens=12.5;
 private loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 private car?:THREE.Group;
 private activeWheels?:THREE.Group;
 private wheelCache=new Map<WheelId,Promise<THREE.Group>>();
 private readyWheels=new Map<WheelId,THREE.Group>();
 private wheelMotion=new WheelMotion();
 private ready=false;
 private idleAt=Infinity;
 private get idleDeadline(){return this.idleAt;}
 private set idleDeadline(value:number){this.idleAt=value;this.scheduler?.wakeAt(value);}
 private settledView?:string;
 private tireFinish=new TireFinish();
 private cabinFinishes=new CabinFinishes();
 private n70CabinFinishes=new N70CabinFinishes();
 private get modelBase(){return assetUrl(`/models/${vehicleAssets(this.vehicle)}`)}
 private tracks:Record<'doors'|'trunk'|'roof',Track[]>={doors:[],trunk:[],roof:[]};
 private openingTracks:Record<OpeningId|'boardLeft'|'boardRight',Track[]>={frontLeft:[],frontRight:[],rearLeft:[],rearRight:[],trunk:[],boardLeft:[],boardRight:[]};
 private openingTargets=closedOpenings();
 private openingProgress:Record<OpeningId,number>={frontLeft:0,frontRight:0,rearLeft:0,rearRight:0,trunk:0};
 private boardProgress={boardLeft:0,boardRight:0};
 private clickable=new WeakMap<THREE.Object3D,ModelAction>();
 private roofClickable=new WeakSet<THREE.Object3D>();
 private projector?:CabinProjector|CabinTelevision;
 private cabinHatch?:CabinHatch;
 private steeringInscription?:THREE.Texture;
 private pickMeshes:THREE.Mesh[]=[];
 private raycaster=new THREE.Raycaster();
 private pointerPosition=new THREE.Vector2();
 private gesture?:{id:number;x:number;y:number;time:number;threshold:number};
 private roofMeshes:THREE.Mesh[]=[];
 private paintMaterials:THREE.MeshPhysicalMaterial[]=[];
 private fascia:THREE.MeshPhysicalMaterial[]=[];
 private fasciaBindings:{mesh:THREE.Mesh;index:number;body:THREE.MeshPhysicalMaterial;brushed:THREE.MeshPhysicalMaterial}[]=[];
 private frontWordmark?:THREE.MeshStandardMaterial;
 private lights:THREE.MeshStandardMaterial[]=[];
 private config?:Configuration;
 private current={doors:0,roof:0,projector:0};
 private roofSequence=0;
 private dirtyState=true;
 private get dirty(){return this.dirtyState;}
 private set dirty(value:boolean){this.dirtyState=value;if(value)this.scheduler?.wake();}
 private disposed=false;
 private lastTime=0;
 private size:ResizeObserver;
 private environmentTarget?:THREE.WebGLRenderTarget;
 private environmentSource?:THREE.DataTexture;
 private paintEnvironmentTarget?:THREE.WebGLRenderTarget;
 private glassEnvironmentTarget?:THREE.WebGLRenderTarget;
 private wheelEnvironmentTarget?:THREE.WebGLRenderTarget;
 private wheelCoverEnvironmentTarget?:THREE.WebGLRenderTarget;
 private windowTrimEnvironmentTarget?:THREE.WebGLRenderTarget;
 private cameraTween?:CameraTween;
 private measurements=new THREE.Group();
 private labels:{element:HTMLDivElement;point:THREE.Vector3}[]=[];
 private lastPaint?:string;
 private pointers=new Set<number>();
 private contact=new ContactShadows();
 private contactDirty=true;
 private groundReflection?:GroundReflection;
 private lampGlow=new LampGlow();
 private renderedFrames=0;

 constructor(private host:HTMLDivElement,private callbacks:Callbacks,readonly vehicle:VehicleId='n90'){
  const params=new URLSearchParams(location.search);this.profiling=import.meta.env.DEV&&params.get('perf')==='1';this.reference=this.profiling&&params.get('reference')==='1';
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
  this.scheduler=new FrameScheduler(this.tick);this.monitor=new PerformanceMonitor(this.renderer,this.profiling);
  this.seatSampling=new SeatSamplingCache(this.renderer,this.invalidate,this.vehicle==='n90-standard'?'N90 Max rear-seat visual check failed; retaining original sampling':undefined);
  setRenderSettings(this.renderer,{reference:this.reference,areaLights:[],staticLights:false});
  this.raycaster.layers.enable(SOURCE_LAYER);
  this.mirrors=new MirrorReflections(this.renderer);
  this.renderer.setPixelRatio(Math.max(devicePixelRatio,2));this.renderer.setClearColor('#acb9c4');
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.0;
  this.renderer.info.autoReset=false;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.VSMShadowMap;this.renderer.shadowMap.autoUpdate=false;
  this.renderer.domElement.setAttribute('aria-label',`可旋转的 ${vehicleFor(this.vehicle).name} 三维模型`);this.host.appendChild(this.renderer.domElement);
  this.renderer.domElement.tabIndex=0;
  this.camera.position.copy(HOME);
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.copy(TARGET);this.controls.enableDamping=true;this.controls.dampingFactor=.075;this.controls.enablePan=false;
  this.controls.minDistance=8;this.controls.maxDistance=30;this.controls.minPolarAngle=.20;this.controls.maxPolarAngle=1.58;this.controls.rotateSpeed=.6;this.controls.zoomSpeed=.75;this.controls.autoRotateSpeed=.65;
  this.controls.addEventListener('change',this.invalidate);this.controls.addEventListener('start',this.beginInteraction);
  this.zoom=new ElasticZoom(this.camera,this.controls,this.renderer.domElement,reducedMotion,()=>{this.beginInteraction();this.armIdle(1600);this.gesture=undefined;this.dirty=true});
  this.interiorLook=new InteriorLook(this.camera,this.renderer.domElement,reducedMotion,this.invalidate);
  this.renderer.domElement.addEventListener('pointerdown',this.pointerDown);this.renderer.domElement.addEventListener('pointerup',this.pointerUp);
  this.renderer.domElement.addEventListener('pointermove',this.pointerMove);this.renderer.domElement.addEventListener('pointercancel',this.pointerCancel);
  this.renderer.domElement.addEventListener('lostpointercapture',this.pointerCancel);window.addEventListener('blur',this.clearInteraction);
  this.setupStudio();if(vehicleFor(this.vehicle).dimensions)this.setupMeasurements();
  this.scene.add(this.vehicleRoot);
  this.size=new ResizeObserver(this.resize);this.size.observe(this.host);this.resize();
  document.addEventListener('visibilitychange',this.visibilityChanged);
  this.renderer.domElement.addEventListener('webglcontextlost',this.contextLost);
  this.renderer.domElement.addEventListener('webglcontextrestored',this.contextRestored);
  this.scheduler.wake();
 }
 private invalidate=()=>{this.dirty=true};
 private cancelTween=()=>{this.cameraTween=undefined};
 private beginInteraction=()=>{if(this.benchmark)this.stopBenchmark();this.cancelTween();this.idleDeadline=Infinity};
 private armIdle(delay=1500){this.idleDeadline=this.ready&&this.view==='exterior'&&!this.viewJourney&&!this.config?.autoRotate&&!this.config?.roof&&!this.config?.dimensions?performance.now()+delay:Infinity;}
 private clearInteraction=()=>{this.pointers.clear();this.gesture=undefined;this.idleDeadline=Infinity;};
 private visibilityChanged=()=>{
  this.clearInteraction();
  if(document.hidden)this.suspendRendering();else{this.resumeRendering();this.armIdle();}
 };
 private suspendRendering(){if(this.pausedAt===null)this.pausedAt=performance.now();this.scheduler.pause();this.monitor.endFrame(false);}
 private resumeRendering(){
   if(document.hidden||this.contextUnavailable||this.disposed)return;
   const now=performance.now(),paused=this.pausedAt===null?0:now-this.pausedAt;this.pausedAt=null;
   if(this.cameraTween)this.cameraTween.started+=paused;if(this.viewJourney)this.viewJourney.started+=paused;if(this.seatJourney)this.seatJourney.started+=paused;this.wheelMotion.pauseFor(paused);
   if(this.benchmark)this.benchmark.started+=paused;
   this.lastTime=now;this.scheduler.resume();this.scheduler.wakeAt(this.idleDeadline);this.dirty=true;
 }
 private pointerDown=(e:PointerEvent)=>{
  if(this.viewJourney||this.seatJourney||!this.ready)return;
  this.beginInteraction();
  this.pointers.add(e.pointerId);
  this.gesture=this.pointers.size===1&&e.button===0?{id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),threshold:e.pointerType==='touch'?10:6}:undefined;
 };
 private pointerMove=(e:PointerEvent)=>{
  const g=this.gesture;
  if(g&&e.pointerId===g.id&&Math.hypot(e.clientX-g.x,e.clientY-g.y)>g.threshold)this.gesture=undefined;
 };
 private pointerUp=(e:PointerEvent)=>{
  const g=this.gesture;this.gesture=undefined;this.pointers.delete(e.pointerId);
  if(!this.pointers.size)this.armIdle();
  if(g&&g.id===e.pointerId&&!this.pointers.size&&performance.now()-g.time<700&&Math.hypot(e.clientX-g.x,e.clientY-g.y)<=g.threshold){
   const bounds=this.renderer.domElement.getBoundingClientRect();
   if(e.clientX>=bounds.left&&e.clientX<=bounds.right&&e.clientY>=bounds.top&&e.clientY<=bounds.bottom){const id=this.pickAction(e.clientX,e.clientY);if(id==='roof'||id==='projector')this.toggleCabinFeature(id);else if(id)this.toggleOpening(id);}
  }
 };
 private pointerCancel=(e:PointerEvent)=>{const wasHeld=this.pointers.delete(e.pointerId);this.gesture=undefined;if(wasHeld&&!this.pointers.size)this.armIdle();};
 private pickAction(x:number,y:number):ModelAction|undefined{
  if(!this.car||this.viewJourney||this.seatJourney)return;
  const bounds=this.renderer.domElement.getBoundingClientRect();
  this.pointerPosition.set((x-bounds.left)/bounds.width*2-1,-(y-bounds.top)/bounds.height*2+1);
  this.vehicleRoot.updateMatrixWorld(true);this.camera.updateMatrixWorld();this.raycaster.setFromCamera(this.pointerPosition,this.camera);
  const visible=this.pickMeshes.filter(o=>{for(let p:THREE.Object3D|null=o;p;p=p.parent){if(!p.visible)return false;if(p===this.vehicleRoot)return true;}return false});
  // The nearest opaque or glass surface occludes doors behind it. Never pick through the body.
  const hit=this.raycaster.intersectObjects(visible,false)[0];
  if(!hit)return;
  for(let o:THREE.Object3D|null=hit.object;o;o=o.parent){
   const id=this.clickable.get(o);if(id)return(id==='roof'||id==='projector')&&this.view!=='interior'?undefined:id;
   if(this.view==='interior'&&this.roofClickable.has(o)){
    const p=this.vehicleRoot.worldToLocal(hit.point.clone());
    // Only the central ceiling/hatch, not the mirror, visors or pillars sharing its mesh.
    if(p.y>1.60&&p.x>.55&&p.x<1.85&&Math.abs(p.z)<.62)return'roof';
   }
  }
 }
 toggleCabinFeature(feature:CabinFeature){
  if(!this.config||!this.ready||this.viewJourney||this.seatJourney)return;
  if(feature==='projector'&&!this.config.projector&&this.projectorBlocked)return;
  const open=!this.config[feature];void this.configure({...this.config,[feature]:open});this.callbacks.onCabinFeatureChange(feature,open);
 }
 private get projectorBlocked(){return !!this.config?.roof||this.current.roof>0||this.cabinHatch?.allowsProjector===false}
 get roofSettled(){return this.roofSequence===(this.config?.roof?ROOF_SEQUENCE_SECONDS:0)}
 private focusProjector(){if(this.view==='interior'&&(this.interiorSeat==='secondRow'||this.interiorSeat==='thirdRow')&&this.projector)this.interiorLook.focus(this.projector.getFocusPoint());}
 private closeProjectorForTravel(){
  if(!this.config?.projector)return;
  this.config={...this.config,projector:false};
  this.callbacks.onCabinFeatureChange('projector',false);
  this.dirty=true;this.reflectionDirty=true;
 }
 toggleOpening(id:OpeningId){
  if(!this.car||!this.openingTracks[id].length)return;
  this.openingTargets[id]=!this.openingTargets[id];
  if(this.view==='interior'&&!this.viewJourney&&id==='frontLeft'&&this.exteriorSnapshot)this.exteriorSnapshot.doorOpen=this.openingTargets[id];
  this.publishOpenings();
 }
 private publishOpenings(){
  if(this.config)this.config={...this.config,doors:openingIds.some(id=>this.openingTargets[id])};
  this.reflectionDirty=true;this.dirty=true;this.callbacks.onOpeningsChange({...this.openingTargets});
 }
 private get openingsSettled(){return openingIds.every(id=>this.openingProgress[id]===Number(this.openingTargets[id]))}
 private contextLost=(e:Event)=>{e.preventDefault();this.contextUnavailable=true;this.suspendRendering();};
 private contextRestored=()=>{void this.restoreContext().catch(error=>{console.warn('WebGL restore preparation failed; a fresh frame will retry.',error);this.contextUnavailable=false;this.resumeRendering();});};
 private async restoreContext(){
  this.monitor.contextRestored();await this.seatSampling.contextRestored();if(this.disposed)return;
  this.mirrors.contextRestored();this.scene.updateMatrixWorld();await this.mirrors.warm(this.scene,this.camera);await this.renderer.compileAsync(this.scene,this.camera);if(this.disposed)return;
  this.groundReflection?.invalidate();this.lampGlow.invalidate();this.reflectionDirty=true;this.contactDirty=true;this.renderer.shadowMap.needsUpdate=true;this.contextUnavailable=false;this.resumeRendering();
 }
 private resize=()=>{
  if(this.disposed)return;
  const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);
  // Quality first: at least 2× supersampling, preserving native high-DPI
  // resolution. Only the actual WebGL drawing-buffer limit may reduce this.
  const limit=this.renderer.getContext().getParameter(this.renderer.getContext().MAX_RENDERBUFFER_SIZE) as number;
  const ratio=Math.min(Math.max(devicePixelRatio,2),limit/Math.max(w,h));
  if(this.renderer.getPixelRatio()!==ratio)this.renderer.setPixelRatio(ratio);
  // CSS tracks the viewport immediately; update only the drawing buffer here.
  this.renderer.setSize(w,h,false);this.camera.aspect=w/h;
  this.lampGlow.resize(w,h);
  // Preserve a 13.5-degree horizontal field on narrow screens. The previous
  // 20-degree field made the car about a third too small. Blend continuously
  // into the desktop lens so orientation changes do not jump at aspect=1.
  this.updateLens();this.dirty=true;
 };
 private updateLens(){this.camera.fov=responsiveLens(this.lens,this.camera.aspect);this.camera.updateProjectionMatrix();}
 private setupStudio(){
  this.scene.background=new THREE.Color('#526d91');this.scene.add(createStudioDome());this.scene.fog=new THREE.Fog('#c8cbcd',28,90);
  // Temporary maps are never shown: full-resolution HDR files replace them
  // before the first vehicle frame. Avoid generating millions of unused pixels.
  this.environmentSource=createStudioEnvironment(undefined,64);
  const pmrem=new THREE.PMREMGenerator(this.renderer);this.environmentTarget=pmrem.fromEquirectangular(this.environmentSource);this.scene.environment=this.environmentTarget.texture;this.scene.environmentIntensity=studioIntensity;
  // Tune the body reflection shape without changing cabin illumination or floor brightness.
  const paintEnvironment=createPaintEnvironment(64);this.paintEnvironmentTarget=pmrem.fromEquirectangular(paintEnvironment);paintEnvironment.dispose();pmrem.dispose();
  this.scene.add(new THREE.HemisphereLight('#fffaf3','#30393e',.22));
  this.scene.add(new THREE.AmbientLight(0xffffff,2.4));
  RectAreaLightUniformsLib.init();
  if(this.vehicle==='n90-standard')addSeatSoftboxes(this.scene);
  const cabinTop=new THREE.RectAreaLight('#fff8ee',1.0,1.6,.9);cabinTop.name='Cabin front ceiling fill';cabinTop.position.set(-.4,1.55,0);cabinTop.lookAt(-.6,.55,0);this.scene.add(cabinTop);
  const rearTop=new THREE.RectAreaLight('#fff8ee',.55,1.6,1.2);rearTop.name='Cabin rear ceiling fill';rearTop.position.set(1.0,1.65,0);rearTop.lookAt(1.0,.6,0);this.scene.add(rearTop);
  for(const side of [-1,1]){
   const windowFill=new THREE.RectAreaLight('#fffaf4',.70,1.4,.5);windowFill.name=`Cabin front window fill ${side}`;windowFill.position.set(-.7,1.25,side*.92);windowFill.lookAt(-.6,1.0,0);this.scene.add(windowFill);
   const rearFill=new THREE.RectAreaLight('#fffaf4',.40,1.5,.6);rearFill.name=`Cabin rear window fill ${side}`;rearFill.position.set(.8,1.30,side*.92);rearFill.lookAt(.8,.9,0);this.scene.add(rearFill);
  }
  const key=new THREE.DirectionalLight('#f9fbff',.018);key.position.set(-3,8,5);this.scene.add(key);
  const fill=new THREE.DirectionalLight('#d9e7f5',.015);fill.position.set(4,4,-5);this.scene.add(fill);
  const tile=document.createElement('canvas');tile.width=tile.height=512;const t=tile.getContext('2d')!;t.fillStyle='#92999e';t.fillRect(0,0,512,512);t.strokeStyle='#78858e';t.lineWidth=1.5;
  for(let x=0;x<512;x+=32){t.beginPath();t.moveTo(x,0);t.lineTo(x,512);t.stroke()}t.strokeStyle='#747e85';for(let y=0;y<512;y+=128){t.beginPath();t.moveTo(0,y);t.lineTo(512,y);t.stroke()}
  const floorTex=new THREE.CanvasTexture(tile);floorTex.colorSpace=THREE.SRGBColorSpace;floorTex.wrapS=floorTex.wrapT=THREE.RepeatWrapping;floorTex.repeat.set(160,160);floorTex.anisotropy=Math.min(16,this.renderer.capabilities.getMaxAnisotropy());
  const floorMaterial=new THREE.MeshStandardMaterial({map:floorTex,roughness:.87,metalness:.03,color:'#aab4ba',envMap:this.scene.environment,envMapIntensity:1.25});excludeCabinFill(floorMaterial);
  const floorCompile=floorMaterial.onBeforeCompile;
  floorMaterial.onBeforeCompile=(shader,renderer)=>{floorCompile.call(floorMaterial,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('getAmbientLightIrradiance( ambientLightColor )','vec3(0.0)');};
  floorMaterial.customProgramCacheKey=()=> 'floor-independent-ambient';
  const floor=new THREE.Mesh(new THREE.CircleGeometry(64.8,128),floorMaterial);floor.name='Studio floor';floor.rotation.set(-Math.PI/2,0,-.98);floor.position.y=-.006;floor.receiveShadow=true;this.scene.add(floor);
  this.scene.add(this.contact.plane);
  this.groundReflection=new GroundReflection(this.vehicleRoot,this.camera);this.scene.add(this.groundReflection.mesh);
  const areaLights:THREE.RectAreaLight[]=[];this.scene.traverse(o=>{if(o instanceof THREE.RectAreaLight)areaLights.push(o);});
  setRenderSettings(this.renderer,{reference:this.reference,areaLights,staticLights:false});
 }
 private setupMeasurements(){
  const dimensions=vehicleDimensions(this.vehicle);
  this.measurements.add(createDimensionMarkers(dimensions));
  for(const l of labelsForDimensions(dimensions)){
   const label=document.createElement('div');label.className='dimension-label';label.textContent=l.label;label.hidden=true;this.host.appendChild(label);this.labels.push({element:label,point:new THREE.Vector3(...l.point)});
  }
  this.measurements.visible=false;this.scene.add(this.measurements);
 }
 async load(config:Configuration){
  this.config={...config};
  const cabinFinishesPromise=isN70(this.vehicle)?this.n70CabinFinishes.load():this.cabinFinishes.load(this.vehicle==='n90-standard');
  const environmentsPromise=Promise.all((['studio','paint','glass','wheel','wheel-glass','window-trim'] as const).map(loadStudioRadiance));
  const manifestPromise=fetch(`${this.modelBase}/manifest.json`).then(r=>{if(!r.ok)throw new Error('模型索引加载失败');return r.json() as Promise<Manifest>});
  const carPromise=this.loader.loadAsync(`${this.modelBase}/car.glb`,e=>{if(!this.disposed)this.callbacks.onProgress(e.total?Math.min(88,e.loaded/e.total*88):20)});
  const projectorPromise=this.vehicle==='n90'?this.loader.loadAsync(`${this.modelBase}/projector.glb`):Promise.resolve(undefined);
  const inscriptionPromise=new THREE.TextureLoader().loadAsync(assetUrl('/textures/cabin/steering-wordmark.svg'));
  const tireMaps=this.tireFinish.load(Math.min(16,this.renderer.capabilities.getMaxAnisotropy()));
  const availableWheels=vehicleWheels(this.vehicle);
  const wheelsPromise=Promise.all(availableWheels.map(({id})=>this.loadWheel(id,tireMaps)));
  const [gltf,manifest,wheels,environments,projectorGltf,inscription]=await Promise.all([carPromise,manifestPromise,wheelsPromise,environmentsPromise,projectorPromise,inscriptionPromise,cabinFinishesPromise]);
  if(this.disposed){this.disposeTree(gltf.scene);if(projectorGltf)this.disposeTree(projectorGltf.scene);environments.forEach(t=>t.dispose());inscription?.dispose();return}
  if(inscription){this.steeringInscription=inscription;inscription.flipY=false;inscription.anisotropy=this.renderer.capabilities.getMaxAnisotropy();}
  const wheel=wheels[availableWheels.findIndex(w=>w.id===config.wheel)];
  const pmrem=new THREE.PMREMGenerator(this.renderer),[studio,paint,glass,wheelEnv,wheelCoverEnv,windowTrimEnv]=environments;
  const oldEnv=this.environmentTarget,oldPaint=this.paintEnvironmentTarget,oldSource=this.environmentSource;
  this.environmentSource=studio;
  try{
   const slots=['environmentTarget','paintEnvironmentTarget','glassEnvironmentTarget','wheelEnvironmentTarget','wheelCoverEnvironmentTarget','windowTrimEnvironmentTarget'] as const;
   for(let i=0;i<slots.length;i++){
   await yieldDuringLoad();if(this.disposed){this.disposeTree(gltf.scene);if(projectorGltf)this.disposeTree(projectorGltf.scene);return;}
    this[slots[i]]=pmrem.fromEquirectangular(environments[i]);this.callbacks.onProgress(88+(i+1)*.5);
   }
  }finally{
   paint.dispose();glass.dispose();wheelEnv.dispose();wheelCoverEnv.dispose();windowTrimEnv.dispose();pmrem.dispose();
   oldEnv?.dispose();oldPaint?.dispose();oldSource?.dispose();
  }
  this.scene.environment=this.environmentTarget!.texture;
  // Wheels may finish preparing before the environment arrives. Rebind them once here.
  for(const root of [this.scene,...wheels])root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial){if(m.envMap===oldEnv?.texture)m.envMap=this.scene.environment;else if(m.envMap===oldPaint?.texture)m.envMap=this.paintEnvironmentTarget!.texture;}});
  for(const root of wheels)root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial)this.prepareWheelFinish(m)});
  this.car=gltf.scene;this.prepare(this.car);this.setupFascia();this.vehicleRoot.add(this.car);this.activeWheels=wheel;wheel.userData.variant=config.wheel;this.vehicleRoot.add(wheel);
  if(isN70(this.vehicle))this.car.traverse(o=>{if(o.userData.n70Edition)o.visible=o.userData.n70Edition===vehicleFor(this.vehicle).suffix;});
  if(this.vehicle==='n90'&&projectorGltf){
  this.car.traverse(o=>{
   if(projectorSources.has(o.userData.sourceObject))o.visible=false;
   if(o.userData.sourceObject==='@ME9x1tr5_011')this.roofClickable.add(o);
  });
  this.cabinHatch=CabinHatch.create(this.car);
  const frontCover=repairCabinCeilingTrim(this.car);
  if(frontCover&&this.cabinHatch){this.cabinHatch.attachFixture(frontCover);this.clickable.set(frontCover,'roof');}
  if(this.cabinHatch)this.clickable.set(this.cabinHatch.mesh,'roof');
  this.prepare(projectorGltf.scene);this.projector=new CabinProjector(projectorGltf.scene);this.car.add(projectorGltf.scene);
  this.cabinHatch?.attachFixture(projectorGltf.scene);
  this.cabinFinishes.bind(this.car,this.renderer);this.cabinFinishes.apply(config.interior);
  projectorGltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)this.clickable.set(o,'projector')});
  }else{
   const finishes=isN70(this.vehicle)?this.n70CabinFinishes:this.cabinFinishes;
   finishes.bind(this.car,this.renderer);finishes.apply(config.interior);
   const tv=manifest.television,panel=tv&&this.car.getObjectByName(tv.part);
   if(!tv||!panel)throw new Error(`${vehicleFor(this.vehicle).name} 电视部件缺失`);
   this.projector=new CabinTelevision(panel,tv.poses,tv.focus);
   this.clickable.set(panel,'projector');
   const mount=this.car.getObjectByName(isN70(this.vehicle)?'n70_tv_mount':'n90std_tv_cassette');if(mount)this.clickable.set(mount,'projector');
  }
  this.alignGround(wheel);this.mirrors.setup(this.car);this.wheelMotion.prepareBrakes(this.car);
  const nodes=new Map<string,THREE.Object3D>();this.car.traverse(o=>{if(o.userData.webId)nodes.set(o.userData.webId,o)});
  for(const channel of ['doors','trunk','roof'] as const)for(const [id,poses] of Object.entries(manifest.tracks[channel])){
   const object=nodes.get(id);if(!object)continue;
   const track={object,poses};this.tracks[channel].push(track);
   const group:DoorTrackGroup|'trunk'|undefined=channel==='trunk'?'trunk':channel==='doors'?(manifest.parts[id].opening??doorTrackGroup(manifest.parts[id].source)):undefined;
   if(channel==='doors'&&!group)throw new Error(`Unmapped door animation: ${manifest.parts[id].source}`);
   if(group){this.openingTracks[group].push(track);if(group!=='boardLeft'&&group!=='boardRight')this.clickable.set(object,group);}
  }
  for(const id of openingIds){if(!this.openingTracks[id].length)throw new Error(`Missing opening animation: ${id}`);this.openingTargets[id]=config.doors;}
  this.car.traverse(o=>{if(o instanceof THREE.Mesh)this.pickMeshes.push(o)});
  for(const id of manifest.roofMorphs){nodes.get(id)?.traverse(o=>{if(o instanceof THREE.Mesh&&o.morphTargetInfluences)this.roofMeshes.push(o)})}
  this.applyTrack('doors',0);this.applyTrack('trunk',0);this.applyTrack('roof',0);this.applyPaint(config);this.renderer.shadowMap.needsUpdate=true;this.dirty=true;this.callbacks.onProgress(92);
  this.callbacks.onOpeningsChange({...this.openingTargets});
  // Do not render before compileAsync: that forces synchronous shader linking
  // and used to freeze the loading overlay at 88% during window resizing.
  await this.uploadTextures([this.scene,...wheels]);if(this.disposed)return;
  this.seatSampling.bind([this.car]);await this.seatSampling.update();if(this.disposed)return;
  this.trackMaterials(wheels);
  this.scene.updateMatrixWorld(true);
  await this.mirrors.warm(this.scene,this.camera);if(this.disposed)return;
  // Initialize exact-size mirror images while the loading screen is visible.
  // Their envMap shader variants are then included in asynchronous compilation.
  this.contact.update(this.renderer,this.scene,[this.vehicleRoot]);this.contactDirty=false;
  if(this.groundReflection)this.groundReflection.mesh.visible=false;
  try{this.mirrors.update(this.scene,this.environmentSource!,undefined,true);}finally{if(this.groundReflection)this.groundReflection.mesh.visible=true;}
  this.reflectionDirty=false;
  await this.renderer.compileAsync(this.scene,this.camera);
  if(this.disposed)return;this.callbacks.onProgress(97);
  await this.warmWheels(wheels);
  this.lampGlow.prepare([this.vehicleRoot,...wheels],this.renderer);
  await this.lampGlow.warm(this.renderer,this.scene,this.camera,this.vehicleRoot);
  if(this.disposed)return;this.callbacks.onProgress(99);
  await yieldDuringLoad();if(this.disposed)return;
  this.resize();
  freezeLocalTransforms(this.scene);for(const wheel of wheels)freezeLocalTransforms(wheel);
  this.displayBatch.prepare([this.car,...wheels],this.vehicleRoot,this.renderer.extensions.has('WEBGL_multi_draw')&&this.renderer.extensions.has('EXT_disjoint_timer_query_webgl2'));
  this.displayBatch.setEnabled(!this.reference);this.scene.updateMatrixWorld(true);this.displayBatch.sync(this.vehicleRoot);
  this.scene.matrixWorldAutoUpdate=false;
  await this.mirrors.warm(this.scene,this.camera);if(this.disposed)return;
  await this.renderer.compileAsync(this.scene,this.camera);if(this.disposed)return;
  const seat=seatCamera('driver',this.vehicle)!;
  this.batchCalibration=await calibrateBatching(this.renderer,this.scene,this.displayBatch,this.vehicleRoot,calibrationCameras(this.camera,{...seat,lens:responsiveLens(seat.lens,this.camera.aspect)}),()=>this.disposed);
  if(this.disposed)return;
  // A rejected candidate will never be drawn. Release duplicate GPU buffers
  // instead of keeping them resident on an already memory-heavy mobile scene.
  if(!this.batchCalibration.exterior.enabled&&!this.batchCalibration.interior.enabled)this.displayBatch.dispose();
  this.displayBatch.setEnabled(!this.reference&&this.batchCalibration.exterior.enabled);this.displayBatch.sync(this.vehicleRoot);
  this.ready=true;this.renderer.render(this.scene,this.camera);this.callbacks.onProgress(100);void this.configure(config);
 }
 private trackMaterials(wheels:THREE.Object3D[]=[...this.readyWheels.values()]){
  for(const root of [this.scene,...wheels])root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])trackRenderMaterial(m,this.renderer);});
  for(const b of this.fasciaBindings){trackRenderMaterial(b.body,this.renderer);trackRenderMaterial(b.brushed,this.renderer);}
 }
 private async uploadTextures(roots:THREE.Object3D[]){
  const textures=new Set<THREE.Texture>([...this.cabinFinishes.textures,...this.n70CabinFinishes.textures]);
  for(const root of roots)root.traverse(o=>{if(o instanceof THREE.Mesh){for(const m of Array.isArray(o.material)?o.material:[o.material])for(const value of Object.values(m)){if(value instanceof THREE.Texture&&!value.isRenderTargetTexture)textures.add(value);}}});
  let uploaded=0;
  for(const texture of textures){
   await yieldDuringLoad();if(this.disposed)return;
   this.renderer.initTexture(texture);this.callbacks.onProgress(92+4*(++uploaded)/textures.size);
  }
 }
 private loadWheel(id:WheelId,tireMaps:Promise<void>){
  let promise=this.wheelCache.get(id);
  if(!promise){promise=Promise.all([this.loader.loadAsync(assetUrl(`/models/shared/wheels-${id}.glb`)),tireMaps]).then(([gltf])=>{
   if(this.disposed){this.disposeTree(gltf.scene);return gltf.scene;}
   this.prepare(gltf.scene,true);
   const mounts=this.vehicle==='n90'?undefined:wheelFitments[isN70(this.vehicle)?'n70':'n90-standard'];
   this.wheelMotion.prepareWheels(gltf.scene,mounts);gltf.scene.userData.variant=id;
   gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)this.pickMeshes.push(o)});return gltf.scene;
  }).catch(e=>{this.wheelCache.delete(id);throw e});this.wheelCache.set(id,promise)}
  return promise;
 }
 private async warmWheels(wheels:THREE.Group[]){
  // Compile all unique wheel materials against the real scene's lighting. Clones
  // share geometry/materials and stay outside the displayed scene during awaits.
  const staging=new THREE.Group();for(const wheel of wheels)staging.add(wheel.clone(true));
  // Both fascia finishes keep their own shader uniforms. Prepare both output
  // variants before the controls unlock, including the initially hidden finish.
  for(const binding of this.fasciaBindings)for(const material of [binding.body,binding.brushed]){
   const mesh=binding.mesh.clone(false);
   if(Array.isArray(mesh.material)){mesh.material=[...mesh.material];mesh.material[binding.index]=material;}else mesh.material=material;
   staging.add(mesh);
  }
  await this.renderer.compileAsync(staging,this.camera,this.scene);
  if(this.disposed)return;
  const target=new THREE.WebGLRenderTarget(64,64),previousTarget=this.renderer.getRenderTarget();
  const reflectionVisible=this.groundReflection?.mesh.visible;
  if(this.groundReflection)this.groundReflection.mesh.visible=false;
  try{
   this.renderer.setRenderTarget(target);
   // Offscreen/reflection passes use linear-output shader variants as well.
   await this.renderer.compileAsync(staging,this.camera,this.scene);
   if(this.disposed)return;
   await this.renderer.compileAsync(this.scene,this.camera);
   if(this.disposed)return;
   if(this.activeWheels)this.vehicleRoot.remove(this.activeWheels);
   for(const wheel of wheels){
    this.vehicleRoot.add(wheel);this.renderer.render(this.scene,this.camera);this.vehicleRoot.remove(wheel);
    this.readyWheels.set(wheel.userData.variant as WheelId,wheel);
    await yieldDuringLoad();if(this.disposed)return;
   }
  }finally{
   if(this.activeWheels)this.vehicleRoot.add(this.activeWheels);
   if(this.groundReflection)this.groundReflection.mesh.visible=reflectionVisible??true;
   if(!this.disposed)this.renderer.setRenderTarget(previousTarget);target.dispose();
  }
 }
 private prepareWheelFinish(m:THREE.MeshStandardMaterial){
  if(m.userData.useOriginalTireMap&&String(m.userData.sourceMaterial).includes('轮胎'))return false;
  return configureWheelFinish(m,{studio:this.scene.environment!,wheel:this.wheelEnvironmentTarget?.texture??this.scene.environment!,cover:this.wheelCoverEnvironmentTarget?.texture??this.scene.environment!});
 }
 private alignGround(wheels:THREE.Group){
  const tires:{x:number;points:THREE.Vector3[];low:number}[]=[];
  this.vehicleRoot.updateMatrixWorld(true);
  wheels.traverse(o=>{
   if(!(o instanceof THREE.Mesh))return;
   const materials=Array.isArray(o.material)?o.material:[o.material];
   if(!materials.some(m=>String(m.userData.sourceMaterial??m.name).includes('轮胎')))return;
   const attribute=o.geometry.getAttribute('position'),points:THREE.Vector3[]=[];
   for(let i=0;i<attribute.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(attribute,i).applyMatrix4(o.matrixWorld));
   const box=new THREE.Box3().setFromPoints(points);tires.push({x:(box.min.x+box.max.x)/2,low:box.min.y,points});
  });
  if(tires.length<2)return;
  const mx=tires.reduce((a,t)=>a+t.x,0)/tires.length,my=tires.reduce((a,t)=>a+t.low,0)/tires.length;
  const denominator=tires.reduce((a,t)=>a+(t.x-mx)**2,0);if(denominator<1e-8)return;
  const slope=tires.reduce((a,t)=>a+(t.x-mx)*(t.low-my),0)/denominator;
  const angle=-Math.atan(slope),c=Math.cos(angle),s=Math.sin(angle);
  const bottom=tires.reduce((sum,t)=>sum+Math.min(...t.points.map(v=>s*v.x+c*v.y)),0)/tires.length;
  // Apply one rigid transform to the complete vehicle so doors and their animation tracks stay aligned.
  this.vehicleRoot.rotation.z=angle;this.vehicleRoot.position.y=-.0058-bottom;
  this.vehicleRoot.updateMatrixWorld(true);
 }
 private prepare(root:THREE.Group,sharedWheels=false){
  if(this.vehicle!=='n90'&&!sharedWheels){
   const result=prepareN70(root,{renderer:this.renderer,studio:this.scene.environment!,paint:this.paintEnvironmentTarget!.texture,glass:this.glassEnvironmentTarget?.texture??this.scene.environment!,windowTrim:this.windowTrimEnvironmentTarget!.texture,paintId:this.config?.paint??'blue',tires:this.tireFinish,inscription:this.steeringInscription,sand:(isN70(this.vehicle)?this.n70CabinFinishes:this.cabinFinishes).sand,black:(isN70(this.vehicle)?this.n70CabinFinishes:this.cabinFinishes).black});
   refineCabinNormals(root);
   this.paintMaterials.push(...result.paint);this.fascia.push(...result.fascia);this.lights.push(...result.lights);
   if(result.wordmark)this.frontWordmark=result.wordmark;
   return;
  }
  refineCabinNormals(root);
  prepareCabinControls(root);
  const visited=new Set<THREE.Material>();
  root.updateMatrixWorld(true);
  root.traverse(o=>{
   if(!(o instanceof THREE.Mesh))return;
   o.castShadow=true;o.receiveShadow=false;
   if(o.material instanceof THREE.MeshStandardMaterial&&String(o.material.userData.sourceMaterial??o.material.name).includes('轮胎')){
    // Front and rear carry different tire-size markings, despite sharing the source material.
    const tire=new THREE.MeshPhysicalMaterial();THREE.MeshStandardMaterial.prototype.copy.call(tire,o.material);o.material=tire;o.userData.tireRear=new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).x>0;
   }
   const materials=Array.isArray(o.material)?o.material:[o.material];
   if(String(o.userData.sourceObject).endsWith('@ME9x1tr5_039')&&materials[0] instanceof THREE.MeshStandardMaterial){
    const grille=materials[0].clone();grille.name='WEB_前格栅_哑黑';grille.roughness=.52;grille.metalness=0;grille.envMapIntensity=.10;
    if(grille instanceof THREE.MeshPhysicalMaterial){grille.specularIntensity=.25;grille.clearcoat=0;}o.material=grille;materials[0]=grille;
   }
   if(String(o.userData.sourceObject).endsWith('@ME9x1tr5_044')){
    const original=materials[0];
    if(original instanceof THREE.MeshStandardMaterial){this.frontWordmark=original.clone();o.material=this.frontWordmark;materials[0]=this.frontWordmark;}
   }
   // The tailgate letters used the shared, fully metallic wheel-logo finish.
   // Isolate them before per-material deduplication; front letters stay dark.
   if(String(o.userData.sourceObject).endsWith('@ME9x1tr5_167')&&materials[0] instanceof THREE.MeshStandardMaterial){
    const wordmark=materials[0].clone();wordmark.name='WEB_尾门字标_缎面银色';wordmark.userData.sourceMaterial='尾门字标_缎面银色';
    o.material=wordmark;materials[0]=wordmark;
   }
   for(const m of materials){
    if(!(m instanceof THREE.MeshStandardMaterial))continue;
    const name=m.name;const source=String(m.userData.sourceMaterial??name);
    const windowGlass=name.startsWith('WEB_玻璃');
    const tailLens=source==='尾灯_原厂透光灯罩';
    if(tailLens){o.castShadow=false;o.renderOrder=2;m.transparent=true;m.depthWrite=false;m.side=THREE.FrontSide;}
    if(windowGlass){o.castShadow=false;o.renderOrder=3;m.depthWrite=false;m.side=name.includes('灯罩')?THREE.FrontSide:THREE.DoubleSide;}
    if(visited.has(m))continue;visited.add(m);
    // An explicit map is required: otherwise Three uses scene.environmentIntensity,
    // ignoring the separate material.envMapIntensity settings below.
    m.envMap=this.scene.environment;m.envMapIntensity=studioIntensity;
    if(name==='WEB_前格栅_哑黑')m.envMapIntensity=.1;
    if(String(o.userData.sourceObject).endsWith('@ME9x1tr5_040')){m.color.setRGB(.008,.01,.012);m.metalness=.1;m.roughness=.3;}
    if(tailLens){m.opacity=.1;m.roughness=.12;m.metalness=0;m.envMapIntensity=.65;}
    if(windowGlass){
     m.envMapIntensity=.6;if(m instanceof THREE.MeshPhysicalMaterial){m.clearcoat=.15;m.clearcoatRoughness=.09;m.specularIntensity=.25;}
     if(!name.includes('灯罩'))configureWindowGlass(m,this.glassEnvironmentTarget!.texture,name.includes('隐私')?'privacy':'front');
     if(name.includes('灯罩')){m.opacity=.10;m.metalness=0;m.envMapIntensity=.22;if(m instanceof THREE.MeshPhysicalMaterial){m.clearcoat=.15;m.specularIntensity=.3;}}
    }
    if(name.includes('中控屏_显示面')){m.color.setRGB(.002,.003,.004);m.roughness=.08;m.envMapIntensity=.25;m.emissiveIntensity=1.12;m.toneMapped=false;if(m instanceof THREE.MeshPhysicalMaterial){m.specularIntensity=.06;m.clearcoat=.04;m.clearcoatRoughness=.06;}if(m.emissiveMap)m.emissiveMap.anisotropy=Math.min(16,this.renderer.capabilities.getMaxAnisotropy());}
    if(name.includes('反光结构')){m.color.setRGB(.045,.05,.06);m.metalness=.35;}
    if(name.includes('钢琴黑')){m.metalness=0;m.roughness=.3;m.envMapIntensity=.35;}
    if(m.map)m.map.anisotropy=Math.min(16,this.renderer.capabilities.getMaxAnisotropy());
    if(m.aoMap){m.aoMap.anisotropy=Math.min(16,this.renderer.capabilities.getMaxAnisotropy());m.aoMapIntensity=.8;}
    if(name.includes('棕色内饰'))configureBrownInterior(m,this.steeringInscription,this.cabinFinishes.sand);
    if(m instanceof THREE.MeshPhysicalMaterial){
     if(name==='WEB_FrontFascia'){this.fascia.push(m)}
     else if(source.includes('参考配色')||source.includes('同色后视镜')){
      this.paintMaterials.push(m);
      m.envMap=this.paintEnvironmentTarget!.texture;
      configurePaintLight(m,this.config?.paint??'teal');
     }
    }
    if(name.includes('车灯_白色灯带')||name==='WEB_Rear_LED'||source==='尾灯_细红灯带'){const rear=name==='WEB_Rear_LED'||source==='尾灯_细红灯带';this.lights.push(m);m.userData.onIntensity=rear?.55:1.6;m.emissive.set(rear?'#ef001b':'#e3f1ff');m.emissiveIntensity=m.userData.onIntensity;if(rear){m.color.setRGB(.05,0,.002);m.envMapIntensity=.05;m.metalness=0;m.roughness=.3;m.toneMapped=false;if(m instanceof THREE.MeshPhysicalMaterial){m.specularIntensity=.05;m.clearcoat=0;}}}
    if(name.includes('红色透镜')){m.emissiveIntensity=0;m.color.setRGB(.12,.001,.003);}
    if(source.includes('轮胎'))this.tireFinish.apply(m,Boolean(o.userData.tireRear));
    if(/铬|银色饰条/.test(name)&&this.paintEnvironmentTarget){m.envMap=this.paintEnvironmentTarget.texture;m.envMapIntensity=20;}
    if(source==='制动盘_金属'){m.color.setRGB(.3278,.3372,.3564);m.metalness=.11;m.roughness=.48;m.envMapIntensity=1.5;}
    if(source==='制动卡钳_石墨灰'){m.color.setScalar(.12);m.metalness=.44;m.roughness=.71;m.envMapIntensity=.6;}
    if(source==='尾门字标_缎面银色'){m.color.setRGB(.52,.54,.56);m.metalness=.55;m.roughness=.34;m.envMap=this.scene.environment;m.envMapIntensity=1.8;if(m instanceof THREE.MeshPhysicalMaterial){m.clearcoat=.04;m.clearcoatRoughness=.25;m.specularIntensity=.6;}}
     // The hood base and mi glyph are separate original meshes. They must not
     // share the bright wheel-badge finish, which washes out the lettering.
     if(source==='车头徽标_缎面银底'){m.color.setRGB(.4,.415,.43);m.metalness=.7;m.roughness=.32;m.envMap=this.scene.environment;m.envMapIntensity=1.8;if(m instanceof THREE.MeshPhysicalMaterial){m.clearcoat=.08;m.clearcoatRoughness=.2;}}
     if(source==='车头徽标_mi深色字'){m.color.setRGB(.022,.025,.032);m.metalness=.15;m.roughness=.38;m.envMap=this.scene.environment;m.envMapIntensity=.4;if(m instanceof THREE.MeshPhysicalMaterial){m.clearcoat=0;m.specularIntensity=.3;}}
    // Cabin softboxes illuminate interior surfaces only. RectAreaLight has no shadow occlusion,
    // so exclude its contribution on the exterior to prevent light leaking through the body.
    const interiorSurface=/内饰|内后视镜|中控屏|幕布/.test(source);
    excludeCabinFill(m,interiorSurface?'cabin':(source.includes('参考配色')||source.includes('同色后视镜')?'exterior':'none'));
    m.customProgramCacheKey=()=>name+':official-surfaces-v7-original-quality';
    this.prepareWheelFinish(m);
    if(source==='车窗外框_银白饰条')configureWindowTrim(m,this.windowTrimEnvironmentTarget!.texture);
    configureLowerBodyFinish(m,this.scene.environment!);
    if(isCabinMaterial(name))configureCabinTextureQuality(m,this.renderer);
   }
  });
 }
 async configure(next:Configuration){
  if(this.vehicle!=='n90')next={...next,roof:false,dimensions:vehicleFor(this.vehicle).dimensions&&next.dimensions};
  const previous=this.config;
  // All roof inputs (model clicks, interior tools and exterior tools) share this
  // interlock. Explicitly close projection so it stays stowed after roof travel.
  if(next.projector&&(next.roof||this.projectorBlocked||(previous&&previous.roof!==next.roof))){
   next={...next,projector:false};this.callbacks.onCabinFeatureChange('projector',false);
  }
  this.config={...next};
  this.groundReflection?.invalidate();this.lampGlow.invalidate();
  if(!previous||['paint','wheel','trim','interior','doors','roof','projector','lights'].some(k=>previous[k as keyof Configuration]!==next[k as keyof Configuration])){
   this.mirrors.invalidate(!previous||['wheel','doors','roof','projector'].some(k=>previous[k as keyof Configuration]!==next[k as keyof Configuration])?'all':'interior');this.reflectionDirty=false;
  }
  if(!this.car||!this.ready)return;
  (isN70(this.vehicle)?this.n70CabinFinishes:this.cabinFinishes).apply(next.interior);
  if(previous?.interior!==next.interior)void this.seatSampling.update();
  if(previous?.doors!==next.doors){for(const id of openingIds)this.openingTargets[id]=next.doors;this.publishOpenings();}
  this.applyPaint(next);this.trackMaterials();this.controls.autoRotate=this.view==='exterior'&&!this.viewJourney&&next.autoRotate&&!reducedMotion;this.measurements.visible=this.view==='exterior'&&!this.viewJourney&&next.dimensions;
  if(previous?.autoRotate!==next.autoRotate){
   if(next.autoRotate){this.cancelTween();this.idleDeadline=Infinity;}
   else if(!this.cameraTween)this.armIdle(); // a simultaneous Reset keeps its authored transition
  }
  if(previous?.wheel!==next.wheel||previous?.paint!==next.paint)this.armIdle();
  if(this.view==='exterior'&&!this.viewJourney&&(previous?.dimensions!==next.dimensions||previous?.roof!==next.roof)){const to=HOME.clone();if(next.dimensions)to.copy(DIMENSIONS_VIEW);else if(next.roof)to.set(-18,7.4,23.6);this.moveCamera(to,new THREE.Vector3(0,next.roof&&!next.dimensions?1.25:.733,0))}
  for(const m of this.lights)m.emissiveIntensity=next.lights?m.userData.onIntensity:0;
  this.dirty=true;
  const currentId=this.activeWheels?.userData.variant;
  if(currentId!==next.wheel){
   const group=this.readyWheels.get(next.wheel);if(!group)throw new Error('轮毂资源尚未就绪');
   if(this.activeWheels)this.vehicleRoot.remove(this.activeWheels);this.activeWheels=group;this.vehicleRoot.add(group);
   // A preloaded variant was frozen while detached. Recompute its inherited
   // ground alignment once after reparenting, before presenting its first frame.
   group.updateMatrixWorld(true);
   this.wheelMotion.start(group,reducedMotion);this.renderer.shadowMap.needsUpdate=true;this.contactDirty=true;this.dirty=true;
  }
  this.callbacks.onWheelBusy(false);
 }
 private setupFascia(){
  // Replacing shader hooks on one material leaves Three's cached program bound
  // to an earlier uniform set after brushed -> body -> brushed -> body switches.
  const variants=new Map(this.fascia.map(body=>{
   body.envMap=this.paintEnvironmentTarget!.texture;
   const brushed=body.clone();brushed.name='WEB_FrontFascia_Brushed';
   brushed.color.setRGB(.28,.30,.32);brushed.envMapIntensity=14;brushed.envMapRotation.set(0,.456,0);brushed.metalness=.65;brushed.roughness=.4;brushed.clearcoat=.08;brushed.clearcoatRoughness=.3;brushed.specularColor.setRGB(1,1,1);brushed.specularIntensity=1;
   excludeCabinFill(brushed);brushed.customProgramCacheKey=()=> 'showroom-brushed-fascia';
   return [body,brushed] as const;
  }));
  this.car!.traverse(mesh=>{
   if(!(mesh instanceof THREE.Mesh))return;
   const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   materials.forEach((body,index)=>{const brushed=variants.get(body);if(brushed)this.fasciaBindings.push({mesh,index,body,brushed});});
  });
 }
 private applyPaint(config:Configuration){
  const signature=`${config.paint}:${config.trim}`;if(this.lastPaint===signature)return;this.lastPaint=signature;
  for(const m of this.paintMaterials)configurePaintLight(m,config.paint);
  for(const m of this.fascia)configurePaintLight(m,config.paint);
  for(const binding of this.fasciaBindings){
   const material=binding[config.trim];
   if(Array.isArray(binding.mesh.material))binding.mesh.material[binding.index]=material;else binding.mesh.material=material;
  }
  if(this.frontWordmark){this.frontWordmark.color.set(config.trim==='brushed'?'#0e151b':'#aeb7bd');this.frontWordmark.metalness=config.trim==='brushed'?.1:.85;this.frontWordmark.roughness=.32;}
  this.dirty=true;
 }
 private applyTrack(channel:'doors'|'trunk'|'roof',q:number){
  this.applyPoses(this.tracks[channel],q);
  if(channel==='roof')for(const mesh of this.roofMeshes){
   const weights=mesh.morphTargetInfluences!;weights.fill(0);const f=q*8,index=Math.floor(f),t=f-index;
   if(index>0)weights[index-1]=1-t;if(index<8)weights[index]=t;
   mesh.visible=q>.001;
  }
 }
 private applyPoses(tracks:Track[],q:number){
  for(const track of tracks){
   const f=q*(track.poses.length-1),index=Math.min(track.poses.length-2,Math.floor(f)),t=f-index,a=track.poses[index],b=track.poses[index+1],o=track.object;
   o.position.set(a[0],a[1],a[2]);TEMP_P.set(b[0],b[1],b[2]);o.position.lerp(TEMP_P,t);
   o.quaternion.set(a[3],a[4],a[5],a[6]);TEMP_Q.set(b[3],b[4],b[5],b[6]);o.quaternion.slerp(TEMP_Q,t);
   o.scale.set(a[7],a[8],a[9]);TEMP_S.set(b[7],b[8],b[9]);o.scale.lerp(TEMP_S,t);
   o.updateMatrix();
  }
 }
 private moveCamera(to:THREE.Vector3,target:THREE.Vector3,duration=1.1){
  this.zoom.cancel();this.idleDeadline=Infinity;
  // Consume any remaining drag inertia before the authored camera takes over.
  const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();this.controls.enableDamping=damping;
  const from=new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
  const end=new THREE.Spherical().setFromVector3(to.clone().sub(target));end.theta=from.theta+shortestAngle(from.theta,end.theta);
  this.cameraTween={from,to:end,targetFrom:this.controls.target.clone(),targetTo:target,time:0,duration,started:performance.now()};this.dirty=true;
 }
 setView(destination:ViewMode){
  if(!this.ready||this.viewJourney||this.view===destination)return;
  this.seatJourney=undefined;
  if(destination==='interior')this.interiorSeat='driver';
  this.callbacks.onInteriorSeatChange(this.interiorSeat,false);
  this.zoom.cancel();this.cancelTween();this.clearInteraction();
  if(destination==='interior'){
   this.controls.autoRotate=false;
   const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();this.controls.enableDamping=damping;
   this.exteriorSnapshot={position:this.camera.position.clone(),target:this.controls.target.clone(),rotation:this.camera.quaternion.clone(),lens:this.lens,doorOpen:this.openingTargets.frontLeft};
  }
  if(!this.exteriorSnapshot)return;
  this.closeProjectorForTravel();
  this.controls.enabled=false;this.interiorLook.disable();this.measurements.visible=false;this.updateLabels();
  this.view=destination;
  this.viewJourney={destination,started:performance.now(),from:this.camera.quaternion.clone(),fromLens:this.lens,
   returnPath:cabinPath(this.camera.position,cabinEye),returnDuration:this.camera.position.distanceTo(cabinEye)>.01?1.35:.55,exterior:this.exteriorSnapshot};
  this.updateLens();
  // Enter through the existing animated front door; preserve the user's door state.
  this.openingTargets.frontLeft=true;this.publishOpenings();
  this.callbacks.onViewChange(destination,true);this.dirty=true;
  if(reducedMotion)this.updateViewJourney(performance.now()+6000);
 }
 private updateViewJourney(now:number){
  const journey=this.viewJourney;if(!journey)return;
  if(!reducedMotion&&this.current.projector>0){journey.started=now;return;}
  let seconds=(now-journey.started)/1000;const entering=journey.destination==='interior';
  // A slow frame rate must never let the camera overtake the opening door.
  const threshold=entering?1.8:journey.returnDuration;
  if(!reducedMotion&&seconds>=threshold&&this.openingProgress.frontLeft<1){seconds=threshold;journey.started=now-threshold*1000;}
  const end=entering?4:journey.returnDuration+4;
  const clamp=(t:number)=>THREE.MathUtils.clamp(t,0,1);
  const arc=(t:number)=>{
   // Keep exterior depth precision while the camera is still far from the car.
   // The original plate sits only ~1.3 mm ahead of its mounting surface.
   this.camera.near=.2;
   const from=new THREE.Spherical().setFromVector3(journey.exterior.position.clone().sub(TARGET)),to=new THREE.Spherical().setFromVector3(doorApproach.clone().sub(TARGET));
   this.camera.position.setFromSphericalCoords(THREE.MathUtils.lerp(from.radius,to.radius,t),THREE.MathUtils.lerp(from.phi,to.phi,t),from.theta+shortestAngle(from.theta,to.theta)*t).add(TARGET);
   this.camera.quaternion.slerpQuaternions(journey.exterior.rotation,doorRotation,t);
   const framing=THREE.MathUtils.lerp(from.radius*Math.tan(THREE.MathUtils.degToRad(journey.exterior.lens/2)),to.radius*Math.tan(THREE.MathUtils.degToRad(30)),t);
   this.lens=THREE.MathUtils.radToDeg(2*Math.atan(framing/THREE.MathUtils.lerp(from.radius,to.radius,t)));
  };
  const doorway=(t:number)=>{
   this.camera.near=THREE.MathUtils.lerp(.2,.015,THREE.MathUtils.smoothstep(t,0,.75));
   this.camera.position.copy(doorPath.getPoint(t));this.camera.quaternion.slerpQuaternions(doorRotation,cabinRotation,t);
   this.lens=THREE.MathUtils.lerp(60,cabinLens,t);
  };
  if(entering){if(seconds<1.8)arc(cubicInOut(clamp(seconds/1.8)));else doorway(cubicInOut(clamp((seconds-1.8)/2.2)));}
  else if(seconds<journey.returnDuration){const t=cubicInOut(clamp(seconds/journey.returnDuration));this.camera.position.copy(journey.returnPath.getPoint(t));this.camera.quaternion.slerpQuaternions(journey.from,cabinRotation,t);this.lens=THREE.MathUtils.lerp(journey.fromLens,cabinLens,t);}
  else if(seconds<journey.returnDuration+2.2)doorway(1-cubicInOut(clamp((seconds-journey.returnDuration)/2.2)));
  else arc(1-cubicInOut(clamp((seconds-journey.returnDuration-2.2)/1.8)));
  this.updateLens();this.dirty=true;
  if(seconds>=end){
   this.viewJourney=undefined;
   if(entering){this.camera.position.copy(cabinEye);this.camera.quaternion.copy(cabinRotation);this.interiorLook.enable();}
   else{
    this.camera.position.copy(journey.exterior.position);this.camera.quaternion.copy(journey.exterior.rotation);this.controls.target.copy(journey.exterior.target);
    this.controls.enabled=true;this.controls.autoRotate=!!this.config?.autoRotate&&!reducedMotion;this.controls.update();this.camera.near=.2;
    this.measurements.visible=!!this.config?.dimensions;
   }
   this.openingTargets.frontLeft=journey.exterior.doorOpen;this.publishOpenings();this.idleDeadline=Infinity;
   this.updateLens();this.callbacks.onViewChange(this.view,false);
  }
 }
 setInteriorSeat(id:InteriorSeatId){
  if(!this.ready||this.view!=='interior'||this.viewJourney)return;
  if(id===this.interiorSeat)return;
  const to=seatCamera(id,this.vehicle);if(!to)return;
  this.closeProjectorForTravel();
  const distance=this.camera.position.distanceTo(to.eye);
  this.interiorLook.disable();this.interiorSeat=id;
  this.seatJourney={started:performance.now(),duration:THREE.MathUtils.clamp(.8+distance*.4,1,1.6),
   path:cabinPath(this.camera.position,to.eye),from:this.camera.quaternion.clone(),fromLens:this.lens,to};
  this.callbacks.onInteriorSeatChange(id,true);this.dirty=true;
  if(reducedMotion)this.updateSeatJourney(performance.now()+2000);
 }
 private updateSeatJourney(now:number){
  const journey=this.seatJourney;if(!journey)return;
  if(!reducedMotion&&this.current.projector>0){journey.started=now;return;}
  const q=THREE.MathUtils.clamp((now-journey.started)/(journey.duration*1000),0,1),t=cubicInOut(q);
  this.camera.position.copy(journey.path.getPoint(t));this.camera.quaternion.slerpQuaternions(journey.from,journey.to.rotation,t);
  this.lens=THREE.MathUtils.lerp(journey.fromLens,journey.to.lens,t);this.updateLens();this.dirty=true;
  if(q===1){this.seatJourney=undefined;this.camera.position.copy(journey.to.eye);this.interiorLook.enable(journey.to.lens);this.callbacks.onInteriorSeatChange(this.interiorSeat,false);}
 }
 resetView(){if(this.viewJourney||this.seatJourney)return;if(this.view==='interior'){const seat=seatCamera(this.interiorSeat,this.vehicle);if(!seat)return;this.interiorLook.reset(seat.rotation,seat.lens);this.dirty=true;}else this.moveCamera(HOME.clone(),TARGET.clone())}
 private tick=(now:number):boolean=>{
  if(this.disposed||document.hidden||this.contextUnavailable||!this.ready||this.comparing)return false;
  const dt=Math.min(.05,(now-this.lastTime)/1000||.016);this.lastTime=now;
  if(this.view==='exterior'&&!this.viewJourney&&this.ready&&now>=this.idleDeadline&&!this.pointers.size&&!this.cameraTween&&!this.config?.autoRotate&&!this.config?.roof&&!this.config?.dimensions){
   this.idleDeadline=Infinity;
   const theta=this.controls.getAzimuthalAngle(),view=nearestStandardView(theta),to=standardViewPosition(view,TARGET);
   this.settledView=view.id;
   if(this.camera.position.distanceToSquared(to)>.000001||this.controls.target.distanceToSquared(TARGET)>.000001)this.moveCamera(to,TARGET.clone(),1.5);
  }
  if(this.cameraTween){const a=this.cameraTween;a.time=reducedMotion?1:THREE.MathUtils.clamp((now-a.started)/(a.duration*1000),0,1);const t=a.duration===1.5?cubicInOut(a.time):a.time*a.time*(3-2*a.time);this.controls.target.lerpVectors(a.targetFrom,a.targetTo,t);this.camera.position.setFromSphericalCoords(THREE.MathUtils.lerp(a.from.radius,a.to.radius,t),THREE.MathUtils.lerp(a.from.phi,a.to.phi,t),THREE.MathUtils.lerp(a.from.theta,a.to.theta,t)).add(this.controls.target);this.dirty=true;if(a.time===1)this.cameraTween=undefined}
  if(this.wheelMotion.update(now)){this.groundReflection?.invalidate();this.lampGlow.invalidate();this.reflectionDirty=true;this.dirty=true;if(!this.wheelMotion.active)this.contactDirty=true;}
  if(this.car&&this.config){
   let moved=false;
   for(const id of openingIds){const goal=Number(this.openingTargets[id]),old=this.openingProgress[id];const q=reducedMotion?goal:THREE.MathUtils.clamp(old+Math.sign(goal-old)*dt/1.55,Math.min(old,goal),Math.max(old,goal));
    if(q!==old){this.openingProgress[id]=q;this.applyPoses(this.openingTracks[id],q);moved=true;}
   }
   for(const [board,front,rear]of [['boardLeft','frontLeft','rearLeft'],['boardRight','frontRight','rearRight']] as const){const q=Math.max(this.openingProgress[front],this.openingProgress[rear]);if(q!==this.boardProgress[board]){this.boardProgress[board]=q;this.applyPoses(this.openingTracks[board],q);moved=true;}}
   this.current.doors=openingIds.reduce((sum,id)=>sum+this.openingProgress[id],0)/openingIds.length;
   // Stow the screen before moving a camera through its plane. Travel clears the
   // projection choice, so it stays closed on arrival. It also stays stowed for the entire
   // raised-roof state, including both stages of roof and cover travel.
   const goal=this.config.roof?ROOF_SEQUENCE_SECONDS:0,roofTravelling=!this.roofSettled;
   const projectorGoal=this.viewJourney||this.seatJourney||this.projectorBlocked||roofTravelling?0:Number(this.config.projector),previousProjector=this.current.projector;
   this.current.projector=reducedMotion?projectorGoal:THREE.MathUtils.clamp(previousProjector+Math.sign(projectorGoal-previousProjector)*dt/1.6,Math.min(previousProjector,projectorGoal),Math.max(previousProjector,projectorGoal));
   if(this.projector?.update(this.current.projector,projectorGoal===1,dt,reducedMotion)){this.dirty=true;this.reflectionDirty=true;}
   // The deployed blank frame is still part of the animation. Keep presenting
   // frames through the settling interval, even before brightness starts changing.
   if(this.projector?.playbackSettled===false)this.dirty=true;
   if(projectorGoal===1&&previousProjector===0)this.focusProjector();
   if(previousProjector!==this.current.projector){moved=true;this.reflectionDirty=true;}
   if(this.current.projector===0&&roofTravelling){
    // One reversible timeline enforces: outer roof, then inner cover.
    // Closing traverses it backwards, keeping the roof open until the cover rests.
    const previous=this.roofSequence;
    this.roofSequence=reducedMotion?goal:THREE.MathUtils.clamp(previous+Math.sign(goal-previous)*dt,Math.min(previous,goal),Math.max(previous,goal));
    const roof=THREE.MathUtils.clamp(this.roofSequence/ROOF_LIFT_SECONDS,0,1);
    if(roof!==this.current.roof){this.current.roof=roof;this.applyTrack('roof',roof);}
    this.cabinHatch?.update((this.roofSequence-ROOF_LIFT_SECONDS)/COVER_LIFT_SECONDS);
    if(previous!==this.roofSequence){moved=true;this.reflectionDirty=true;}
   }
   if(moved){this.groundReflection?.invalidate();this.lampGlow.invalidate();this.renderer.shadowMap.needsUpdate=true;this.contactDirty=true;this.dirty=true;}
  }
  let cameraMoving=false;
  if(this.benchmark){this.animateBenchmark(now);cameraMoving=!!this.benchmark;}
  else if(this.viewJourney)this.updateViewJourney(now);
  else if(this.seatJourney)this.updateSeatJourney(now);
  else if(this.view==='interior'){if(this.interiorLook.update(dt)){cameraMoving=true;this.lens=this.interiorLook.fieldOfView;this.updateLens();this.dirty=true;}}
  else{if(this.zoom.update(dt))this.dirty=true;if(this.controls.update()){cameraMoving=true;this.dirty=true;}}
  const rendered=this.dirty;
  if(rendered){this.monitor.beginFrame(now);this.monitor.measure('frameCpuSubmission',()=>this.renderFrame(),false);}
  const continuing=this.reference||!!this.benchmark||!!this.cameraTween||!!this.viewJourney||!!this.seatJourney||this.wheelMotion.active||this.zoom.active||cameraMoving||this.controls.autoRotate||!this.openingsSettled||!this.roofSettled||this.projector?.playbackSettled===false||this.current.projector!==Number(this.config?.projector);
  this.monitor.endFrame(continuing&&rendered);return continuing;
 };
 private renderFrame(){
   const allowed=this.viewJourney?this.batchCalibration.exterior.enabled&&this.batchCalibration.interior.enabled:this.batchCalibration[this.view].enabled;
   this.displayBatch.setEnabled(!this.reference&&!this.batchRejected&&allowed);
   this.scene.updateMatrixWorld();this.camera.updateMatrixWorld();this.displayBatch.sync(this.vehicleRoot);
   // Reflection captures and blur passes belong to the same displayed frame.
   this.renderer.info.reset();
   // Keep the showroom's soft reflection bands balanced while orbiting around the car.
   // The studio stays fixed as the viewer orbits, including mirror capture directions.
   if(this.contactDirty&&this.car&&this.activeWheels){this.monitor.measure('contactShadows',()=>this.contact.update(this.renderer,this.scene,[this.vehicleRoot]));this.contactDirty=false;}
   if((this.reflectionDirty||this.mirrors.hasPending)&&this.car&&this.environmentSource&&!this.viewJourney&&!this.seatJourney&&!this.wheelMotion.active&&this.openingsSettled&&this.roofSettled&&this.current.projector===Number(this.config?.projector)&&this.projector?.playbackSettled!==false){
    if(this.reflectionDirty)this.mirrors.invalidate();
    if(this.groundReflection)this.groundReflection.mesh.visible=false;
    try{this.monitor.measure('mirrors',()=>this.mirrors.update(this.scene,this.environmentSource!,this.camera,this.reference));}finally{if(this.groundReflection)this.groundReflection.mesh.visible=true;}
    this.reflectionDirty=false;
   }
   this.monitor.measure('groundReflection',()=>this.groundReflection?.prepare(this.renderer,this.scene,this.camera));
   this.monitor.measure('mainScene',()=>this.renderer.render(this.scene,this.camera));
   if(this.view==='exterior'&&!this.viewJourney&&this.config?.lights)this.monitor.measure('lampGlow',()=>this.lampGlow.render(this.renderer,this.scene,this.camera,this.vehicleRoot));
   this.updateLabels();this.dirty=false;this.renderedFrames++;
 }
 private get canCompare(){return this.profiling&&this.ready&&!this.contextUnavailable&&!this.comparing&&!this.viewJourney&&!this.seatJourney&&!this.cameraTween&&!this.wheelMotion.active&&this.openingsSettled&&this.roofSettled&&this.current.projector===Number(this.config?.projector)&&this.projector?.playbackSettled!==false;}
 get canMeasure(){return this.canCompare&&this.current.projector===0;}
 startBenchmark(){
  if(!this.canMeasure||this.benchmark)throw new Error('请等待视角和机构动画结束后再测试。');
  this.benchmark={started:performance.now(),phase:0,position:this.camera.position.clone(),rotation:this.camera.quaternion.clone(),target:this.controls.target.clone(),lens:this.lens,openings:{...this.openingTargets},frames:this.renderedFrames};
  this.controls.enabled=false;this.interiorLook.disable();this.idleDeadline=Infinity;this.monitor.reset();this.benchmarkResult=undefined;this.dirty=true;
 }
 private animateBenchmark(now:number){
  const benchmark=this.benchmark;if(!benchmark)return;
  const t=(now-benchmark.started)/1000;
  if(t>=30){this.stopBenchmark(true);return;}
  if(this.view==='exterior'){
   const phase=t<18?0:t<22?1:t<26?2:3;
   if(phase!==benchmark.phase){benchmark.phase=phase;for(const id of openingIds)this.openingTargets[id]=phase%2===1;this.publishOpenings();}
   const home=new THREE.Spherical().setFromVector3(HOME.clone().sub(TARGET)),radius=home.radius*(.85+.15*Math.cos(t*.7));
   this.camera.position.setFromSphericalCoords(radius,home.phi+.20*Math.sin(t*.4),home.theta+.7*Math.sin(t*.6)).add(TARGET);this.camera.lookAt(TARGET);
  }else{
   const seat=seatCamera(this.interiorSeat,this.vehicle);if(!seat)return;
   this.camera.position.copy(seat.eye);const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.7*Math.sin(t*.6)),pitch=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.2*Math.sin(t*.5));
   this.camera.quaternion.copy(seat.rotation).premultiply(yaw).multiply(pitch);this.lens=seat.lens*(1+.08*Math.sin(t*.4));this.updateLens();
  }
  this.dirty=true;
 }
 stopBenchmark(completed=false){
  const b=this.benchmark;if(!b)return;
  this.benchmarkResult={completed,durationSeconds:Number(((performance.now()-b.started)/1000).toFixed(2)),renderedFrames:this.renderedFrames-b.frames,
   scenario:this.view==='exterior'?'orbit-zoom-doors-30s':'cabin-look-zoom-30s',vehicle:this.vehicle,seat:this.interiorSeat,renderPath:this.reference?'reference':'optimized',timings:this.monitor.report()};
  this.benchmark=undefined;this.camera.position.copy(b.position);this.camera.quaternion.copy(b.rotation);this.controls.target.copy(b.target);this.lens=b.lens;this.updateLens();this.openingTargets={...b.openings};this.publishOpenings();
  this.controls.enabled=this.view==='exterior';if(this.view==='interior')this.interiorLook.enable(b.lens);this.lastTime=performance.now();this.monitor.endFrame(false);this.dirty=true;
 }
 getPerformanceReport(){
  return {schemaVersion:1,generatedAt:new Date().toISOString(),userAgent:navigator.userAgent,url:location.href,vehicle:this.vehicle,view:this.view,seat:this.interiorSeat,configuration:this.config,
   renderPath:this.reference?'reference':'optimized',nativePixelRatio:devicePixelRatio,renderPixelRatio:this.renderer.getPixelRatio(),
   viewport:{width:this.host.clientWidth,height:this.host.clientHeight},drawingBuffer:{width:this.renderer.domElement.width,height:this.renderer.domElement.height},
   timing:this.monitor.report(),scheduler:this.scheduler.diagnostics,renderedFrames:this.renderedFrames,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,
   memoryObjects:this.renderer.info.memory,batching:{...this.displayBatch.diagnostics,rejectedByVisualTest:this.batchRejected,calibration:this.batchCalibration},seatSampling:{...this.seatSampling.diagnostics,rejectedByVisualTest:this.cacheRejected},
   mirrors:this.mirrors.diagnostics,groundCaptures:this.groundReflection?.captureCount,lampMask:this.lampGlow.getDiagnostics(),auxiliaryBuffers:{contact:{width:1024,height:512,count:2},ground:{width:512,height:512,count:3},seat:{width:1024,height:1024,type:'FP32',count:this.seatSampling.diagnostics.activeCaches}},
   benchmark:{running:!!this.benchmark,elapsedSeconds:this.benchmark?(performance.now()-this.benchmark.started)/1000:0,lastResult:this.benchmarkResult},comparison:this.comparison};
 }
 private async setReferencePath(reference:boolean){
  this.reference=reference;setRenderSettings(this.renderer,{...renderSettings(this.renderer),reference});
  this.displayBatch.setEnabled(!reference&&!this.batchRejected);this.trackMaterials();
  const materials=new Set<THREE.Material>();for(const root of [this.scene,...this.readyWheels.values()])root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
  for(const material of materials)material.needsUpdate=true;
  await this.seatSampling.update();if(this.disposed)return;
  if(this.cacheRejected)this.seatSampling.disable();
  this.scene.updateMatrixWorld();this.displayBatch.sync(this.vehicleRoot);await this.renderer.compileAsync(this.scene,this.camera);await this.mirrors.warm(this.scene,this.camera);
  this.groundReflection?.invalidate();this.lampGlow.invalidate();this.contactDirty=true;this.mirrors.invalidate();this.reflectionDirty=true;
 }
 private capturePixels(){
  if(this.renderer.getContext().isContextLost())throw new Error('WebGL 正在恢复，请稍后重新比较。');
  this.renderFrame();const canvas=this.renderer.domElement,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
  const context=copy.getContext('2d',{willReadFrequently:true})!;context.drawImage(canvas,0,0);
  if(this.renderer.getContext().isContextLost())throw new Error('WebGL 正在恢复，请稍后重新比较。');
  return {pixels:context.getImageData(0,0,copy.width,copy.height),png:copy.toDataURL('image/png')};
 }
 private comparisonRegions():ImageRegion[]{
  const regions:ImageRegion[]=[],patterns=[['seats',/座椅|坐垫|头枕/],['screens',/中控屏|显示面|电动幕布/],['glass',/车窗|玻璃/],['mirrors',/后视镜.*镜面/],['paint',/参考配色/],['lights',/灯带|大灯/]] as const;
  const point=new THREE.Vector3();
  for(const [name,pattern]of patterns){
   const bounds=new THREE.Box2();let count=0;
   this.car?.traverse(o=>{
    if(!(o instanceof THREE.Mesh)||(Array.isArray(o.material)?o.material:[o.material]).every(m=>!pattern.test(m.name)&&!(name==='paint'&&m.userData.n70Kind==='paint')))return;
    for(let parent:THREE.Object3D|null=o;parent;parent=parent.parent)if(!parent.visible)return;
    o.geometry.computeBoundingBox();const box=o.geometry.boundingBox;if(!box)return;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
     point.set(x,y,z).applyMatrix4(o.matrixWorld).project(this.camera);if(point.z<-1||point.z>1)continue;
     bounds.expandByPoint(new THREE.Vector2((point.x*.5+.5)*this.renderer.domElement.width,(-point.y*.5+.5)*this.renderer.domElement.height));count++;
    }
   });
   if(!count)continue;const x=Math.max(0,bounds.min.x),y=Math.max(0,bounds.min.y),right=Math.min(this.renderer.domElement.width,bounds.max.x),bottom=Math.min(this.renderer.domElement.height,bounds.max.y);
   if(right>x+8&&bottom>y+8)regions.push({name,x,y,width:right-x,height:bottom-y});
  }
  return regions;
 }
 async compareCurrentFrame(){
  if(!this.canCompare||this.benchmark)throw new Error('请等待视角和机构动画结束后再对比。');
  const previous=this.reference;this.comparing=true;this.scheduler.pause();this.monitor.endFrame(false);
  try{
   await this.setReferencePath(true);if(this.disposed)return;
   const baseline=this.capturePixels();await this.setReferencePath(false);if(this.disposed)return;
   let optimized=this.capturePixels();const regions=this.comparisonRegions();
   const evaluate=()=>{const global=compareImages(baseline.pixels,optimized.pixels),local=regions.map(region=>({name:region.name,ssim:compareImages(baseline.pixels,optimized.pixels,region).ssim}));return {...global,regions:local,passed:global.ssim>=.999&&local.every(region=>region.ssim>=.999)};};
   let result=evaluate();const attempts=[{path:'all optimizations',ssim:result.ssim,regions:result.regions}];
   // Failed visual optimizations fall back on this device before the next frame.
   if(!result.passed&&this.displayBatch.diagnostics.enabled){this.batchRejected=true;this.displayBatch.setEnabled(false);this.groundReflection?.invalidate();this.contactDirty=true;this.mirrors.invalidate();optimized=this.capturePixels();result=evaluate();attempts.push({path:'native drawing',ssim:result.ssim,regions:result.regions});}
   if(!result.passed){setRenderSettings(this.renderer,{...renderSettings(this.renderer),staticLights:false});await this.setReferencePath(false);optimized=this.capturePixels();result=evaluate();attempts.push({path:'original light routing',ssim:result.ssim,regions:result.regions});}
   if(!result.passed){this.cacheRejected=true;this.seatSampling.disable();await this.setReferencePath(false);this.mirrors.invalidate();optimized=this.capturePixels();result=evaluate();attempts.push({path:'original seat sampling',ssim:result.ssim,regions:result.regions});}
   if(!result.passed){await this.setReferencePath(true);optimized=this.capturePixels();result=evaluate();attempts.push({path:'reference',ssim:result.ssim,regions:result.regions});}
   this.comparedImages={reference:baseline.png,optimized:optimized.png};
   this.comparison={ssim:result.ssim,passed:result.passed,regions:result.regions,maxChannelDifference:result.maxChannelDifference,width:baseline.pixels.width,height:baseline.pixels.height,modeAfterTest:this.reference?'reference':'optimized',attempts};
   if(previous){await this.setReferencePath(true);this.comparison.modeAfterTest='reference';}
   return this.comparison;
  }finally{this.comparing=false;this.lastTime=performance.now();this.dirty=true;this.resumeRendering();}
 }
 downloadComparedImage(kind:'reference'|'optimized'){const url=this.comparedImages?.[kind];if(!url)return;const anchor=document.createElement('a');anchor.href=url;anchor.download=`${this.vehicle}-${this.view}-${kind}.png`;anchor.click();}
 private project(point:THREE.Vector3,element:HTMLElement){
  TEMP_P.copy(point).project(this.camera);element.style.left=`${(TEMP_P.x*.5+.5)*this.host.clientWidth}px`;element.style.top=`${(-TEMP_P.y*.5+.5)*this.host.clientHeight}px`;return TEMP_P.z>=-1&&TEMP_P.z<=1;
 }
 private updateLabels(){
  for(const label of this.labels){label.element.hidden=this.view!=='exterior'||!!this.viewJourney||!this.config?.dimensions;if(!label.element.hidden)this.project(label.point,label.element)}
 }
 downloadScreenshot(config:Configuration){
  // Capture immediately after rendering: no persistent drawing buffer is needed.
  this.dirty=true;this.tick(performance.now());const anchor=document.createElement('a');anchor.href=this.renderer.domElement.toDataURL('image/png');anchor.download=`${this.vehicle}-${config.paint}-${config.wheel}.png`;anchor.click();
 }
 getDiagnostics(){return {performance:{frames:this.renderedFrames,groundCaptures:this.groundReflection?.captureCount??0,lampMask:this.lampGlow.getDiagnostics()},vehicle:this.vehicle,view:this.view,interiorSeat:this.interiorSeat,displayProgress:this.current.projector,television:this.projector instanceof CabinTelevision?this.projector.getDiagnostics():undefined,loaded:!!this.car,ready:this.ready,paint:this.config?.paint,wheel:this.activeWheels?.userData.variant,preloadedWheels:[...this.readyWheels.keys()],wheelMotion:this.wheelMotion.getDiagnostics(),idle:{pending:Number.isFinite(this.idleDeadline),view:this.settledView,animating:!!this.cameraTween},paintMaterials:this.paintMaterials.length,fasciaMaterials:this.fascia.length,morphMeshes:this.roofMeshes.length,doors:this.current.doors,openings:{...this.openingProgress},openingTargets:{...this.openingTargets},boards:{...this.boardProgress},openingsSettled:this.openingsSettled,roof:this.current.roof,camera:this.camera.position.toArray(),zoom:this.zoom.getDiagnostics(),drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,memory:this.renderer.info.memory}}
 private disposeTree(root:THREE.Object3D){
  const textures=new Set<THREE.Texture>(),materials=new Set<THREE.Material>(),geometries=new Set<THREE.BufferGeometry>();
  root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m)){if(value instanceof THREE.Texture)textures.add(value)}}}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;this.scheduler.dispose();this.monitor.dispose();this.displayBatch.dispose();this.seatSampling.dispose();this.viewJourney=undefined;this.idleDeadline=Infinity;this.size.disconnect();document.removeEventListener('visibilitychange',this.visibilityChanged);this.zoom.dispose();this.interiorLook.dispose();this.wheelMotion.dispose();this.controls.dispose();
  this.renderer.domElement.removeEventListener('lostpointercapture',this.pointerCancel);window.removeEventListener('blur',this.clearInteraction);this.readyWheels.clear();
  this.renderer.domElement.removeEventListener('pointerdown',this.pointerDown);this.renderer.domElement.removeEventListener('pointerup',this.pointerUp);this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost);this.renderer.domElement.removeEventListener('webglcontextrestored',this.contextRestored);
  this.renderer.domElement.removeEventListener('pointermove',this.pointerMove);this.renderer.domElement.removeEventListener('pointercancel',this.pointerCancel);this.pickMeshes=[];this.pointers.clear();
  for(const l of this.labels)l.element.remove();this.disposeTree(this.scene);if(this.scene.background instanceof THREE.Texture)this.scene.background.dispose();
  this.steeringInscription?.dispose();this.cabinFinishes.dispose();this.n70CabinFinishes.dispose();
  for(const m of new Set(this.fasciaBindings.flatMap(b=>[b.body,b.brushed])))m.dispose();this.fasciaBindings=[];
  for(const promise of this.wheelCache.values())void promise.then(g=>{if(g!==this.activeWheels)this.disposeTree(g)}).catch(()=>{});
  this.mirrors.dispose();this.tireFinish.dispose();this.contact.dispose();this.groundReflection?.dispose();this.lampGlow.dispose();this.environmentTarget?.dispose();this.paintEnvironmentTarget?.dispose();this.glassEnvironmentTarget?.dispose();this.wheelEnvironmentTarget?.dispose();this.wheelCoverEnvironmentTarget?.dispose();this.windowTrimEnvironmentTarget?.dispose();this.environmentSource?.dispose();this.renderer.dispose();this.renderer.domElement.remove();
  // Each vehicle owns its canvas. Release the retired context immediately so
  // model changes do not retain its drawing buffers until garbage collection.
  this.renderer.forceContextLoss();
 }
}

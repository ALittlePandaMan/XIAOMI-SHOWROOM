import {lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {assetUrl} from './assetUrl';
import {Outlet,useLocation,useMatch,useNavigate} from 'react-router-dom';
import {defaults,interiors} from './config';
import type {Configuration,PaintId,WheelId} from './config';
import Icon from './Icons';
import type {IconName} from './Icons';
import type {Showroom} from './Showroom';
import type {ViewMode} from './InteriorCamera';
import {vehicleInteriorSeats} from './InteriorSeats';
import type {InteriorSeatId} from './InteriorSeats';
import {closedOpenings,openingIds,openingLabels} from './vehicleOpenings';
import type {OpeningState} from './vehicleOpenings';
import {readSelection,selectionHash} from './showroomLocation';
import type {VehicleFeatures,VehicleSelection} from './showroomLocation';
import VehiclePicker from './VehiclePicker';
import {readVehicle,vehicleFor,vehicleDefaults,vehicleInteriors,vehicleWheels,vehiclePaints,supportsBrushedTrim} from './vehicles';
import type {VehicleId} from './vehicles';
const PerformancePanel=lazy(()=>import('./PerformancePanel'));

export default function App(){
 const location=useLocation(),vehicleId=readVehicle(location.search);
 // Isolate feature state and in-flight model loads for each vehicle.
 return <VehicleShowroom key={vehicleId} vehicleId={vehicleId}/>;
}
function VehicleShowroom({vehicleId}:{vehicleId:VehicleId}){
 const vehicle=vehicleFor(vehicleId),wheels=vehicleWheels(vehicleId),paints=vehiclePaints(vehicleId);
 useEffect(()=>{document.title=`${vehicle.name} · 3D 展厅`},[vehicle.name]);
 const location=useLocation(),navigate=useNavigate();
 const requestedView:ViewMode=useMatch('/interior')?'interior':'exterior';
 const selection=useMemo(()=>readSelection(location.hash,vehicleId),[location.hash,vehicleId]);
 const [features,setFeatures]=useState<VehicleFeatures>(()=>({doors:defaults.doors,roof:defaults.roof,projector:defaults.projector,dimensions:defaults.dimensions,lights:defaults.lights,autoRotate:defaults.autoRotate}));
 const config=useMemo<Configuration>(()=>({...features,...selection}),[features,selection]);
 const host=useRef<HTMLDivElement>(null),viewer=useRef<Showroom|null>(null),configRef=useRef(config);
 const [progress,setProgress]=useState(0),[ready,setReady]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[wheelBusy,setWheelBusy]=useState(false),[retry,setRetry]=useState(0);
 const noticeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const [openings,setOpenings]=useState(closedOpenings);
 const [view,setView]=useState<ViewMode>('exterior'),[viewBusy,setViewBusy]=useState(false);
 const [interiorSeat,setInteriorSeat]=useState<InteriorSeatId>('driver'),[seatBusy,setSeatBusy]=useState(false);
 const onViewChange=useCallback((mode:ViewMode,transitioning:boolean)=>{setView(mode);setViewBusy(transitioning)},[]);
 const onInteriorSeatChange=useCallback((seat:InteriorSeatId,transitioning:boolean)=>{setInteriorSeat(seat);setSeatBusy(transitioning)},[]);
 const onCabinFeatureChange=useCallback((feature:'roof'|'projector',open:boolean)=>setFeatures(c=>({...c,[feature]:open})),[]);
 const [isFullscreen,setIsFullscreen]=useState(()=>!!document.fullscreenElement);
 const onOpeningsChange=useCallback((state:OpeningState)=>{setOpenings(state);const doors=Object.values(state).some(Boolean);setFeatures(c=>c.doors===doors?c:{...c,doors});},[]);
 const notify=useCallback((message:string)=>{setNotice(message);clearTimeout(noticeTimer.current);noticeTimer.current=setTimeout(()=>setNotice(''),3500)},[]);
 useEffect(()=>{
  let cancelled=false;let instance:Showroom|undefined;
  setReady(false);setError('');setProgress(0);setView('exterior');setViewBusy(false);setInteriorSeat('driver');setSeatBusy(false);
  import('./Showroom').then(async({Showroom})=>{
   if(cancelled||!host.current)return;
   instance=new Showroom(host.current,{onProgress:setProgress,onWheelBusy:setWheelBusy,onOpeningsChange,onViewChange,onInteriorSeatChange,onCabinFeatureChange},vehicleId);viewer.current=instance;if(import.meta.env.DEV)Object.assign(window,{__showroom:instance});
   await instance.load(configRef.current);if(!cancelled){setReady(true);setProgress(100)}
  }).catch(e=>{if(!cancelled){console.error(e);setError('3D 展厅暂时未能加载，请重试。若仍失败，请确认浏览器已开启硬件加速。')}});
  return()=>{cancelled=true;instance?.dispose();viewer.current=null};
 },[retry,vehicleId,onOpeningsChange,onViewChange,onInteriorSeatChange,onCabinFeatureChange]);
 useEffect(()=>{
  configRef.current=config;
  if(ready)void viewer.current?.configure(config).catch(()=>notify('轮毂加载失败，请重新选择。'));
 },[config,ready,notify]);
 useEffect(()=>{
  // Back/forward may arrive during the camera journey. Apply the latest route on arrival.
  if(ready&&!viewBusy)viewer.current?.setView(requestedView);
 },[ready,requestedView,viewBusy]);
 useEffect(()=>()=>clearTimeout(noticeTimer.current),[]);
 useEffect(()=>{const sync=()=>setIsFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync)},[]);
 const updateSelection=(changes:Partial<VehicleSelection>)=>void navigate({pathname:location.pathname,search:location.search,hash:selectionHash({...selection,...changes})},{replace:true,state:location.state});
 const changeVehicle=(id:VehicleId)=>{
  if(id===vehicleId)return;
  const params=new URLSearchParams(location.search);if(id!=='n90')params.set('model',id);else params.delete('model');
  void navigate({pathname:location.pathname,search:params.toString(),hash:selectionHash(vehicleDefaults(id))});
 };
 const choosePaint=(paint:PaintId)=>updateSelection({paint,trim:supportsBrushedTrim(paint)?config.trim:'body'});
 const chooseWheel=(wheel:WheelId)=>updateSelection({wheel});
 const changePage=(mode:ViewMode)=>{if(mode!==requestedView)void navigate({pathname:`/${mode}`,search:location.search,hash:selectionHash(selection)})};
 const toggle=(key:'roof'|'doors'|'dimensions')=>setFeatures(c=>({...c,[key]:!c[key]}));
 const fullscreen=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{notify('当前窗口不支持全屏，请使用浏览器全屏模式。')}};
 const paint=paints.find(p=>p.id===config.paint)!;
 const tool=(name:IconName,label:string,onClick:()=>void,active=false,unavailable=false)=><button className={`tool ${active?'active':''}`} aria-label={label} aria-pressed={active} onClick={onClick} disabled={!ready||viewBusy||seatBusy||unavailable}><Icon name={name} active={active}/></button>;
 return <main className="showroom fixed inset-0 overflow-hidden text-white" data-view={view} data-vehicle={vehicleId} aria-busy={!ready||viewBusy}>
  <div ref={host} className="absolute inset-0 touch-none" aria-label={view==='interior'?`车内 3D 展示：点击门板或${vehicle.display}开关，拖动环视，滚轮或双指缩放`:'车辆 3D 展示：点击车门或后备箱开关，拖动旋转，滚轮或双指缩放'}/>
  <div className="stage-shade pointer-events-none absolute inset-0"/>
  <header className="header absolute inset-x-0 top-0 flex items-center justify-between">
   <VehiclePicker value={vehicleId} onChange={changeVehicle}/>
   <nav className="top-nav flex items-center" aria-label="展厅栏目">{([['exterior','外观'],['interior','内饰']] as const).map(([mode,label])=><button key={mode} type="button" className={requestedView===mode?'nav-active':''} aria-current={requestedView===mode?'page':undefined} disabled={!ready||viewBusy} onClick={()=>changePage(mode)}>{label}</button>)}</nav>
  </header>
  <div className={view==='interior'?'interior-toolbar':'exterior-toolbar'}>
  {view==='interior'&&<div className="interior-seats control-panel" role="group" aria-label="座位视角" aria-busy={seatBusy}>
   {vehicleInteriorSeats(vehicleId).map(seat=><button key={seat.id} type="button" aria-pressed={interiorSeat===seat.id} disabled={!ready||viewBusy} onClick={()=>viewer.current?.setInteriorSeat(seat.id)}>{seat.label}</button>)}
  </div>}
  <div className="utility-tools">
   {view==='exterior'&&<div className="left-tools control-panel" role="group" aria-label="车辆功能">
   {vehicle.roof&&<>{tool('roof',config.roof?'收起升顶帐篷':'展开升顶帐篷',()=>toggle('roof'),config.roof)}<i/></>}
   {tool('doors',config.doors?'关闭车门和尾门':'打开车门和尾门',()=>toggle('doors'),config.doors)}
   {vehicle.dimensions&&<><i/>{tool('ruler',config.dimensions?'隐藏车身尺寸':'显示车身尺寸',()=>toggle('dimensions'),config.dimensions)}</>}
   </div>}
   <div className="right-tools control-panel" role="group" aria-label={view==='interior'?'车内功能与视图控制':'视图控制'}>
    {view==='interior'&&<>
     {vehicle.roof&&tool('roof',config.roof?'收起升顶帐篷':'展开升顶帐篷',()=>viewer.current?.toggleCabinFeature('roof'),config.roof)}
     {tool('projector',`${config.projector?'关闭':'打开'}${vehicle.display}`,()=>viewer.current?.toggleCabinFeature('projector'),config.projector,config.roof)}
    </>}
    {tool('expand',isFullscreen?'退出全屏':'全屏展示',()=>void fullscreen(),isFullscreen)}
    {tool('reset','恢复默认视角',()=>{viewer.current?.resetView();setFeatures(c=>({...c,autoRotate:false}))})}
   </div>
  </div>
  </div>
  {view==='interior'&&<div className="interior-colors option-group" role="group" aria-label="内饰配色">
   {vehicleInteriors(vehicleId).map(interior=><div className="option" key={interior.id}><button type="button" className={`swatch ${config.interior===interior.id?'selected':''}`} aria-label={interior.name} aria-pressed={config.interior===interior.id} disabled={!ready||viewBusy} onClick={()=>updateSelection({interior:interior.id})}><img src={assetUrl(interior.image)} alt="" draggable={false}/></button><span className={`option-label ${config.interior===interior.id?'visible':''}`}>{interior.name}</span></div>)}
  </div>}
  {view==='exterior'&&<section className={`configuration ${ready?'loaded':''} ${viewBusy?'transitioning':''}`} aria-label="外观配置" inert={viewBusy}>
   <div className="option-group paint-group" role="group" aria-label="车身颜色">{paints.map(p=><div className="option" key={p.id}><button className={`swatch ${p.id===config.paint?'selected':''}`} aria-label={p.name} aria-pressed={p.id===config.paint} onClick={()=>choosePaint(p.id)} disabled={!ready}><img src={assetUrl(p.image)} alt="" draggable={false}/></button><span className={`option-label ${p.id===config.paint?'visible':''}`}>{p.name}</span></div>)}</div>
   <div className="option-divider"/>
   <div className="option-group wheel-group" role="group" aria-label="轮毂款式" aria-busy={wheelBusy}>{wheels.map(w=><div className="option" key={w.id}><button className={`wheel-swatch ${w.id===config.wheel?'selected':''}`} aria-label={w.name} aria-pressed={w.id===config.wheel} onClick={()=>chooseWheel(w.id)} disabled={!ready}><img src={assetUrl(w.image)} alt="" draggable={false}/><span className={wheelBusy&&w.id===config.wheel?'wheel-spinner':''}/></button><span className={`option-label ${w.id===config.wheel?'visible':''}`}>{w.name}</span></div>)}</div>
   <div className="option-divider"/>
   <div className="option-group trim-group" role="group" aria-label="前脸饰板">{(['body','brushed'] as const).map(t=><div className="option" key={t}><button className={`trim-swatch ${t} ${config.trim===t?'selected':''}`} aria-label={t==='body'?'车身同色饰板':'金属拉丝饰板'} aria-pressed={config.trim===t} disabled={!ready} onClick={()=>{if(t==='brushed'&&!supportsBrushedTrim(config.paint)){notify('金属拉丝饰板搭配远山青或蝴蝶谷蓝');return}updateSelection({trim:t})}}><img src={assetUrl(`/images/official/trim-${t}.png`)} alt="" draggable={false}/></button><span className={`option-label ${config.trim===t?'visible':''}`}>{t==='body'?'车身同色饰板':'金属拉丝饰板'}</span></div>)}</div>
  </section>}
  <p className="sr-only" aria-live="polite">当前配置：{paint.name}，{wheels.find(w=>w.id===config.wheel)?.name}，{config.trim==='brushed'?'金属拉丝饰板':'车身同色饰板'}，{interiors.find(i=>i.id===config.interior)?.name}内饰</p>
  <p className="sr-only" aria-live="polite">{openingIds.filter(id=>openings[id]).map(id=>openingLabels[id]).join('、')||'所有车门及后备箱'}{Object.values(openings).some(Boolean)?'已打开':'已关闭'}</p>
  {notice?<div className="toast" role="status">{notice}</div>:null}
  {!ready?<div className="loading-screen"><div className="loading-brand">{vehicle.badge}<span className={vehicle.suffix==='Pro'?'brand-pro':undefined}>{vehicle.suffix}</span></div><p>{error?'加载未完成':'正在驶入展厅'}</p>{error?<><p className="loading-error">{error}</p><button className="ghost-button" onClick={()=>setRetry(r=>r+1)}>重新加载</button></>:<><div className="loading-line"><span style={{width:`${progress}%`}}/></div><span className="loading-progress">{Math.round(progress)}%</span></>}</div>:null}
  <Outlet/>
  {new URLSearchParams(location.search).get('perf')==='1'&&<Suspense fallback={null}><PerformancePanel viewer={viewer} ready={ready}/></Suspense>}
 </main>;
}

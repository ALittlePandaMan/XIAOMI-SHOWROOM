import {useEffect,useRef,useState} from 'react';
import {vehicles,vehicleFor} from './vehicles';
import type {VehicleId} from './vehicles';

export default function VehiclePicker({value,onChange}:{value:VehicleId;onChange:(id:VehicleId)=>void}){
 const vehicle=vehicleFor(value);
 const [open,setOpen]=useState(false),[family,setFamily]=useState<'N90'|'N70'>(vehicle.badge);
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  const panel=dialog.current;
  if(open)panel?.showModal();else panel?.close();
  return()=>panel?.close();
 },[open]);
 const close=()=>{setOpen(false);trigger.current?.focus()};
 return <div className="vehicle-picker">
  <button ref={trigger} className="brand vehicle-trigger" type="button" aria-label={`切换车型，当前 ${vehicle.name}`} aria-haspopup="dialog" aria-expanded={open} aria-controls="vehicle-drawer" onClick={()=>{setFamily(vehicle.badge);setOpen(true)}}>
   <span>{vehicle.badge}<span className={vehicle.suffix==='Max'?'brand-max':'brand-pro'}>{vehicle.suffix}</span></span>
   {vehicle.edition&&<span className="brand-edition">{vehicle.edition}</span>}
   <svg className="vehicle-chevron" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg>
   <span className="brand-exterior">3D 展厅</span>
  </button>
  <dialog ref={dialog} id="vehicle-drawer" className="vehicle-drawer" aria-labelledby="vehicle-drawer-title" onCancel={e=>{e.preventDefault();close()}} onClose={()=>setOpen(false)} onClick={e=>{
   if(e.target!==e.currentTarget)return;
   const bounds=e.currentTarget.getBoundingClientRect();
   if(e.clientX<bounds.left||e.clientX>bounds.right||e.clientY<bounds.top||e.clientY>bounds.bottom)close();
  }}>
   <div className="vehicle-drawer-header">
    <h2 id="vehicle-drawer-title">切换车型</h2>
    <button className="vehicle-drawer-close" type="button" aria-label="关闭车型选择" onClick={close}><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M20 4 4 20" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></button>
   </div>
   <div className="vehicle-drawer-columns">
    <div className="vehicle-families" role="tablist" aria-label="车系" aria-orientation="vertical">
     {(['N90','N70'] as const).map((name,index)=><button key={name} id={`vehicle-family-${name}`} type="button" role="tab" aria-selected={family===name} aria-controls="vehicle-options" tabIndex={family===name?0:-1} onClick={()=>setFamily(name)} onKeyDown={e=>{
      if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
      e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?1:1-index;
      setFamily(next===0?'N90':'N70');
      e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
     }}>{name}</button>)}
    </div>
    <div id="vehicle-options" className="vehicle-options" role="tabpanel" aria-labelledby={`vehicle-family-${family}`}>
     {vehicles.filter(v=>v.badge===family).map(v=><button key={v.id} type="button" aria-label={v.name} aria-pressed={v.id===value} onClick={()=>{close();onChange(v.id)}}>
      <span className="vehicle-option-name">{v.badge}<span className={v.suffix==='Max'?'brand-max':'brand-pro'}>{v.suffix}</span></span>
      {v.edition&&<span className="vehicle-option-edition">{v.edition}</span>}
     </button>)}
    </div>
   </div>
  </dialog>
 </div>;
}

import {useEffect,useState} from 'react';
import type {RefObject} from 'react';
import type {Showroom} from './Showroom';
import './performance.css';

export default function PerformancePanel({viewer,ready}:{viewer:RefObject<Showroom|null>;ready:boolean}){
 const [report,setReport]=useState<ReturnType<Showroom['getPerformanceReport']>>();
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[collapsed,setCollapsed]=useState(false);
 useEffect(()=>{const update=()=>{if(viewer.current)setReport(viewer.current.getPerformanceReport());};update();const id=window.setInterval(update,1000);return()=>window.clearInterval(id);},[viewer,ready]);
 const mode=report?.renderPath??'optimized',timing=report?.timing,benchmark=report?.benchmark;
 const url=new URL(location.href);url.searchParams.set('perf','1');if(mode==='optimized')url.searchParams.set('reference','1');else url.searchParams.delete('reference');
 const exportReport=()=>{
  const data=viewer.current?.getPerformanceReport();if(!data)return;
  const href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),anchor=document.createElement('a');anchor.href=href;anchor.download=`showroom-${data.vehicle}-${data.view}-${data.renderPath}-${Date.now()}.json`;anchor.click();window.setTimeout(()=>URL.revokeObjectURL(href),1000);
 };
 const compare=async()=>{if(!viewer.current)return;setBusy(true);setNotice('正在用同一相机、同一分辨率比较…');try{const result=await viewer.current.compareCurrentFrame();setNotice(result?`SSIM ${result.ssim.toFixed(6)} · ${result.passed?'通过':'未通过'} · ${result.modeAfterTest==='optimized'?'保留优化':'使用参考路径'}`:'测试已取消');}catch(error){setNotice(error instanceof Error?error.message:String(error));}finally{setBusy(false);if(viewer.current)setReport(viewer.current.getPerformanceReport());}};
 const start=()=>{try{viewer.current?.startBenchmark();setNotice('30 秒固定轨迹测试中，请勿操作车辆。');}catch(error){setNotice(error instanceof Error?error.message:String(error));}};
 return <aside className={`performance-panel ${collapsed?'performance-collapsed':''}`} aria-label="性能诊断">
  <div className="performance-heading"><strong>性能诊断 · {mode==='optimized'?'优化':'参考'}</strong><button onClick={()=>setCollapsed(v=>!v)} aria-label={collapsed?'展开性能诊断':'收起性能诊断'}>{collapsed?'展开':'收起'}</button></div>
  {!collapsed&&<>
   <p>{benchmark?.running?`测试 ${Math.min(30,benchmark.elapsedSeconds).toFixed(0)} / 30 秒`:report?.scheduler.framePending?'渲染中':'空闲'} · {timing?.estimatedFps===null||timing?.estimatedFps===undefined?'尚无连续帧样本':`${timing.estimatedFps} FPS（最近样本）`}</p>
   <p>DPR {report?.renderPixelRatio} · {report?.drawingBuffer.width}×{report?.drawingBuffer.height} · {report?.drawCalls} 次绘制</p>
   <div className="performance-actions">
    <button disabled={!ready||busy||!!benchmark?.running} onClick={start}>运行 30 秒测试</button>
    <button disabled={!benchmark?.running} onClick={()=>viewer.current?.stopBenchmark()}>停止测试</button>
    <button disabled={!report||busy} onClick={exportReport}>导出报告</button>
    <button disabled={!ready||busy||!!benchmark?.running} onClick={()=>void compare()}>对比当前画面</button>
    {report?.comparison&&<><button onClick={()=>viewer.current?.downloadComparedImage('reference')}>下载参考截图</button><button onClick={()=>viewer.current?.downloadComparedImage('optimized')}>下载优化截图</button></>}
   </div>
   <a href={url.href}>重新加载为{mode==='optimized'?'参考':'优化'}模式</a>
   <p className="performance-note">两种模式保持相同模型、贴图、分辨率与效果。报告仅下载到本机；CPU 提交耗时不代表 GPU 耗时。</p>
   <p role="status">{notice.startsWith('30 秒固定')&&!benchmark?.running&&benchmark?.lastResult?'测试已结束，可以导出报告。':notice}</p>
   <details><summary>原始测量数据</summary><pre id="performance-report">{JSON.stringify(report,null,2)}</pre></details>
  </>}
 </aside>;
}
